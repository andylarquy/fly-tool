import { extractFlightIntake } from "../ai/interpreter/flightIntakeExtractor";
import { AirportDirectory } from "../directory/airportDirectory";
import { toAirportRef } from "../directory/spokenName";
import { hasSignificantWords } from "../directory/textMatch";
import { DestinationJudgement } from "../domain/FlightIntake";
import { needsIntake } from "../engine/decideIntake";
import { verifyTaxiReadback } from "../ai/interpreter/taxiReadbackVerifier";
import { findPendingReadback } from "../engine/clearances";
import { extractEmergencyDetails } from "../ai/interpreter/emergencyDetailsExtractor";
import { classifyPilotMessage } from "../ai/interpreter/pilotMessageClassifier";
import { renderTransmission } from "../ai/renderer/intentRenderer";
import { createEngineState, EngineStateOptions } from "../engine/engineState";
import { decide } from "../engine/decide";
import { PilotInput } from "../engine/decisionTypes";
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
  directory?: () => AirportDirectory | undefined;
}

export interface StageTimings {
  classifyMs: number;
  intakeMs: number;
  extractMs: number;
  verifyMs: number;
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

// "Say again" asks the pilot to repeat an instruction; it must not replace the
// instruction the pilot's next transmission is read back against.
const repeatsOnly = (intents: AtcIntent[]): boolean =>
  intents.length > 0 &&
  intents.every(
    (intent) =>
      intent.type === "query" &&
      (intent.query === "say_again" || intent.query === "full_readback"),
  );

const initialsOf = (spoken: string): string => {
  const words = spoken.split(/[^\p{L}]+/u).filter(Boolean);

  return words.length >= 3 && words.length <= 4
    ? words.map((word) => word[0]).join("")
    : "";
};

export const resolveDestination = (
  spoken: string,
  aircraft: { latitude: number; longitude: number },
  directory: PipelineInput["directory"],
): DestinationJudgement => {
  const airports = directory?.();

  if (!airports) {
    return { kind: "unresolvable", text: spoken };
  }

  let { candidates, confident } = airports.shortlist(spoken, { near: aircraft, limit: 3 });

  // Cue words in front of or behind the name ("destino Harbor Field") match
  // nothing, so try again without them.
  const words = spoken.split(/\s+/).filter(Boolean);

  for (let drop = 1; candidates.length === 0 && drop <= 2 && words.length - drop >= 1; drop++) {
    for (const trimmed of [words.slice(drop), words.slice(0, -drop)]) {
      const phrase = trimmed.join(" ");

      // "Field" left over from "Xyzzy Field" names nothing in particular.
      if (!hasSignificantWords(phrase)) {
        continue;
      }

      const retry = airports.shortlist(phrase, { near: aircraft, limit: 3 });

      if (retry.candidates.length > 0) {
        ({ candidates, confident } = retry);
        break;
      }
    }
  }

  if (confident) {
    return { kind: "resolved", airport: toAirportRef(candidates[0].airport) };
  }

  // A code spelled out as words ("Sierra Alpha Bravo Echo"): only tried when
  // the words did not already name an airport, so a real name is never
  // mistaken for a code.
  const spelled = airports.byCode(initialsOf(spoken));

  if (spelled) {
    return { kind: "resolved", airport: toAirportRef(spelled) };
  }

  if (candidates.length < 2) {
    return { kind: "unknown", text: spoken };
  }

  const options = candidates.slice(0, 2).map((c) => toAirportRef(c.airport));

  // Two airports that would sound the same are told apart by their full names.
  return {
    kind: "ambiguous",
    options:
      options[0].name === options[1].name
        ? candidates.slice(0, 2).map((c) => ({ ...toAirportRef(c.airport), name: c.airport.name }))
        : options,
  };
};

export const createPipelineState = (
  runway: string,
  record: PilotRecord,
  options: EngineStateOptions = {},
): PipelineState => ({
  engine: createEngineState(runway, options),
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
  const timings: StageTimings = {
    classifyMs: 0,
    intakeMs: 0,
    extractMs: 0,
    verifyMs: 0,
    renderMs: 0,
  };

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

    if (message && message.type !== "emergency" && needsIntake(previous.engine)) {
      const intakeStart = performance.now();
      const words = await extractFlightIntake(
        pilotTransmission,
        callsign,
        previous.lastAtcTransmission,
      );

      timings.intakeMs = performance.now() - intakeStart;

      if (words) {
        message = {
          ...message,
          intake: {
            ...(words.rules ? { rules: words.rules } : {}),
            local: words.local,
            ...(words.destinationText
              ? { destination: resolveDestination(words.destinationText, aircraft, input.directory) }
              : {}),
          },
        };
      }
    }

    const taxi = previous.engine.taxi;

    if (
      message &&
      taxi &&
      findPendingReadback(previous.engine)?.kind === "taxi" &&
      message.type !== "emergency"
    ) {
      const verifyStart = performance.now();
      const taxiReadback = await verifyTaxiReadback({
        transcript: pilotTransmission,
        legs: taxi.legs,
        holdShort: taxi.holdShort,
        callsign,
        expectedRunway: taxi.holdShort ?? (taxi.destination.kind === "runway" ? taxi.destination.runway : undefined),
        destination:
          taxi.destination.kind === "runway"
            ? `runway ${taxi.destination.runway}`
            : taxi.destination.name,
        knownNonTaxiways: [
          taxi.holdShort,
          taxi.destination.kind === "runway" ? taxi.destination.runway : taxi.destination.name,
        ].filter((text): text is string => text !== undefined),
      });
      timings.verifyMs = performance.now() - verifyStart;
      message = { ...message, taxiReadback };
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
      lastAtcTransmission: repeatsOnly(decision.intents)
        ? previous.lastAtcTransmission
        : (rendered?.text ?? previous.lastAtcTransmission),
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
