import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { FlightPhase } from "../domain/FlightPhase";
import { TaxiDestination, TaxiInstructionReason, TaxiState } from "../domain/Taxi";
import {
  distanceToPointFeet,
  distanceToRouteFeet,
  holdShortPointFor,
  nearestParking,
  nearestPoint,
  planRoute,
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
): AtcIntent => ({
  type: "taxi_instruction",
  reason,
  destination: taxi.destination,
  taxiways: taxi.taxiways,
  holdShort: taxi.destination.kind === "runway" ? taxi.destination.runway : undefined,
});

const sameDestination = (a: TaxiDestination, b: TaxiDestination): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const isOnTaxiNetwork = ({ airport, aircraft }: DecisionContext): boolean =>
  airport.taxi !== undefined && nearestPoint(airport.taxi, aircraft) !== undefined;

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

  const start = nearestPoint(network, aircraft);
  const spot = kind === "parking" ? nearestParking(network, aircraft) : undefined;
  const target =
    kind === "runway"
      ? holdShortPointFor(network, state.runway)
      : network.points.find((point) => point.id === spot?.pointId);

  const destination: TaxiDestination | undefined =
    kind === "runway"
      ? { kind: "runway", runway: state.runway }
      : spot && { kind: "parking", name: spot.name };

  const route =
    start && target && destination ? planRoute(network, start.id, target.id) : undefined;

  if (!start || !target || !destination || !route) {
    return say({ type: "unable", reason: "no_route" }, state);
  }

  if (route.pointIds.length < 2) {
    return silent(state);
  }

  const reason: TaxiInstructionReason =
    state.taxi && sameDestination(state.taxi.destination, destination)
      ? "repeat"
      : "request";

  const taxi: TaxiState = {
    destination,
    pointIds: route.pointIds,
    taxiways: route.taxiways,
  };

  const clearances = withClearance(
    withStatus(state, ["taxi"], "cancelled"),
    "taxi",
    situation.observedAtMs,
    destination.kind === "runway" ? destination.runway : "",
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
    findActive(state, [...RUNWAY_CLEARANCES]) ||
    (last !== undefined && situation.observedAtMs - last < INCURSION_COOLDOWN_MS)
  ) {
    return undefined;
  }

  const base: TaxiState = state.taxi ?? {
    destination: { kind: "runway", runway: state.runway },
    pointIds: [],
    taxiways: [],
  };

  return say(
    { type: "instruct", instruction: "hold_position" },
    { ...state, taxi: { ...base, lastIncursionAtMs: situation.observedAtMs } },
  );
};

export const decideTaxiProgress = (
  ctx: DecisionContext,
  state: EngineState,
): Decision => {
  const { airport, aircraft, situation } = ctx;
  const network = airport.taxi;

  if (!network) {
    return silent(state);
  }

  const incursion = guardRunway(ctx, state);

  if (incursion) {
    return incursion;
  }

  const taxi = state.taxi;

  if (!taxi || taxi.pointIds.length < 2 || !situation.onGround) {
    return silent(state);
  }

  const targetId = taxi.pointIds[taxi.pointIds.length - 1];
  const moving = aircraft.groundSpeed >= MOVING_KNOTS;

  if (
    !moving &&
    distanceToPointFeet(network, targetId, aircraft) <= ARRIVED_FEET
  ) {
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

  const here = nearestPoint(network, aircraft);
  const route = here ? planRoute(network, here.id, targetId) : undefined;

  if (!route) {
    return silent(state);
  }

  const corrected: TaxiState = {
    ...taxi,
    pointIds: route.pointIds,
    taxiways: route.taxiways,
    offRouteSinceMs: undefined,
    lastCorrectionAtMs: now,
  };

  return say(instructionFrom(corrected, "off_route"), { ...state, taxi: corrected });
};
