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
import { FlightEvent } from "../domain/FlightEvent";
import { PilotMessage } from "../domain/PilotMessage";
import { Situation } from "../domain/Situation";
import { deriveSituation } from "../situation/deriveSituation";

export interface PipelineState {
  engine: EngineState;
  situation?: Situation;
  lastAtcTransmission?: string;
}

export interface PipelineInput {
  aircraft: AircraftState;
  airport: Airport;
  observedAtMs: number;
  style: ControllerStyle;
  callsign?: string;
  pilotTransmission?: string;
}

export interface PipelineTrace {
  situation: Situation;
  events: FlightEvent[];
  message?: PilotMessage;
  intents: AtcIntent[];
}

export interface PipelineTurn {
  transmission?: string;
  state: PipelineState;
  trace: PipelineTrace;
}

export const createPipelineState = (runway: string): PipelineState => ({
  engine: createEngineState(runway),
});

export const runPipelineTurn = async (
  input: PipelineInput,
  previous: PipelineState,
): Promise<PipelineTurn> => {
  const { aircraft, airport, observedAtMs, style, callsign, pilotTransmission } =
    input;

  const { situation, events } = deriveSituation(
    { aircraft, airport, runway: previous.engine.runway, observedAtMs },
    previous.situation,
  );

  let pilot: PilotInput = { status: "none" };
  let message: PilotMessage | undefined;

  if (pilotTransmission) {
    const classification = await classifyPilotMessage({
      pilotTransmission,
      lastAtcTransmission: previous.lastAtcTransmission,
      runways: airport.runways.map((runway) => runway.designator),
    });

    message = classification.message;
    pilot = message
      ? { status: "heard", message }
      : { status: "unintelligible" };
  }

  const decision = decide(
    { aircraft, airport, situation, style, events, pilot },
    previous.engine,
  );

  const rendered = await renderTransmission({
    callsign,
    intents: decision.intents,
    style,
  });

  return {
    transmission: rendered?.text,
    state: {
      engine: decision.state,
      situation,
      lastAtcTransmission: rendered?.text ?? previous.lastAtcTransmission,
    },
    trace: { situation, events, message, intents: decision.intents },
  };
};
