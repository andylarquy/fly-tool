import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { FlightPhase } from "../domain/FlightPhase";
import {
  TaxiDestination,
  TaxiInstructionReason,
  TaxiState,
} from "../domain/Taxi";
import { TaxiNetwork } from "../domain/TaxiNetwork";
import {
  distanceToPointFeet,
  distanceToRouteFeet,
  firstCrossingOf,
  holdShortPointFor,
  isOnNetwork,
  legsAlong,
  nearestParking,
  planRouteFrom,
  TaxiRoute,
} from "../taxi/routing";
import { findActive, withClearance, withStatus } from "./clearances";
import { Decision, DecisionContext } from "./decisionTypes";
import { say, silent } from "./intentBuilders";

const OFF_ROUTE_FEET = 120;
const OFF_ROUTE_CONFIRM_MS = 4_000;
const CORRECTION_COOLDOWN_MS = 30_000;
const INCURSION_COOLDOWN_MS = 20_000;
const MOVING_KNOTS = 3;
const ARRIVED_FEET = 100;

const RUNWAY_CLEARANCES = ["line_up_and_wait", "takeoff", "land", "touch_and_go"] as const;

const instructionFrom = (
  taxi: TaxiState,
  reason: TaxiInstructionReason,
): Extract<AtcIntent, { type: "taxi_instruction" }> => ({
  type: "taxi_instruction",
  reason,
  destination: taxi.destination,
  legs: taxi.legs,
  holdShort: taxi.holdShort,
});

const sameDestination = (a: TaxiDestination, b: TaxiDestination): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const destinationRunway = (destination: TaxiDestination): string | undefined =>
  destination.kind === "runway" ? destination.runway : undefined;

// The active runway is never crossed on the strength of the first
// instruction: the pilot is told to hold short and is cleared across later.
const planInstruction = (
  network: TaxiNetwork,
  route: TaxiRoute,
  destination: TaxiDestination,
  activeRunway: string,
): TaxiState => {
  const crossing = firstCrossingOf(network, route.pointIds, activeRunway);

  if (!crossing) {
    return {
      destination,
      pointIds: route.pointIds,
      legs: route.legs,
      holdShort: destinationRunway(destination),
    };
  }

  return {
    destination,
    pointIds: route.pointIds,
    legs: legsAlong(network, route.pointIds.slice(0, crossing.startIndex + 1)),
    holdShort: activeRunway,
    holdAtIndex: crossing.startIndex,
  };
};

export const isOnTaxiNetwork = ({ airport, aircraft }: DecisionContext): boolean =>
  airport.taxi !== undefined && isOnNetwork(airport.taxi, aircraft);

export const repeatTaxiInstruction = (
  state: EngineState,
  reason: TaxiInstructionReason,
): Decision =>
  state.taxi
    ? say(instructionFrom(state.taxi, reason), state)
    : say({ type: "unable", reason: "no_information" }, state);

export const decideTaxiRequest = (
  ctx: DecisionContext,
  state: EngineState,
  kind: TaxiDestination["kind"],
): Decision => {
  const { airport, aircraft, situation } = ctx;
  const network = airport.taxi;

  if (!network || !situation.onGround) {
    return say({ type: "query", query: "say_again" }, state);
  }

  const activeRunway = airport.runways.find((r) => r.designator === state.runway);
  const spot = kind === "parking" ? nearestParking(network, aircraft) : undefined;

  const destination: TaxiDestination | undefined =
    kind === "runway" ? { kind: "runway", runway: state.runway } : spot && { kind: "parking", name: spot.name };

  const targetId =
    kind === "runway"
      ? activeRunway && holdShortPointFor(network, activeRunway)?.id
      : spot?.pointId;

  const route =
    destination && targetId !== undefined ? planRouteFrom(network, aircraft, targetId) : undefined;

  if (!destination || !route) {
    return say({ type: "unable", reason: "no_route" }, state);
  }

  if (route.pointIds.length < 2) {
    return silent(state);
  }

  const reason: TaxiInstructionReason =
    state.taxi && sameDestination(state.taxi.destination, destination) ? "repeat" : "request";

  const taxi = planInstruction(network, route, destination, state.runway);

  const clearances = withClearance(
    withStatus(state, ["taxi"], "cancelled"),
    "taxi",
    situation.observedAtMs,
    destinationRunway(destination) ?? "",
  );

  return say(instructionFrom(taxi, reason), { ...clearances, taxi });
};

