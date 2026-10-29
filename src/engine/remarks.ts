import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { FlightEvent } from "../domain/FlightEvent";
import { FlightPhase } from "../domain/FlightPhase";
import { Remark, RemarkKind } from "../domain/Remark";
import { daysSince } from "../memory/familiarity";
import { classifyLanding, isFirmOrWorse } from "../memory/landingQuality";
import { DecisionContext } from "./types";

const MIN_GAP_BETWEEN_REMARKS_MS = 120_000;
const REGULAR_FROM_PRIOR_VISITS = 5;

// A remark only rides along with a plain reply, never with a correction, a
// query or an emergency exchange.
const HOST_INTENTS: AtcIntent["type"][] = [
  "issue_clearance",
  "instruct",
  "advise",
  "acknowledge",
];

const BUSY_PHASES: FlightPhase[] = [
  FlightPhase.TakeoffRoll,
  FlightPhase.Upwind,
  FlightPhase.Base,
  FlightPhase.Final,
  FlightPhase.LandingRoll,
];

const landingRemark = (events: FlightEvent[], intents: AtcIntent[]): RemarkKind | undefined => {
  const vacating = intents.some(
    (intent) => intent.type === "instruct" && intent.instruction === "vacate_runway",
  );
  const touchdown = events.find((event) => event.type === "touchdown");

  if (!vacating || touchdown?.type !== "touchdown") {
    return undefined;
  }

  const quality = classifyLanding(touchdown.verticalSpeedFeetPerMinute);

  if (quality === "smooth") return "smooth_landing";

  return isFirmOrWorse(quality) ? "firm_landing" : undefined;
};

const historyRemark = (ctx: DecisionContext): RemarkKind | undefined => {
  const history = ctx.memory?.history;

  if (!ctx.memory || !history || history.visitCount < 1) {
    return undefined;
  }

  const lastLanding = history.landings.at(-1);

  const kind: RemarkKind =
    lastLanding &&
    isFirmOrWorse(classifyLanding(lastLanding.touchdownVerticalSpeedFeetPerMinute))
      ? "previous_firm_landing"
      : history.visitCount >= REGULAR_FROM_PRIOR_VISITS &&
          daysSince(history.lastSeenAtMs, ctx.memory.epochMs) <= 90
        ? "you_again"
        : "welcome_back";

  return history.lastRemarkKind === kind ? undefined : kind;
};

const isHistoryKind = (kind: RemarkKind): boolean =>
  kind === "welcome_back" || kind === "you_again" || kind === "previous_firm_landing";

export const attachRemark = (
  ctx: DecisionContext,
  state: EngineState,
  intents: AtcIntent[],
  events: FlightEvent[],
): { intents: AtcIntent[]; state: EngineState } => {
  const unchanged = { intents, state };
  const now = ctx.situation.observedAtMs;

  if (
    !ctx.memory ||
    state.emergency ||
    ctx.style.strictness === "strict" ||
    intents.length === 0 ||
    !intents.every((intent) => HOST_INTENTS.includes(intent.type)) ||
    (state.lastRemarkAtMs !== undefined &&
      now - state.lastRemarkAtMs < MIN_GAP_BETWEEN_REMARKS_MS)
  ) {
    return unchanged;
  }

  const kind =
    landingRemark(events, intents) ??
    (BUSY_PHASES.includes(ctx.situation.phase) ? undefined : historyRemark(ctx));

  const alreadyMade =
    kind !== undefined &&
    (state.remarksMade.includes(kind) ||
      (isHistoryKind(kind) && state.remarksMade.some(isHistoryKind)));

  if (!kind || alreadyMade) {
    return unchanged;
  }

  const remark: Remark = { kind };

  return {
    intents: [...intents, { type: "remark", remark }],
    state: {
      ...state,
      remarksMade: [...state.remarksMade, kind],
      lastRemarkAtMs: now,
    },
  };
};
