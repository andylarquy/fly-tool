import { FlightPhase } from "../domain/FlightPhase";
import { EngineState } from "../domain/EngineState";
import { findActive } from "./clearances";
import { Decision, DecisionContext } from "./decisionTypes";
import { decideTaxiProgress } from "./decideTaxi";
import { clear } from "./intentBuilders";

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

  const state = progress.state;

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
