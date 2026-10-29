import { Clearance, ClearanceKind, ClearanceStatus } from "../domain/Clearance";
import { EngineState } from "../domain/EngineState";
import { PilotMessageSubject } from "../domain/PilotMessage";

const ACTIVE_STATUSES: ClearanceStatus[] = ["issued", "acknowledged"];

const KINDS_BY_SUBJECT: Partial<Record<PilotMessageSubject, ClearanceKind[]>> = {
  takeoff: ["takeoff"],
  landing: ["land", "touch_and_go"],
  line_up: ["line_up_and_wait"],
  pattern_entry: ["pattern_entry"],
  taxi: ["taxi"],
  parking: ["taxi"],
};

export const kindsForSubject = (
  subject: PilotMessageSubject,
): ClearanceKind[] | undefined => KINDS_BY_SUBJECT[subject];

export const findActive = (
  state: EngineState,
  kinds: ClearanceKind[],
): Clearance | undefined =>
  state.clearances.find(
    (c) => kinds.includes(c.kind) && ACTIVE_STATUSES.includes(c.status),
  );

export const findPendingReadback = (
  state: EngineState,
): Clearance | undefined =>
  [...state.clearances].reverse().find((c) => c.status === "issued");

export const withClearance = (
  state: EngineState,
  kind: ClearanceKind,
  nowMs: number,
  runway = state.runway,
): EngineState => ({
  ...state,
  clearances: [
    ...state.clearances,
    { kind, runway, issuedAtMs: nowMs, status: "issued" },
  ],
});

export const withStatus = (
  state: EngineState,
  kinds: ClearanceKind[],
  status: ClearanceStatus,
): EngineState => ({
  ...state,
  clearances: state.clearances.map((c) =>
    kinds.includes(c.kind) && ACTIVE_STATUSES.includes(c.status)
      ? { ...c, status }
      : c,
  ),
});

export const withAcknowledged = (
  state: EngineState,
  pending: Clearance,
): EngineState => ({
  ...state,
  clearances: state.clearances.map((c) =>
    c === pending ? { ...c, status: "acknowledged" } : c,
  ),
});
