import { GeoPoint } from "../domain/GeoPoint";
import { ParkingSpot, TaxiNetwork, TaxiPoint } from "../domain/TaxiNetwork";
import { distanceFeet, distanceToSegmentFeet } from "../utils/geo";

// An aircraft farther than this from every taxi point is not considered to be
// on the taxi network at all (for example, airborne or on a runway).
export const LOCATE_RADIUS_FEET = 250;
export const HOLD_SHORT_RADIUS_FEET = 120;

export interface TaxiRoute {
  pointIds: number[];
  taxiways: string[];
  lengthFeet: number;
}

const pointById = (network: TaxiNetwork, id: number): TaxiPoint | undefined =>
  network.points.find((point) => point.id === id);

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

export const holdShortPointFor = (
  network: TaxiNetwork,
  runway: string,
): TaxiPoint | undefined =>
  network.points.find((point) => point.holdShortRunway === runway);

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

const segmentBetween = (network: TaxiNetwork, a: number, b: number) =>
  network.segments.find(
    (segment) =>
      (segment.from === a && segment.to === b) ||
      (segment.from === b && segment.to === a),
  );

// Names in the order they are taxied, without repeats and without unnamed
// connectors such as apron paths.
export const taxiwaysAlong = (network: TaxiNetwork, pointIds: number[]): string[] => {
  const names: string[] = [];

  for (let i = 1; i < pointIds.length; i++) {
    const name = segmentBetween(network, pointIds[i - 1], pointIds[i])?.taxiway;

    if (name && names[names.length - 1] !== name) {
      names.push(name);
    }
  }

  return names;
};

export const planRoute = (
  network: TaxiNetwork,
  fromId: number,
  toId: number,
): TaxiRoute | undefined => {
  const distance = new Map<number, number>([[fromId, 0]]);
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

      const candidate = distance.get(current)! + distanceFeet(here.position, there.position);

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

  while (pointIds[0] !== fromId) {
    pointIds.unshift(previous.get(pointIds[0])!);
  }

  return {
    pointIds,
    taxiways: taxiwaysAlong(network, pointIds),
    lengthFeet: distance.get(toId)!,
  };
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
