import { SimulatorAdapter } from "../adapters/SimulatorAdapter";
import { AircraftState } from "../domain/AircraftState";
import { Runway } from "../domain/Airport";
import { PathFollower, PathLeg } from "./pathFollower";
import { RunwayFrameSpec, telemetryAt } from "./runwayFrame";

// A stand-in for the simulator: an aircraft that moves along queued legs in
// runway-frame coordinates. It speaks the same adapter interface as MSFS, so
// the application cannot tell the difference.
export class SimulatedSimulator implements SimulatorAdapter {
  private readonly follower: PathFollower;
  private callbacks: ((state: AircraftState) => void)[] = [];
  private com1?: number;

  constructor(
    private readonly runway: Runway,
    private readonly elevationFeet: number,
    start: RunwayFrameSpec,
  ) {
    this.follower = new PathFollower(start);
  }

  async connect(): Promise<void> {}

  disconnect(): void {
    this.callbacks = [];
  }

  onAircraftStateUpdate(callback: (state: AircraftState) => void): void {
    this.callbacks.push(callback);
  }

  get state(): AircraftState {
    return {
      ...telemetryAt(this.runway, this.elevationFeet, this.follower.spec),
      ...(this.com1 === undefined ? {} : { com1FrequencyMhz: this.com1 }),
    };
  }

  get busy(): boolean {
    return this.follower.busy;
  }

  tune(frequencyMhz: number | undefined): void {
    this.com1 = frequencyMhz;
  }

  enqueue(legs: PathLeg[]): void {
    this.follower.enqueue(legs);
  }

  jumpTo(spec: RunwayFrameSpec): void {
    this.follower.jumpTo(spec);
    this.publish();
  }

  advance(seconds: number): void {
    this.follower.advance(seconds);
    this.publish();
  }

  private publish(): void {
    const state = this.state;

    this.callbacks.forEach((callback) => callback(state));
  }
}
