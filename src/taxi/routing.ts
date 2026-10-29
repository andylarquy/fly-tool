import { Runway } from "../domain/Airport";
import { GeoPoint } from "../domain/GeoPoint";
import { TaxiLeg } from "../domain/Taxi";
import { ParkingSpot, TaxiNetwork, TaxiPoint, TaxiSegment } from "../domain/TaxiNetwork";
import { distanceFeet, distanceToSegmentFeet } from "../utils/geo";

// An aircraft farther than this from every taxi segment is not considered to
// be on the taxi network at all (for example, airborne or on the grass).
export const LOCATE_RADIUS_FEET = 150;
export const HOLD_SHORT_RADIUS_FEET = 120;

// A route that crosses a runway has to be clearly worse than one that does
// not before the planner will choose it.
const CROSSING_PENALTY_FEET = 3_000;

export interface TaxiRoute {
  pointIds: number[];
  legs: TaxiLeg[];
  lengthFeet: number;
}

export interface RunwayCrossing {
  startIndex: number;
  endIndex: number;
}

const pointById = (network: TaxiNetwork, id: number): TaxiPoint | undefined =>
  network.points.find((point) => point.id === id);

const segmentBetween = (
  network: TaxiNetwork,
  a: number,
  b: number,
): TaxiSegment | undefined =>
  network.segments.find(
    (segment) =>
      (segment.from === a && segment.to === b) ||
      (segment.from === b && segment.to === a),
  );

const RUNWAY_PATTERN = /^(\d{1,2})([LRC]?)$/;
const RECIPROCAL_SIDE: Record<string, string> = { L: "R", R: "L", C: "C", "": "" };

// 23 and 05 are the two ends of one runway, as are 05L and 23R.
export const sameRunway = (a: string, b: string): boolean => {
  if (a === b) {
    return true;
  }

  const first = RUNWAY_PATTERN.exec(a);
  const second = RUNWAY_PATTERN.exec(b);

  if (!first || !second) {
    return false;
  }

  const reciprocal = ((Number(first[1]) + 17) % 36) + 1;

  return Number(second[1]) === reciprocal && second[2] === RECIPROCAL_SIDE[first[2]];
};

