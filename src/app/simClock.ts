import { AircraftState } from "../domain/AircraftState";

const MAX_STEP_SECONDS = 60;

// The engine's clock follows the simulator's own time, so a pause stops it and
// a faster sim rate speeds it up. A step backwards or a huge leap (a flight
// reload) adds nothing: the clock never runs backwards. Without sim time in the
// telemetry it falls back to wall time.
export class SimClock {
  private elapsedMs = 0;
  private lastSimSeconds?: number;
  private lastWallMs?: number;

  observe(aircraft: AircraftState, wallMs: number): void {
    const sim = aircraft.simTimeSeconds;

    if (sim !== undefined) {
      if (this.lastSimSeconds !== undefined) {
        const step = sim - this.lastSimSeconds;

        if (step > 0 && step < MAX_STEP_SECONDS) {
          this.elapsedMs += step * 1000;
        }
      }

      this.lastSimSeconds = sim;
    } else {
      if (this.lastWallMs !== undefined && wallMs > this.lastWallMs) {
        this.elapsedMs += wallMs - this.lastWallMs;
      }

      this.lastWallMs = wallMs;
    }
  }

  now(): number {
    return this.elapsedMs;
  }
}
