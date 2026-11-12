import { RunwayFrameSpec } from "./runwayFrame";

const FEET_PER_KNOT_SECOND = 1.68781;
const MINIMUM_LEG_SECONDS = 2;

export interface PathLeg {
  to: RunwayFrameSpec;
  seconds: number;
}

const lerp = (from: number, to: number, fraction: number): number =>
  from + (to - from) * fraction;

// Along the shorter way round, so 170 -> -170 turns through 180, not 0.
const lerpAngle = (from: number, to: number, fraction: number): number => {
  const difference = ((((to - from + 180) % 360) + 360) % 360) - 180;

  return from + difference * fraction;
};

// How long a leg takes at the speed it is flown: the distance divided by the
// average of its two ground speeds. A leg that starts and ends stopped (a
// wait) must be given its time explicitly.
export const legTo = (
  from: RunwayFrameSpec,
  to: RunwayFrameSpec,
  seconds?: number,
): PathLeg => {
  if (seconds !== undefined) {
    return { to, seconds };
  }

  const distance = Math.hypot(
    to.alongFeet - from.alongFeet,
    to.crossFeet - from.crossFeet,
    to.aglFeet - from.aglFeet,
  );
  const speed = ((from.groundSpeed + to.groundSpeed) / 2) * FEET_PER_KNOT_SECOND;

  return { to, seconds: Math.max(MINIMUM_LEG_SECONDS, speed > 0 ? distance / speed : 0) };
};

export const pathThrough = (start: RunwayFrameSpec, points: RunwayFrameSpec[]): PathLeg[] => {
  let previous = start;

  return points.map((point) => {
    const leg = legTo(previous, point);
    previous = point;

    return leg;
  });
};

export const wait = (at: RunwayFrameSpec, seconds: number): PathLeg => ({
  to: { ...at, groundSpeed: 0, verticalSpeedFeetPerMinute: 0 },
  seconds,
});

// Moves a point along a queue of legs, one simulated second at a time.
export class PathFollower {
  private legs: PathLeg[] = [];
  private from: RunwayFrameSpec;
  private elapsed = 0;

  constructor(private current: RunwayFrameSpec) {
    this.from = current;
  }

  get spec(): RunwayFrameSpec {
    return this.current;
  }

  get busy(): boolean {
    return this.legs.length > 0;
  }

  enqueue(legs: PathLeg[]): void {
    this.legs.push(...legs);
  }

  jumpTo(spec: RunwayFrameSpec): void {
    this.legs = [];
    this.current = spec;
    this.from = spec;
    this.elapsed = 0;
  }

  advance(seconds: number): void {
    let remaining = seconds;

    while (remaining > 0 && this.legs.length > 0) {
      const leg = this.legs[0];
      const step = Math.min(remaining, leg.seconds - this.elapsed);

      this.elapsed += step;
      remaining -= step;
      this.current = this.interpolate(leg);

      if (this.elapsed >= leg.seconds) {
        this.from = leg.to;
        this.current = leg.to;
        this.elapsed = 0;
        this.legs.shift();
      }
    }
  }

  private interpolate(leg: PathLeg): RunwayFrameSpec {
    const fraction = leg.seconds > 0 ? this.elapsed / leg.seconds : 1;
    const { from } = this;
    const { to } = leg;

    // Lift-off and touch-down happen halfway through the leg that crosses
    // from ground to air or back.
    const onGround =
      from.onGround === to.onGround ? to.onGround : fraction < 0.5 ? from.onGround : to.onGround;

    return {
      alongFeet: lerp(from.alongFeet, to.alongFeet, fraction),
      crossFeet: lerp(from.crossFeet, to.crossFeet, fraction),
      aglFeet: lerp(from.aglFeet, to.aglFeet, fraction),
      headingOffsetDegrees: lerpAngle(from.headingOffsetDegrees, to.headingOffsetDegrees, fraction),
      groundSpeed: lerp(from.groundSpeed, to.groundSpeed, fraction),
      verticalSpeedFeetPerMinute: lerp(
        from.verticalSpeedFeetPerMinute,
        to.verticalSpeedFeetPerMinute,
        fraction,
      ),
      onGround,
    };
  }
}
