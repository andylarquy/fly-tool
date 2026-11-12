import { PathLeg, pathThrough, wait } from "./pathFollower";
import { RunwayFrameSpec } from "./runwayFrame";

const g = (alongFeet: number, crossFeet: number, groundSpeed: number, headingOffsetDegrees: number): RunwayFrameSpec => ({
  alongFeet,
  crossFeet,
  aglFeet: 0,
  headingOffsetDegrees,
  groundSpeed,
  verticalSpeedFeetPerMinute: 0,
  onGround: true,
});

const a = (
  alongFeet: number,
  crossFeet: number,
  aglFeet: number,
  headingOffsetDegrees: number,
  verticalSpeedFeetPerMinute: number,
  groundSpeed: number,
): RunwayFrameSpec => ({
  alongFeet,
  crossFeet,
  aglFeet,
  headingOffsetDegrees,
  groundSpeed,
  verticalSpeedFeetPerMinute,
  onGround: false,
});

export interface FlightStage {
  name: string;
  description: string;
  path: PathLeg[];
  endsAt: RunwayFrameSpec;
}

const RAMP = g(2500, 900, 0, 0);
const HOLD_LINE = g(0, 150, 0, -90);
const LINED_UP = g(200, 0, 0, 0);
const CLEAR_ON_ALPHA = g(2500, 350, 0, 90);

const stage = (
  name: string,
  description: string,
  start: RunwayFrameSpec,
  points: RunwayFrameSpec[],
  after: PathLeg[] = [],
): FlightStage => {
  const path = [...pathThrough(start, points), ...after];

  return { name, description, path, endsAt: path[path.length - 1].to };
};

// A left-hand pattern for the runway, in runway-frame coordinates (feet along
// the runway from its threshold, feet to the right of its centerline).
export const standardFlight: FlightStage[] = [
  stage("taxi", "taxi from the ramp to the runway hold line", RAMP, [
    g(2500, 800, 8, -90),
    g(2500, 400, 12, -90),
    g(2400, 350, 12, 180),
    g(200, 350, 14, 180),
    g(60, 350, 10, 180),
    g(0, 300, 8, -90),
    g(0, 190, 6, -90),
    HOLD_LINE,
  ]),
  stage("line up", "line up on the runway", HOLD_LINE, [
    g(30, 100, 4, -45),
    g(120, 30, 5, -10),
    g(200, 0, 3, 0),
    LINED_UP,
  ], [wait(LINED_UP, 3)]),
  stage("take off", "takeoff roll and initial climb", LINED_UP, [
    g(700, 0, 30, 0),
    g(1800, 0, 55, 0),
    g(3000, 0, 66, 0),
    a(3500, 0, 12, 0, 600, 70),
    a(4500, 0, 250, 0, 700, 72),
    a(6000, 0, 600, 0, 600, 74),
  ]),
  stage("crosswind", "turn onto the crosswind leg", a(6000, 0, 600, 0, 600, 74), [
    a(7000, -400, 750, -30, 500, 76),
    a(7400, -1200, 900, -60, 300, 76),
    a(7300, -2200, 1000, -90, 100, 76),
  ]),
  stage("downwind", "turn onto the downwind leg and fly it", a(7300, -2200, 1000, -90, 100, 76), [
    a(6900, -3600, 1000, -135, 0, 78),
    a(6000, -5000, 1000, 180, 0, 80),
    a(2000, -5000, 1000, 180, 0, 80),
    a(-1000, -5000, 1000, 180, -100, 78),
  ]),
  stage("base", "turn onto the base leg", a(-1000, -5000, 1000, 180, -100, 78), [
    a(-2200, -4800, 900, 135, -400, 74),
    a(-3000, -4200, 800, 90, -500, 72),
    a(-3000, -2400, 650, 90, -500, 70),
  ]),
  stage("final", "turn final and fly the approach", a(-3000, -2400, 650, 90, -500, 70), [
    a(-3000, -800, 560, 45, -500, 68),
    a(-3000, -150, 520, 5, -500, 68),
    a(-2500, 0, 440, 0, -500, 68),
    a(-1200, 0, 160, 0, -500, 65),
    a(-350, 0, 20, 0, -150, 62),
  ]),
  stage("land", "flare, touch down and roll out", a(-350, 0, 20, 0, -150, 62), [
    g(500, 0, 55, 0),
    g(1500, 0, 35, 0),
    g(2300, 0, 14, 0),
    g(2480, 130, 8, 45),
    g(2500, 300, 6, 90),
    CLEAR_ON_ALPHA,
  ]),
  stage("taxi in", "taxi back to the ramp", CLEAR_ON_ALPHA, [
    g(2500, 500, 10, 90),
    g(2500, 800, 8, 90),
    RAMP,
  ], [wait(RAMP, 5)]),
];

export const startOfFlight = RAMP;

export const stageIndexOf = (name: string): number =>
  standardFlight.findIndex((flightStage) => flightStage.name === name.toLowerCase());
