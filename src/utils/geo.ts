import { GeoPoint } from "../domain/GeoPoint";

const FEET_PER_NAUTICAL_MILE = 6076.12;
const NAUTICAL_MILES_PER_DEGREE_LATITUDE = 60;
const FEET_PER_DEGREE_LATITUDE =
  FEET_PER_NAUTICAL_MILE * NAUTICAL_MILES_PER_DEGREE_LATITUDE;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export interface LocalOffset {
  northFeet: number;
  eastFeet: number;
}

export interface RunwayOffset {
  alongFeet: number;
  crossFeet: number;
}

// Flat-earth approximation, accurate enough within a few miles of the origin.
export const localOffset = (origin: GeoPoint, point: GeoPoint): LocalOffset => ({
  northFeet: (point.latitude - origin.latitude) * FEET_PER_DEGREE_LATITUDE,
  eastFeet:
    (point.longitude - origin.longitude) *
    FEET_PER_DEGREE_LATITUDE *
    Math.cos(toRadians(origin.latitude)),
});

export const normalizeAngleDegrees = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
};

export const angleDifferenceDegrees = (
  heading: number,
  reference: number,
): number => normalizeAngleDegrees(heading - reference);

export const bearingDegrees = (from: GeoPoint, to: GeoPoint): number => {
  const { northFeet, eastFeet } = localOffset(from, to);
  return (toDegrees(Math.atan2(eastFeet, northFeet)) + 360) % 360;
};

export const distanceNauticalMiles = (from: GeoPoint, to: GeoPoint): number => {
  const { northFeet, eastFeet } = localOffset(from, to);
  return Math.hypot(northFeet, eastFeet) / FEET_PER_NAUTICAL_MILE;
};

// Along is positive in the runway's landing direction, cross is positive to
// the right of it.
export const runwayOffset = (
  threshold: GeoPoint,
  runwayHeading: number,
  point: GeoPoint,
): RunwayOffset => {
  const { northFeet, eastFeet } = localOffset(threshold, point);
  const heading = toRadians(runwayHeading);

  return {
    alongFeet: northFeet * Math.cos(heading) + eastFeet * Math.sin(heading),
    crossFeet: -northFeet * Math.sin(heading) + eastFeet * Math.cos(heading),
  };
};

export const distanceFeet = (from: GeoPoint, to: GeoPoint): number => {
  const { northFeet, eastFeet } = localOffset(from, to);
  return Math.hypot(northFeet, eastFeet);
};

// Inverse of `runwayOffset`: a point given in the runway frame.
export const pointFromRunwayFrame = (
  threshold: GeoPoint,
  runwayHeading: number,
  alongFeet: number,
  crossFeet: number,
): GeoPoint => {
  const heading = toRadians(runwayHeading);
  const northFeet = alongFeet * Math.cos(heading) - crossFeet * Math.sin(heading);
  const eastFeet = alongFeet * Math.sin(heading) + crossFeet * Math.cos(heading);

  return {
    latitude: threshold.latitude + northFeet / FEET_PER_DEGREE_LATITUDE,
    longitude:
      threshold.longitude +
      eastFeet / (FEET_PER_DEGREE_LATITUDE * Math.cos(toRadians(threshold.latitude))),
  };
};

export const distanceToSegmentFeet = (
  point: GeoPoint,
  start: GeoPoint,
  end: GeoPoint,
): number => {
  const p = localOffset(start, point);
  const s = localOffset(start, end);
  const lengthSquared = s.northFeet ** 2 + s.eastFeet ** 2;

  if (lengthSquared === 0) {
    return Math.hypot(p.northFeet, p.eastFeet);
  }

  const t = Math.max(
    0,
    Math.min(1, (p.northFeet * s.northFeet + p.eastFeet * s.eastFeet) / lengthSquared),
  );

  return Math.hypot(p.northFeet - t * s.northFeet, p.eastFeet - t * s.eastFeet);
};

export const FEET_PER_METER = 3.28084;

export const pointFromOffsetFeet = (
  origin: GeoPoint,
  northFeet: number,
  eastFeet: number,
): GeoPoint => ({
  latitude: origin.latitude + northFeet / FEET_PER_DEGREE_LATITUDE,
  longitude:
    origin.longitude +
    eastFeet / (FEET_PER_DEGREE_LATITUDE * Math.cos(toRadians(origin.latitude))),
});
