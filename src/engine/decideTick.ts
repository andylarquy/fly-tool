import { FlightPhase } from "../domain/FlightPhase";
import { EngineState } from "../domain/EngineState";
import { findActive } from "./clearances";
import { Decision, DecisionContext } from "./decisionTypes";
import { decideTaxiProgress } from "./decideTaxi";
import { clear } from "./intentBuilders";
import { handOffTo } from "./positions";

const CONTACT_TIMEOUT_MS = 30_000;

export const decideTick = (
  ctx: DecisionContext,
  previous: EngineState,
): Decision => {
  const { situation } = ctx;
  const progress = decideTaxiProgress(ctx, previous);

  if (progress.intents.length > 0) {
    return progress;
  }

  let state = progress.state;

  if (state.awaitingGroundHandoff) {
    if (!situation.onGround) {
      state = { ...state, awaitingGroundHandoff: undefined };
    } else if (
      !situation.onRunway &&
      situation.phase !== FlightPhase.LandingRoll &&
      state.position === "tower"
    ) {
      return handOffTo(ctx, state, "ground");
    }
  }

  if (
    situation.phase === FlightPhase.LinedUp &&
    findActive(state, ["line_up_and_wait"]) &&
    !findActive(state, ["takeoff"])
  ) {
    return clear(state, "takeoff", situation.observedAtMs);
  }

  if (
    state.airspaceEnteredAtMs !== undefined &&
    situation.observedAtMs - state.airspaceEnteredAtMs >= CONTACT_TIMEOUT_MS
  ) {
    return {
      intents: state.contacted
        ? []
        : [{ type: "query", query: "say_intentions" }],
      state: { ...state, airspaceEnteredAtMs: undefined },
    };
  }

  return { intents: [], state };
};
