import { ControllerStyle, Strictness } from "../domain/ControllerStyle";
import { FacilityRelationship } from "../domain/PilotRecord";

export type Familiarity = "stranger" | "acquaintance" | "regular";

const REGULAR_FROM_VISITS = 5;
const LAPSED_AFTER_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const STRICT_TRAFFIC_FOR_STRANGER = 3;
const STRICT_TRAFFIC_FOR_ACQUAINTANCE = 6;
const RELAXED_TRAFFIC_LIMIT = 2;

export const daysSince = (thenMs: number, nowMs: number): number =>
  (nowMs - thenMs) / MS_PER_DAY;

// `history` is what the controller knew before the current visit began.
export const familiarityOf = (
  history: FacilityRelationship | undefined,
  nowEpochMs: number,
): Familiarity => {
  if (!history || history.visitCount < 1) {
    return "stranger";
  }

  const lapsed = daysSince(history.lastSeenAtMs, nowEpochMs) > LAPSED_AFTER_DAYS;

  if (history.visitCount >= REGULAR_FROM_VISITS && !lapsed) {
    return "regular";
  }

  return lapsed && history.visitCount < REGULAR_FROM_VISITS
    ? "stranger"
    : "acquaintance";
};

export const strictnessFor = (
  familiarity: Familiarity,
  trafficCount: number,
): Strictness => {
  switch (familiarity) {
    case "stranger":
      return trafficCount >= STRICT_TRAFFIC_FOR_STRANGER ? "strict" : "normal";
    case "acquaintance":
      return trafficCount >= STRICT_TRAFFIC_FOR_ACQUAINTANCE ? "strict" : "normal";
    case "regular":
      return trafficCount <= RELAXED_TRAFFIC_LIMIT ? "relaxed" : "normal";
  }
};

export const deriveStyle = (
  history: FacilityRelationship | undefined,
  nowEpochMs: number,
  trafficCount = 0,
): ControllerStyle => ({
  strictness: strictnessFor(familiarityOf(history, nowEpochMs), trafficCount),
});
