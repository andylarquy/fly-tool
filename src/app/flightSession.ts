import { SimulatorAdapter } from "../adapters/SimulatorAdapter";
import { AirportDirectory } from "../directory/airportDirectory";
import { AircraftState } from "../domain/AircraftState";
import { Airport } from "../domain/Airport";
import { ControllerStyle } from "../domain/ControllerStyle";
import { Facility } from "../domain/Facility";
import { PilotRecord, PilotRecordStore } from "../domain/PilotRecord";
import {
  createPipelineState,
  PipelineState,
  PipelineTurn,
  runPipelineTurn,
} from "../pipeline/atcPipeline";

export interface FlightSessionOptions {
  simulator: SimulatorAdapter;
  airport: Airport;
  facility: Facility;
  record: PilotRecord;
  clock: () => number;
  epochBaseMs: number;
  callsign?: string;
  store?: PilotRecordStore;
  directory?: () => AirportDirectory | undefined;
  askFlightIntake?: boolean;
  style?: ControllerStyle;
  runway?: string;
  runTurn?: typeof runPipelineTurn;
  onTransmission: (text: string, turn: PipelineTurn, pilotSpoke: boolean) => void;
  onError?: (error: unknown) => void;
}

// The live loop. The simulator pushes telemetry, a timer asks for a tick and
// the pilot types lines; the pipeline is stateful, so only one turn may run at
// a time. Pilot lines queue up in order. A tick that finds a turn in flight is
// dropped: the next one carries fresher telemetry anyway.
export class FlightSession {
  private pipeline: PipelineState;
  private latest?: AircraftState;
  private tail: Promise<unknown> = Promise.resolve();
  private inFlight = 0;
  private stopped = false;

  constructor(private readonly options: FlightSessionOptions) {
    this.pipeline = createPipelineState(
      options.runway ?? options.airport.runways[0].designator,
      options.record,
      { askFlightIntake: options.askFlightIntake },
    );
  }

  get state(): PipelineState {
    return this.pipeline;
  }

  get busy(): boolean {
    return this.inFlight > 0;
  }

  start(): void {
    this.options.simulator.onAircraftStateUpdate((aircraft) => {
      this.latest = aircraft;
    });
  }

  tick(): void {
    if (this.stopped || this.latest === undefined || this.busy) {
      return;
    }

    void this.enqueue(undefined);
  }

  say(transmission: string): Promise<PipelineTurn | undefined> {
    if (this.latest === undefined) {
      this.options.onError?.(new Error("No telemetry received yet, try again shortly."));

      return Promise.resolve(undefined);
    }

    return this.enqueue(transmission);
  }

  idle(): Promise<unknown> {
    return this.tail;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.tail;
    await this.options.store?.save(this.pipeline.record);
  }

  private enqueue(transmission: string | undefined): Promise<PipelineTurn | undefined> {
    this.inFlight++;

    const turn = this.tail
      .then(() => this.execute(transmission))
      .finally(() => {
        this.inFlight--;
      });

    this.tail = turn.catch(() => undefined);

    return turn;
  }

  private async execute(transmission: string | undefined): Promise<PipelineTurn | undefined> {
    const { options } = this;
    const aircraft = this.latest;

    if (aircraft === undefined) {
      return undefined;
    }

    try {
      const nowMs = options.clock();
      const turn = await (options.runTurn ?? runPipelineTurn)(
        {
          aircraft,
          airport: options.airport,
          observedAtMs: nowMs,
          facility: options.facility,
          epochMs: options.epochBaseMs + nowMs,
          callsign: options.callsign,
          style: options.style,
          pilotTransmission: transmission,
          directory: options.directory,
        },
        this.pipeline,
      );

      this.pipeline = turn.state;

      if (turn.transmission) {
        options.onTransmission(turn.transmission, turn, transmission !== undefined);
      }

      return turn;
    } catch (error) {
      options.onError?.(error);

      return undefined;
    }
  }
}
