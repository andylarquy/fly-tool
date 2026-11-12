import { AircraftState } from "../domain/AircraftState";
import { Runway } from "../domain/Airport";

const FEET_PER_DEGREE_LATITUDE = 6076.12 * 60;

export interface RunwayFrameSpec {
  alongFeet: number;
  crossFeet: number;
  aglFeet: number;
  headingOffsetDegrees: number;
  groundSpeed: number;
  verticalSpeedFeetPerMinute: number;
  onGround: boolean;
}

export const telemetryAt = (
  runway: Runway,
  elevationFeet: number,
  spec: RunwayFrameSpec,
): AircraftState => {
  const heading = (runway.trueHeading * Math.PI) / 180;
  const north =
    spec.alongFeet * Math.cos(heading) - spec.crossFeet * Math.sin(heading);
  const east =
    spec.alongFeet * Math.sin(heading) + spec.crossFeet * Math.cos(heading);

  return {
    latitude: runway.threshold.latitude + north / FEET_PER_DEGREE_LATITUDE,
    longitude:
      runway.threshold.longitude +
      east /
        (FEET_PER_DEGREE_LATITUDE *
          Math.cos((runway.threshold.latitude * Math.PI) / 180)),
    altitudeFeet: elevationFeet + spec.aglFeet,
    trueHeading: (runway.trueHeading + spec.headingOffsetDegrees + 360) % 360,
    groundSpeed: spec.groundSpeed,
    pitch: 0,
    bank: 0,
    verticalSpeedFeetPerMinute: spec.verticalSpeedFeetPerMinute,
    isOnGround: spec.onGround,
  };
};
