import { AircraftState } from "../../domain/AircraftState";
import { Runway } from "../../domain/Airport";

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

const ground = (
  alongFeet: number,
  crossFeet: number,
  groundSpeed = 0,
): RunwayFrameSpec => ({
  alongFeet,
  crossFeet,
  aglFeet: 0,
  headingOffsetDegrees: 0,
  groundSpeed,
  verticalSpeedFeetPerMinute: 0,
  onGround: true,
});

const air = (
  alongFeet: number,
  crossFeet: number,
  aglFeet: number,
  headingOffsetDegrees: number,
  verticalSpeedFeetPerMinute: number,
  groundSpeed = 75,
): RunwayFrameSpec => ({
  alongFeet,
  crossFeet,
  aglFeet,
  headingOffsetDegrees,
  groundSpeed,
  verticalSpeedFeetPerMinute,
  onGround: false,
});

export const positions = {
  holdingShort: ground(0, 200),
  linedUp: ground(200, 0),
  upwind: air(3500, 0, 300, 0, 700, 70),
  crosswind: air(6500, -1200, 800, -90, 500),
  downwind: air(4000, -5000, 1000, 180, 0),
  base: air(-1500, -4500, 800, 90, -500),
  final: air(-4000, 0, 400, 0, -500),
  shortFinal: air(-1200, 0, 150, 0, -500, 65),
  inboundFromSouth: air(-9000, -30000, 1500, 0, 0, 100),
  landingRoll: ground(600, 0, 50),
} satisfies Record<string, RunwayFrameSpec>;
