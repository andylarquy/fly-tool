import { Runway } from "../../domain/Airport";
import { GeoPoint } from "../../domain/GeoPoint";
import { FEET_PER_METER, pointFromRunwayFrame } from "../../utils/geo";
import { runwayNameFromFacility } from "./taxiFacility";

/*
 * One RUNWAY entry of an airport's facility data: a single strip of pavement
 * that serves two runway ends. The position is the center of the strip, the
 * heading is the primary end's, and the length and width are in meters.
 */
export interface RawRunway {
  centerLatitude: number;
  centerLongitude: number;
  headingDegrees: number;
  lengthMeters: number;
  widthMeters: number;
  primaryNumber: number;
  primaryDesignator: number;
  secondaryNumber: number;
  secondaryDesignator: number;
}

const OPPOSITE = 180;

const normalizeHeading = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const buildRunways = (raw: RawRunway[]): Runway[] =>
  raw.flatMap((entry) => {
    if (!(entry.lengthMeters > 0)) {
      return [];
    }

    const center: GeoPoint = { latitude: entry.centerLatitude, longitude: entry.centerLongitude };
    const lengthFeet = entry.lengthMeters * FEET_PER_METER;
    const widthFeet = entry.widthMeters * FEET_PER_METER;
    const primaryHeading = normalizeHeading(entry.headingDegrees);
    const secondaryHeading = normalizeHeading(primaryHeading + OPPOSITE);

    return [
      {
        designator: runwayNameFromFacility(entry.primaryNumber, entry.primaryDesignator),
        trueHeading: primaryHeading,
        threshold: pointFromRunwayFrame(center, primaryHeading, -lengthFeet / 2, 0),
        lengthFeet,
        widthFeet,
        patternSide: "left" as const,
      },
      {
        designator: runwayNameFromFacility(entry.secondaryNumber, entry.secondaryDesignator),
        trueHeading: secondaryHeading,
        threshold: pointFromRunwayFrame(center, secondaryHeading, -lengthFeet / 2, 0),
        lengthFeet,
        widthFeet,
        patternSide: "left" as const,
      },
    ];
  });
