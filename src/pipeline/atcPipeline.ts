import { extractEmergencyDetails } from "../ai/classifier/emergencyDetailsExtractor";
import { classifyPilotMessage } from "../ai/classifier/pilotMessageClassifier";
import { renderTransmission } from "../ai/speech/intentRenderer";
import { createEngineState } from "../engine/clearances";
import { decide } from "../engine/decide";
import { PilotInput } from "../engine/types";
import { AircraftState } from "../domain/AircraftState";
import { Airport } from "../domain/Airport";
import { AtcIntent } from "../domain/AtcIntent";
import { ControllerStyle } from "../domain/ControllerStyle";
import { EngineState } from "../domain/EngineState";
import { Facility } from "../domain/Facility";
import { FacilityRelationship, PilotRecord } from "../domain/PilotRecord";
import { FlightEvent } from "../domain/FlightEvent";
import { PilotMessage } from "../domain/PilotMessage";
import { Situation } from "../domain/Situation";
import { deriveStyle } from "../memory/familiarity";
import { getRelationship, recordTurn, startVisit } from "../memory/recordKeeping";
import { deriveSituation } from "../situation/deriveSituation";

export interface PipelineState {
  engine: EngineState;
  record: PilotRecord;
  visitStarted: boolean;
  history?: FacilityRelationship;
  situation?: Situation;
  lastAtcTransmission?: string;
}

export interface PipelineInput {
  aircraft: AircraftState;
  airport: Airport;
  observedAtMs: number;
  facility: Facility;
  epochMs: number;
  trafficCount?: number;
  style?: ControllerStyle;
  callsign?: string;
  pilotTransmission?: string;
}

export interface StageTimings {
  classifyMs: number;
  extractMs: number;
  renderMs: number;
}

export interface PipelineTrace {
  situation: Situation;
  events: FlightEvent[];
  message?: PilotMessage;
  intents: AtcIntent[];
  timings: StageTimings;
}

export interface PipelineTurn {
  transmission?: string;
  state: PipelineState;
  trace: PipelineTrace;
}

export const createPipelineState = (
  runway: string,
  record: PilotRecord,
): PipelineState => ({
  engine: createEngineState(runway),
  record,
  visitStarted: false,
});

export const runPipelineTurn = async (
  input: PipelineInput,
  previous: PipelineState,
): Promise<PipelineTurn> => {
  const {
    aircraft,
    airport,
    observedAtMs,
    facility,
    epochMs,
    trafficCount,
    callsign,
    pilotTransmission,
  } = input;

  let { record, history, visitStarted } = previous;

  if (!visitStarted) {
    history = getRelationship(record, facility.id);
    record = startVisit(record, facility.id, epochMs);
    visitStarted = true;
  }

  const style = input.style ?? deriveStyle(history, epochMs, trafficCount);

  const { situation, events } = deriveSituation(
    { aircraft, airport, runway: previous.engine.runway, observedAtMs },
    previous.situation,
  );

  let pilot: PilotInput = { status: "none" };
  let message: PilotMessage | undefined;
  const timings: StageTimings = { classifyMs: 0, extractMs: 0, renderMs: 0 };

  if (pilotTransmission) {
    const classifyStart = performance.now();
    const classification = await classifyPilotMessage({
      pilotTransmission,
      lastAtcTransmission: previous.lastAtcTransmission,
      runways: airport.runways.map((runway) => runway.designator),
    });

    timings.classifyMs = performance.now() - classifyStart;
    message = classification.message;

    if (message && (message.type === "emergency" || previous.engine.emergency)) {
      const extractStart = performance.now();
      const emergency = await extractEmergencyDetails(pilotTransmission);
      timings.extractMs = performance.now() - extractStart;
      message = { ...message, emergency };
    }

    pilot = message
      ? { status: "heard", message }
      : { status: "unintelligible" };
  }

  const decision = decide(
    {
      aircraft,
      airport,
      situation,
      style,
      events,
      pilot,
      memory: { history, epochMs },
    },
    previous.engine,
  );

  const renderStart = performance.now();
  const rendered = await renderTransmission({
    callsign,
    intents: decision.intents,
    style,
  });

  return {
    transmission: rendered?.text,
    state: {
      engine: decision.state,
      record: recordTurn(record, facility.id, events, decision.intents, epochMs),
      visitStarted,
      history,
      situation,
      lastAtcTransmission: rendered?.text ?? previous.lastAtcTransmission,
    },
    trace: {
      situation,
      events,
      message,
      intents: decision.intents,
      timings: { ...timings, renderMs: performance.now() - renderStart },
    },
  };
};
