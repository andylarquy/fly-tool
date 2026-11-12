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
import { decideEmergency, hasEmergencyDetails } from "./decideEmergency";
import {
  decideTaxiRequest,
  isOnTaxiNetwork,
  repeatTaxiInstruction,
} from "./decideTaxi";
import { ask, clear, instructReport, say, silent } from "./intentBuilders";
import {
  asReportPoint,
  isOnNamedLeg,
  isClaimCompatible,
  nextReportForPhase,
  reportAfter,
} from "./pattern";
import { holdingShortRunway } from "../taxi/routing";
import { Decision, DecisionContext } from "./decisionTypes";
import { applyIntake } from "./decideIntake";
import { handOffTo, hasSeparatePositions, positionForRequest } from "./positions";

const MAX_READBACK_REJECTIONS = 2;
const LANDING_KINDS = ["land" as const, "touch_and_go" as const];

const runwayOf = ({ airport }: DecisionContext, state: EngineState): Runway => {
  const runway = airport.runways.find((r) => r.designator === state.runway);

  if (!runway) {
    throw new Error(`Runway ${state.runway} not found at ${airport.icao}`);
  }

  return runway;
};

const requestDeparture = (
  ctx: DecisionContext,
  state: EngineState,
): Decision => {
  const { situation } = ctx;

  if (findActive(state, ["takeoff"])) {
    return silent(state);
  }

  const lineUp = (): Decision =>
    findActive(state, ["line_up_and_wait"])
      ? silent(state)
      : clear(state, "line_up_and_wait", situation.observedAtMs);

  if (situation.phase !== FlightPhase.LinedUp && isAtActiveHoldLine(ctx, state)) {
    return lineUp();
  }

  switch (situation.phase) {
    case FlightPhase.LinedUp:
      return clear(state, "takeoff", situation.observedAtMs);
    case FlightPhase.HoldingShort:
      return situation.holdingShortRunway === state.runway
        ? lineUp()
        : decideTaxiRequest(ctx, state, "runway");
    case FlightPhase.Stationary:
    case FlightPhase.Taxiing:
      return isOnTaxiNetwork(ctx)
        ? decideTaxiRequest(ctx, state, "runway")
        : lineUp();
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
    case "taxi":
      return decideTaxiRequest(ctx, state, "runway");
    case "parking":
      return decideTaxiRequest(ctx, state, "parking");
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

// How much of a taxi readback has to be right depends on the controller: a
// strict one wants the whole route and the hold-short back, a normal one the
// hold-short and no wrong names, a relaxed one only the right runway (a wrong
// turn is still caught later by the progress check). What the pilot actually
// said was judged by the model; this only applies the tier.
const checkTaxiFidelity = (
  { style }: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision | undefined => {
  const taxi = state.taxi;
  const heard = message.taxiReadback;

  if (!taxi || !heard) {
    return undefined;
  }

  // The model's judgement can be wrong, and at temperature 0 the same words
  // would be rejected again, so one instruction is only rejected so many times.
  const rejections = taxi.readbackRejections ?? 0;

  if (rejections >= MAX_READBACK_REJECTIONS) {
    return undefined;
  }

  const counted: EngineState = {
    ...state,
    taxi: { ...taxi, readbackRejections: rejections + 1 },
  };

  // A wrong runway is corrected whatever the controller's strictness.
  if (heard.runwayMismatch) {
    return repeatTaxiInstruction(counted, "readback_error");
  }

  if (style.strictness === "relaxed") {
    return undefined;
  }

  if (heard.mentionsOtherTaxiway) {
    return repeatTaxiInstruction(counted, "readback_error");
  }

  const expected = taxi.legs.flatMap((leg) => (leg.kind === "taxiway" ? [leg.name] : []));
  const missing = expected.filter((name) => !heard.taxiwaysRepeated.includes(name));
  const lacksHoldShort = taxi.holdShort !== undefined && !heard.holdShortRepeated;

  return lacksHoldShort || (style.strictness === "strict" && missing.length > 0)
    ? ask("full_readback", counted)
    : undefined;
};

const decideReadback = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  const { style } = ctx;
  const pending = findPendingReadback(state);

  if (!pending) {
    return silent(state);
  }

  // For a taxi instruction the verifier has compared the pilot's own words with
  // it, runway included. The classifier's subject and runway are a guess at
  // the same thing (it once filed a correct taxi readback under "line up") and
  // must not overrule it.
  const verified = pending.kind === "taxi" && message.taxiReadback !== undefined;
  const expectedKinds = verified ? undefined : kindsForSubject(message.subject);
  const wrongClearance = expectedKinds && !expectedKinds.includes(pending.kind);
  const wrongRunway =
    !verified &&
    message.runway !== null &&
    pending.runway !== "" &&
    message.runway !== pending.runway;

  if ((wrongClearance || wrongRunway) && pending.kind === "taxi") {
    return repeatTaxiInstruction(state, "readback_error");
  }

  if (wrongClearance || wrongRunway) {
    return say(
      { type: "correct_readback", clearance: pending.kind, runway: pending.runway },
      state,
    );
  }

  if (pending.kind === "taxi") {
    const fidelity = checkTaxiFidelity(ctx, state, message);

    if (fidelity) {
      return fidelity;
    }
  }

  if (
    expectedKinds &&
    message.runway === null &&
    pending.runway !== "" &&
    style.strictness === "strict"
  ) {
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
    case "taxi":
    case "parking":
      return repeatTaxiInstruction(state, "repeat");
    default:
      return say({ type: "unable", reason: "no_information" }, state);
  }
};

const STOPPED_KNOTS = 1.5;

// The committed phase needs a few seconds of standing still, so a pilot who
// stops at the line and reports at once would be told they are still taxiing.
// The aircraft's own position and speed answer that immediately.
const isAtActiveHoldLine = (ctx: DecisionContext, state: EngineState): boolean =>
  (ctx.situation.phase === FlightPhase.HoldingShort &&
    ctx.situation.holdingShortRunway === state.runway) ||
  (ctx.airport.taxi !== undefined &&
    ctx.aircraft.isOnGround &&
    ctx.aircraft.groundSpeed < STOPPED_KNOTS &&
    holdingShortRunway(ctx.airport.taxi, ctx.aircraft) === state.runway);

const RUNWAY_CLEARANCES = ["line_up_and_wait", "takeoff", "land", "touch_and_go"] as const;

// An aircraft that is lined up on the runway with nothing cleared, and calls
// the tower without asking for anything, gets what a tower with no traffic
// would give it: the takeoff clearance. (The alternative is silence, with an
// aircraft sitting on the runway.) A pilot who explicitly asks for something,
// reports a pattern leg or declares an emergency is handled as usual.
const decideLinedUpCall = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision | undefined => {
  const withTower = !hasSeparatePositions(ctx.airport) || state.position === "tower";

  if (
    ctx.situation.phase !== FlightPhase.LinedUp ||
    !withTower ||
    !["readback", "position_report", "other"].includes(message.type) ||
    asReportPoint(message.subject) ||
    message.subject === "airborne" ||
    findActive(state, [...RUNWAY_CLEARANCES])
  ) {
    return undefined;
  }

  return clear(state, "takeoff", ctx.situation.observedAtMs);
};

// "Holding short runway 23" is a report of where the aircraft is, so the
// telemetry decides what it means. At the active runway's hold line it says
// the pilot is ready: to ground it is the end of the taxi (hand over to tower),
// to tower it is a call for the departure clearance. Anywhere else on the
// ground it is not true, and the controller says what it sees instead.
const decideHoldShortReport = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision | undefined => {
  if (
    message.subject !== "hold_short" ||
    message.type === "request" ||
    findPendingReadback(state) !== undefined ||
    !ctx.situation.onGround
  ) {
    return undefined;
  }

  if (isAtActiveHoldLine(ctx, state)) {
    return hasSeparatePositions(ctx.airport) && state.position === "ground"
      ? handOffTo(ctx, state, "tower")
      : requestDeparture(ctx, state);
  }

  if (ctx.situation.phase === FlightPhase.HoldingShort || ctx.situation.onRunway) {
    return undefined;
  }

  return say(
    {
      type: "query",
      query: "confirm_position",
      claimed: "hold_short",
      observed: ctx.situation.phase,
    },
    state,
  );
};

// A reply the model judged to be repeating the pending taxi instruction is its
// readback, whatever the classifier labeled it (the small model often labels a
// short readback a request).
const isTaxiReadback = (state: EngineState, message: PilotMessage): boolean =>
  message.taxiReadback?.readsBack === true &&
  (message.type === "request" || message.type === "other" || message.type === "position_report") &&
  findPendingReadback(state)?.kind === "taxi";

export const decidePilotMessage = (
  ctx: DecisionContext,
  previous: EngineState,
  heard: PilotMessage,
): Decision => {
  const checkIn = previous.awaitingCheckIn;
  let state: EngineState = { ...previous, contacted: true, awaitingCheckIn: undefined };
  // "Downwind" said after "report downwind" looks like an echo of it to the
  // model. The aircraft's own position tells a report from a readback: a
  // readback of "report base" names a leg the aircraft has not reached.
  const message: PilotMessage = isTaxiReadback(state, heard)
    ? { ...heard, type: "readback" }
    : heard.type === "readback" && isOnNamedLeg(heard.subject, ctx.situation.phase)
      ? { ...heard, type: "position_report" }
      : heard;

  if (message.type === "emergency" || (state.emergency && hasEmergencyDetails(message))) {
    return decideEmergency(ctx, state, message);
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

  const belongsTo = hasSeparatePositions(ctx.airport)
    ? positionForRequest(ctx, state, message)
    : undefined;

  if (belongsTo && belongsTo !== state.position) {
    return handOffTo(ctx, state, belongsTo);
  }

  const intake = applyIntake(ctx, state, message, (next, deferred) =>
    decidePilotMessage(ctx, next, deferred),
  );

  if (intake.decision) {
    return intake.decision;
  }

  state = intake.state;

  const linedUpCall = decideLinedUpCall(ctx, state, message);

  if (linedUpCall) {
    return linedUpCall;
  }

  const holdShortReport = decideHoldShortReport(ctx, state, message);

  if (holdShortReport) {
    return holdShortReport;
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
      if (asReportPoint(message.subject) || message.subject === "airborne") {
        return decidePositionReport(ctx, state, message);
      }

      // The first call to a controller who has just taken over, with nothing
      // asked: answer it, as a controller would.
      if (checkIn && message.type === "other" && message.subject === "other") {
        return say(
          {
            type: "check_in_reply",
            position: checkIn,
            holdShort: isAtActiveHoldLine(ctx, state) ? state.runway : undefined,
          },
          state,
        );
      }

      return ctx.style.strictness === "relaxed"
        ? say({ type: "acknowledge", kind: "courtesy" }, state)
        : silent(state);
  }
};