const guardRunway = (
  ctx: DecisionContext,
  state: EngineState,
): Decision | undefined => {
  const { situation, airport } = ctx;
  const last = state.taxi?.lastIncursionAtMs;

  if (
    !airport.taxi ||
    !situation.onGround ||
    !situation.onRunway ||
    situation.phase !== FlightPhase.Taxiing ||
    state.taxi?.crossingCleared ||
    findActive(state, [...RUNWAY_CLEARANCES]) ||
    (last !== undefined && situation.observedAtMs - last < INCURSION_COOLDOWN_MS)
  ) {
    return undefined;
  }

  const base: TaxiState = state.taxi ?? {
    destination: { kind: "runway", runway: state.runway },
    pointIds: [],
    legs: [],
  };

  return say(
    { type: "instruct", instruction: "hold_position" },
    { ...state, taxi: { ...base, lastIncursionAtMs: situation.observedAtMs } },
  );
};

// A crossing clearance holds until the aircraft has actually been on the
// runway and left it again.
const trackCrossing = (ctx: DecisionContext, state: EngineState): EngineState => {
  const crossing = state.taxi?.crossingCleared;

  if (!state.taxi || !crossing) {
    return state;
  }

  if (ctx.situation.onRunway && !crossing.sawRunway) {
    return { ...state, taxi: { ...state.taxi, crossingCleared: { ...crossing, sawRunway: true } } };
  }

  return crossing.sawRunway && !ctx.situation.onRunway
    ? { ...state, taxi: { ...state.taxi, crossingCleared: undefined } }
    : state;
};

const clearAcrossActiveRunway = (
  ctx: DecisionContext,
  state: EngineState,
  taxi: TaxiState,
  holdIndex: number,
): Decision | undefined => {
  const network = ctx.airport.taxi!;
  const crossing = firstCrossingOf(network, taxi.pointIds, state.runway, holdIndex);

  if (!crossing) {
    return undefined;
  }

  const next = firstCrossingOf(network, taxi.pointIds, state.runway, crossing.endIndex);
  const stop = next ? next.startIndex + 1 : taxi.pointIds.length;

  const continued: TaxiState = {
    ...taxi,
    legs: legsAlong(network, taxi.pointIds.slice(crossing.endIndex, stop)),
    holdShort: next ? state.runway : destinationRunway(taxi.destination),
    holdAtIndex: next?.startIndex,
    crossingCleared: { runway: state.runway, sawRunway: false },
    offRouteSinceMs: undefined,
  };

  return say(
    { ...instructionFrom(continued, "continue"), crossFirst: state.runway },
    { ...state, taxi: continued },
  );
};

export const decideTaxiProgress = (
  ctx: DecisionContext,
  previous: EngineState,
): Decision => {
  const { airport, aircraft, situation } = ctx;
  const network = airport.taxi;

  if (!network) {
    return silent(previous);
  }

  const incursion = guardRunway(ctx, previous);

  if (incursion) {
    return incursion;
  }

  const state = trackCrossing(ctx, previous);
  const taxi = state.taxi;

  if (!taxi || taxi.pointIds.length < 2 || !situation.onGround) {
    return silent(state);
  }

  const moving = aircraft.groundSpeed >= MOVING_KNOTS;

  if (
    taxi.holdAtIndex !== undefined &&
    !moving &&
    distanceToPointFeet(network, taxi.pointIds[taxi.holdAtIndex], aircraft) <= ARRIVED_FEET
  ) {
    if (findActive(state, [...RUNWAY_CLEARANCES])) {
      return silent(state);
    }

    const cleared = clearAcrossActiveRunway(ctx, state, taxi, taxi.holdAtIndex);

    if (cleared) {
      return cleared;
    }
  }

  const targetId = taxi.pointIds[taxi.pointIds.length - 1];

  if (!moving && distanceToPointFeet(network, targetId, aircraft) <= ARRIVED_FEET) {
    return silent({ ...withStatus(state, ["taxi"], "completed"), taxi: undefined });
  }

  const off = distanceToRouteFeet(network, taxi.pointIds, aircraft);

  if (!moving || off <= OFF_ROUTE_FEET) {
    return taxi.offRouteSinceMs === undefined
      ? silent(state)
      : silent({ ...state, taxi: { ...taxi, offRouteSinceMs: undefined } });
  }

  const now = situation.observedAtMs;

  if (taxi.offRouteSinceMs === undefined) {
    return silent({ ...state, taxi: { ...taxi, offRouteSinceMs: now } });
  }

  const coolingDown =
    taxi.lastCorrectionAtMs !== undefined &&
    now - taxi.lastCorrectionAtMs < CORRECTION_COOLDOWN_MS;

  if (now - taxi.offRouteSinceMs < OFF_ROUTE_CONFIRM_MS || coolingDown) {
    return silent(state);
  }

  const route = planRouteFrom(network, aircraft, targetId);

  if (!route) {
    return silent(state);
  }

  const corrected: TaxiState = {
    ...planInstruction(network, route, taxi.destination, state.runway),
    lastCorrectionAtMs: now,
  };

  return say(instructionFrom(corrected, "off_route"), { ...state, taxi: corrected });
};
