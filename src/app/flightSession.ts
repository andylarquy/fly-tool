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
  onTurn?: (turn: PipelineTurn, pilotSpoke: boolean, aircraft: AircraftState) => void;
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
  private airport: Airport;
  private facility: Facility;
  private callsign?: string;

  constructor(private readonly options: FlightSessionOptions) {
    this.airport = options.airport;
    this.facility = options.facility;
    this.callsign = options.callsign;
    this.pipeline = createPipelineState(
      options.runway ?? options.airport.runways[0].designator,
      options.record,
      { askFlightIntake: options.askFlightIntake },
    );
  }

  // Moves the session to another airport (or starts it over at the same one):
  // the controller's memory of this flight is dropped, the pilot's record is
  // kept and saved. It waits for any turn in flight, and ticks meanwhile are
  // dropped like they are during a turn.
  relocate(target: { airport: Airport; facility: Facility; runway?: string; callsign?: string }): Promise<void> {
    return this.queue(async () => {
      await this.options.store?.save(this.pipeline.record);

      this.airport = target.airport;
      this.facility = target.facility;
      this.callsign = target.callsign ?? this.callsign;
      this.pipeline = createPipelineState(
        target.runway ?? target.airport.runways[0].designator,
        this.pipeline.record,
        { askFlightIntake: this.options.askFlightIntake },
      );
    });
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
    return this.queue(() => this.execute(transmission));
  }

  private queue<T>(work: () => Promise<T>): Promise<T> {
    this.inFlight++;

    const turn = this.tail.then(work).finally(() => {
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
          airport: this.airport,
          observedAtMs: nowMs,
          facility: this.facility,
          epochMs: options.epochBaseMs + nowMs,
          callsign: this.callsign,
          style: options.style,
          pilotTransmission: transmission,
          directory: options.directory,
        },
        this.pipeline,
      );

      this.pipeline = turn.state;
      options.onTurn?.(turn, transmission !== undefined, aircraft);

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