export const nearestPoint = (
  network: TaxiNetwork,
  position: GeoPoint,
  maxFeet = LOCATE_RADIUS_FEET,
): TaxiPoint | undefined => {
  let best: TaxiPoint | undefined;
  let bestDistance = maxFeet;

  for (const point of network.points) {
    const distance = distanceFeet(position, point.position);

    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
};

// Snaps to the nearest segment, not the nearest vertex: on a long straight
// taxiway the vertices can be hundreds of feet apart.
export const locateOnNetwork = (
  network: TaxiNetwork,
  position: GeoPoint,
  maxFeet = LOCATE_RADIUS_FEET,
): { from: TaxiPoint; to: TaxiPoint } | undefined => {
  let best: { from: TaxiPoint; to: TaxiPoint } | undefined;
  let bestDistance = maxFeet;

  for (const segment of network.segments) {
    const from = pointById(network, segment.from);
    const to = pointById(network, segment.to);

    if (!from || !to) {
      continue;
    }

    const distance = distanceToSegmentFeet(position, from.position, to.position);

    if (distance <= bestDistance) {
      best = { from, to };
      bestDistance = distance;
    }
  }

  return best;
};

export const isOnNetwork = (network: TaxiNetwork, position: GeoPoint): boolean =>
  locateOnNetwork(network, position) !== undefined;

// Of all the hold lines serving a runway, the one nearest its own threshold:
// a full-length departure, not an intersection one.
export const holdShortPointFor = (
  network: TaxiNetwork,
  runway: Runway,
): TaxiPoint | undefined =>
  network.points
    .filter((point) => point.holdShortRunway === runway.designator)
    .sort(
      (a, b) =>
        distanceFeet(a.position, runway.threshold) -
        distanceFeet(b.position, runway.threshold),
    )[0];

export const holdingShortRunway = (
  network: TaxiNetwork,
  position: GeoPoint,
): string | undefined =>
  nearestPoint(
    { ...network, points: network.points.filter((p) => p.holdShortRunway) },
    position,
    HOLD_SHORT_RADIUS_FEET,
  )?.holdShortRunway;

export const nearestParking = (
  network: TaxiNetwork,
  position: GeoPoint,
): ParkingSpot | undefined =>
  [...network.parking].sort(
    (a, b) => distanceFeet(position, a.position) - distanceFeet(position, b.position),
  )[0];

// What the pilot is told, in order: taxiway names without repeats (unnamed
// apron paths are dropped) and a "cross" for each runway the route uses.
export const legsAlong = (network: TaxiNetwork, pointIds: number[]): TaxiLeg[] => {
  const legs: TaxiLeg[] = [];

  for (let i = 1; i < pointIds.length; i++) {
    const segment = segmentBetween(network, pointIds[i - 1], pointIds[i]);
    const last = legs[legs.length - 1];

    if (segment?.crossesRunway) {
      if (!(last?.kind === "cross" && sameRunway(last.runway, segment.crossesRunway))) {
        legs.push({ kind: "cross", runway: segment.crossesRunway });
      }
    } else if (segment?.taxiway && !(last?.kind === "taxiway" && last.name === segment.taxiway)) {
      legs.push({ kind: "taxiway", name: segment.taxiway });
    }
  }

  return legs;
};

export const firstCrossingOf = (
  network: TaxiNetwork,
  pointIds: number[],
  runway: string,
  fromIndex = 0,
): RunwayCrossing | undefined => {
  const crosses = (index: number): boolean => {
    const crossed = segmentBetween(network, pointIds[index], pointIds[index + 1])?.crossesRunway;

    return crossed !== undefined && sameRunway(crossed, runway);
  };

  for (let i = fromIndex; i < pointIds.length - 1; i++) {
    if (crosses(i)) {
      let end = i;

      while (end + 1 < pointIds.length - 1 && crosses(end + 1)) {
        end++;
      }

      return { startIndex: i, endIndex: end + 1 };
    }
  }

  return undefined;
};

const shortestRoute = (
  network: TaxiNetwork,
  sources: Map<number, number>,
  toId: number,
): TaxiRoute | undefined => {
  const distance = new Map<number, number>(sources);
  const previous = new Map<number, number>();
  const unvisited = new Set(network.points.map((point) => point.id));

  while (unvisited.size > 0) {
    let current: number | undefined;

    for (const id of unvisited) {
      if (
        distance.has(id) &&
        (current === undefined || distance.get(id)! < distance.get(current)!)
      ) {
        current = id;
      }
    }

    if (current === undefined) {
      return undefined;
    }

    unvisited.delete(current);

    if (current === toId) {
      break;
    }

    const here = pointById(network, current);

    for (const segment of network.segments) {
      const neighbour =
        segment.from === current ? segment.to : segment.to === current ? segment.from : undefined;
      const there = neighbour === undefined ? undefined : pointById(network, neighbour);

      if (neighbour === undefined || !here || !there || !unvisited.has(neighbour)) {
        continue;
      }

      const candidate =
        distance.get(current)! +
        distanceFeet(here.position, there.position) +
        (segment.crossesRunway ? CROSSING_PENALTY_FEET : 0);

      if (candidate < (distance.get(neighbour) ?? Infinity)) {
        distance.set(neighbour, candidate);
        previous.set(neighbour, current);
      }
    }
  }

  if (!distance.has(toId)) {
    return undefined;
  }

  const pointIds = [toId];

  while (previous.has(pointIds[0])) {
    pointIds.unshift(previous.get(pointIds[0])!);
  }

  return {
    pointIds,
    legs: legsAlong(network, pointIds),
    lengthFeet: distance.get(toId)!,
  };
};

export const planRoute = (
  network: TaxiNetwork,
  fromId: number,
  toId: number,
): TaxiRoute | undefined => shortestRoute(network, new Map([[fromId, 0]]), toId);

// Starts from wherever the aircraft is: both ends of the segment it is on are
// candidates, each costing the distance to reach it.
export const planRouteFrom = (
  network: TaxiNetwork,
  position: GeoPoint,
  toId: number,
): TaxiRoute | undefined => {
  const located = locateOnNetwork(network, position);

  if (!located) {
    return undefined;
  }

  const fromFeet = distanceFeet(position, located.from.position);
  const toFeet = distanceFeet(position, located.to.position);

  const route = shortestRoute(
    network,
    new Map([
      [located.from.id, fromFeet],
      [located.to.id, toFeet],
    ]),
    toId,
  );

  if (!route || route.pointIds.length < 2) {
    return route;
  }

  // The route may begin at the far end of the segment the aircraft is on. The
  // aircraft still has to taxi along that segment, so it belongs in the route.
  const [first, second] = route.pointIds;
  const [near, nearFeet, far, farFeet] =
    fromFeet <= toFeet
      ? [located.from, fromFeet, located.to, toFeet]
      : [located.to, toFeet, located.from, fromFeet];

  if (first === far.id && second !== near.id && nearFeet < farFeet) {
    const pointIds = [near.id, ...route.pointIds];

    return { ...route, pointIds, legs: legsAlong(network, pointIds) };
  }

  return route;
};

export const distanceToRouteFeet = (
  network: TaxiNetwork,
  pointIds: number[],
  position: GeoPoint,
): number => {
  let best = Infinity;

  for (let i = 1; i < pointIds.length; i++) {
    const start = pointById(network, pointIds[i - 1]);
    const end = pointById(network, pointIds[i]);

    if (start && end) {
      best = Math.min(best, distanceToSegmentFeet(position, start.position, end.position));
    }
  }

  return best;
};

export const distanceToPointFeet = (
  network: TaxiNetwork,
  pointId: number,
  position: GeoPoint,
): number => {
  const point = pointById(network, pointId);

  return point ? distanceFeet(position, point.position) : Infinity;
};
