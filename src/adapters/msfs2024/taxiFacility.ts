import { Runway } from "../../domain/Airport";
import { GeoPoint } from "../../domain/GeoPoint";
import { ParkingSpot, TaxiNetwork, TaxiPoint, TaxiSegment } from "../../domain/TaxiNetwork";
import { distanceFeet, distanceToSegmentFeet, FEET_PER_METER, pointFromOffsetFeet, pointFromRunwayFrame } from "../../utils/geo";

/*
 * The facility data an airport reports, already decoded to plain values by the
 * code that reads SimConnect's raw buffers (TAXI_POINT, TAXI_PATH, TAXI_NAME
 * and TAXI_PARKING). Keeping this step free of SimConnect lets the conversion
 * be tested without a simulator.
 */
export interface RawTaxiPoint {
  type: number;
  biasXMeters: number;
  biasZMeters: number;
}

export interface RawTaxiPath {
  type: number;
  start: number;
  end: number;
  nameIndex: number;
  runwayNumber: number;
  runwayDesignator: number;
}

export interface RawParkingSpot {
  name: string;
  number: number;
  suffix: string;
  biasXMeters: number;
  biasZMeters: number;
}

export interface RawAirportTaxiData {
  reference: GeoPoint;
  points: RawTaxiPoint[];
  paths: RawTaxiPath[];
  names: string[];
  parking: RawParkingSpot[];
}

// The value for RUNWAY is inferred from the other documented ones and still
// has to be confirmed against a real airport.
const PATH_TYPE = {
  taxi: 1,
  runway: 2,
  parking: 3,
  path: 4,
} as const;

const HOLD_SHORT_POINT_TYPES = [2, 4, 5, 6];
const HOLD_SHORT_MAX_FROM_RUNWAY_FEET = 400;

const COMPASS_RUNWAYS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DESIGNATORS = ["", "L", "R", "C", "W", "A", "B"];

export const runwayNameFromFacility = (number: number, designator: number): string => {
  const suffix = DESIGNATORS[designator] ?? "";

  if (number >= 1 && number <= 36) {
    return `${String(number).padStart(2, "0")}${suffix}`;
  }

  return `${COMPASS_RUNWAYS[number - 37] ?? ""}${suffix}`;
};

export const parkingName = (spot: RawParkingSpot): string =>
  `${spot.name} ${spot.number}${spot.suffix}`.trim();

// X is east and Z is north, as the documentation words it ("longitudinal" and
// "latitudinal" axis); to be confirmed against a real airport.
const positionOf = (
  reference: GeoPoint,
  biasXMeters: number,
  biasZMeters: number,
): GeoPoint =>
  pointFromOffsetFeet(
    reference,
    biasZMeters * FEET_PER_METER,
    biasXMeters * FEET_PER_METER,
  );

// A hold line is labeled with the runway it serves: the end whose threshold is
// nearest, among the runways whose centerline passes close by.
const holdShortRunwayFor = (position: GeoPoint, runways: Runway[]): string | undefined =>
  runways
    .filter(
      (runway) =>
        distanceToSegmentFeet(
          position,
          runway.threshold,
          pointFromRunwayFrame(runway.threshold, runway.trueHeading, runway.lengthFeet, 0),
        ) <= HOLD_SHORT_MAX_FROM_RUNWAY_FEET,
    )
    .sort(
      (a, b) =>
        distanceFeet(position, a.threshold) - distanceFeet(position, b.threshold),
    )[0]?.designator;

export const buildTaxiNetwork = (raw: RawAirportTaxiData, runways: Runway[]): TaxiNetwork => {
  const points: TaxiPoint[] = raw.points.map((point, id) => {
    const position = positionOf(raw.reference, point.biasXMeters, point.biasZMeters);

    return HOLD_SHORT_POINT_TYPES.includes(point.type)
      ? { id, position, holdShortRunway: holdShortRunwayFor(position, runways) }
      : { id, position };
  });

  const segments: TaxiSegment[] = [];
  const connectedParking = new Map<number, number>();
  const isPoint = (id: number): boolean => Number.isInteger(id) && id >= 0 && id < raw.points.length;

  for (const path of raw.paths) {
    if (path.type === PATH_TYPE.parking) {
      // END is an index into the parking list, not a taxi point.
      if (isPoint(path.start) && raw.parking[path.end]) {
        connectedParking.set(path.end, path.start);
      }

      continue;
    }

    if (!isPoint(path.start) || !isPoint(path.end) || path.start === path.end) {
      continue;
    }

    if (path.type === PATH_TYPE.runway) {
      segments.push({
        from: path.start,
        to: path.end,
        crossesRunway: runwayNameFromFacility(path.runwayNumber, path.runwayDesignator),
      });
    } else if (path.type === PATH_TYPE.taxi || path.type === PATH_TYPE.path) {
      const taxiway = raw.names[path.nameIndex]?.trim();

      segments.push({ from: path.start, to: path.end, ...(taxiway ? { taxiway } : {}) });
    }
  }

  const parking: ParkingSpot[] = [];

  for (const [index, attachedTo] of connectedParking) {
    const spot = raw.parking[index];
    const pointId = points.length;
    const position = positionOf(raw.reference, spot.biasXMeters, spot.biasZMeters);

    points.push({ id: pointId, position });
    segments.push({ from: attachedTo, to: pointId });
    parking.push({ id: parking.length + 1, name: parkingName(spot), position, pointId });
  }

  return { points, segments, parking };
};
