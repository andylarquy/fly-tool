import { Runway } from "../domain/Airport";
import { EngineState } from "../domain/EngineState";
import { FlightPhase } from "../domain/FlightPhase";
import { PilotMessage } from "../domain/PilotMessage";
import {
  findActive,
  findPendingReadback,
  kindsForSubject,
  withAcknowledged,
  withClearance,
  withStatus,
} from "./clearances";
import { ask, clear, instructReport, say, silent } from "./decisions";
import {
  asReportPoint,
  isClaimCompatible,
  nextReportForPhase,
  reportAfter,
} from "./pattern";
import { Decision, DecisionContext } from "./types";

const LANDING_KINDS = ["land" as const, "touch_and_go" as const];

const runwayOf = ({ airport }: DecisionContext, state: EngineState): Runway => {
  const runway = airport.runways.find((r) => r.designator === state.runway);

  if (!runway) {
    throw new Error(`Runway ${state.runway} not found at ${airport.icao}`);
  }

  return runway;
};

const requestDeparture = (
  { situation }: DecisionContext,
  state: EngineState,
): Decision => {
  if (findActive(state, ["takeoff"])) {
    return silent(state);
  }

  switch (situation.phase) {
    case FlightPhase.LinedUp:
      return clear(state, "takeoff", situation.observedAtMs);
    case FlightPhase.Stationary:
    case FlightPhase.Taxiing:
      return findActive(state, ["line_up_and_wait"])
        ? silent(state)
        : clear(state, "line_up_and_wait", situation.observedAtMs);
    default:
      return ask("say_again", state);
  }
};

const enterPattern = (
  ctx: DecisionContext,
  state: EngineState,
): Decision => {
  if (findActive(state, ["pattern_entry"])) {
    return silent(state);
  }

  return say(
    {
      type: "instruct",
      instruction: "enter_pattern",
      runway: state.runway,
      patternSide: runwayOf(ctx, state).patternSide,
      altitudeFeetAgl: ctx.airport.patternAltitudeFeetAgl,
      expectReport: "downwind",
    },
    {
      ...withClearance(state, "pattern_entry", ctx.situation.observedAtMs),
      expectedReport: "downwind",
    },
  );
};

const directArrival = (
  ctx: DecisionContext,
  state: EngineState,
  wantsLanding: boolean,
): Decision => {
  const { phase, onGround, observedAtMs } = ctx.situation;

  if (wantsLanding && findActive(state, LANDING_KINDS)) {
    return silent(state);
  }

  if (wantsLanding && (phase === FlightPhase.Base || phase === FlightPhase.Final)) {
    return clear(state, "land", observedAtMs);
  }

  if (onGround || phase === FlightPhase.Final) {
    return onGround ? ask("say_again", state) : silent(state);
  }

  const next = nextReportForPhase(phase);

  return next ? instructReport(state, next) : enterPattern(ctx, state);
};

const decideRequest = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  switch (message.subject) {
    case "takeoff":
    case "line_up":
    case "hold_short":
      return requestDeparture(ctx, state);
    case "landing":
      return directArrival(ctx, state, true);
    case "pattern_entry":
      return directArrival(ctx, state, false);
    case "altitude":
      return say({ type: "unable", reason: "not_supported" }, state);
    default:
      return ask("say_again", state);
  }
};

const decideReadback = (
  { style }: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  const pending = findPendingReadback(state);

  if (!pending) {
    return silent(state);
  }

  const expectedKinds = kindsForSubject(message.subject);
  const wrongClearance = expectedKinds && !expectedKinds.includes(pending.kind);
  const wrongRunway = message.runway !== null && message.runway !== pending.runway;

  if (wrongClearance || wrongRunway) {
    return say(
      { type: "correct_readback", clearance: pending.kind, runway: pending.runway },
      state,
    );
  }

  if (expectedKinds && message.runway === null && style.strictness === "strict") {
    return ask("full_readback", state);
  }

  const acknowledged = withAcknowledged(state, pending);

  return style.strictness === "strict"
    ? say({ type: "acknowledge", kind: "readback_correct" }, acknowledged)
    : silent(acknowledged);
};

const decidePositionReport = (
  { situation }: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  const { phase, observedAtMs } = situation;
  const claimed = asReportPoint(message.subject);

  if (claimed) {
    if (!isClaimCompatible(claimed, phase)) {
      return say(
        { type: "query", query: "confirm_position", claimed, observed: phase },
        state,
      );
    }

    if (claimed === "final" && !findActive(state, LANDING_KINDS)) {
      return clear(state, "land", observedAtMs);
    }

    if (state.expectedReport === claimed) {
      const next = reportAfter(claimed);

      return next
        ? instructReport(state, next)
        : silent({ ...state, expectedReport: undefined });
    }

    return silent(state);
  }

  if (
    message.subject === "airborne" &&
    phase === FlightPhase.Upwind &&
    findActive(state, ["takeoff"])
  ) {
    return instructReport(withStatus(state, ["takeoff"], "completed"), "downwind");
  }

  return silent(state);
};

const decideQuestion = (
  { aircraft }: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  switch (message.subject) {
    case "heading":
      return say(
        {
          type: "advise",
          topic: "heading",
          value: Math.round(aircraft.trueHeading) % 360 || 360,
        },
        state,
      );
    case "airborne":
      return say(
        { type: "advise", topic: "airborne", value: !aircraft.isOnGround },
        state,
      );
    default:
      return say({ type: "unable", reason: "no_information" }, state);
  }
};

export const decideTransmission = (
  ctx: DecisionContext,
  previous: EngineState,
  message: PilotMessage,
): Decision => {
  const state = { ...previous, contacted: true };

  if (message.type === "emergency") {
    return say({ type: "emergency_response" }, { ...state, emergency: true });
  }

  if (message.subject === "go_around") {
    return say(
      {
        type: "instruct",
        instruction: "go_around",
        runway: state.runway,
        expectReport: "downwind",
      },
      { ...withStatus(state, LANDING_KINDS, "cancelled"), expectedReport: "downwind" },
    );
  }

  switch (message.type) {
    case "request":
      return decideRequest(ctx, state, message);
    case "readback":
      return decideReadback(ctx, state, message);
    case "position_report":
      return decidePositionReport(ctx, state, message);
    case "question":
      return decideQuestion(ctx, state, message);
    default:
      return ctx.style.strictness === "relaxed"
        ? say({ type: "acknowledge", kind: "courtesy" }, state)
        : silent(state);
  }
};
