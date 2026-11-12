import { RunwayFrameSpec, telemetryAt } from "../../sim/runwayFrame";

export { RunwayFrameSpec, telemetryAt };

const ground = (
  alongFeet: number,
  crossFeet: number,
  groundSpeed = 0,
  headingOffsetDegrees = 0,
): RunwayFrameSpec => ({
  alongFeet,
  crossFeet,
  aglFeet: 0,
  headingOffsetDegrees,
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
  smoothFlare: air(-300, 0, 15, 0, -90, 60),
  inboundFromSouth: air(-9000, -30000, 1500, 0, 0, 100),
  landingRoll: ground(600, 0, 50),
  rampSpot: ground(2500, 900),
  taxiingOnAlpha: ground(1800, 350, 10, 180),
  wrongWayOnAlpha: ground(4000, 350, 10),
  clearOfRunway: ground(2500, 350),
  holdingShortFarEnd: ground(5000, 150),
  crossingRunway: ground(1000, 0, 8, 90),
  offTheNetwork: ground(2500, -1500),
  rampThree: ground(2500, -900),
  holdingShortLeftOfRunway: ground(2500, -150),
  middleOfTheRunway: ground(2500, 0, 8, 90),
  holdingShortRightOfRunway: ground(2500, 150),
} satisfies Record<string, RunwayFrameSpec>;
