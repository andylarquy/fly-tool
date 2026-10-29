import { AtcIntent } from "../domain/AtcIntent";
import { FlightEvent } from "../domain/FlightEvent";
import { FlightPhase } from "../domain/FlightPhase";
import { isAirbornePhase } from "../situation/classifyPhase";
import { findActive, withStatus } from "./clearances";
import { Decision, DecisionContext } from "./decisionTypes";
import { EngineState } from "../domain/EngineState";

const LANDING_KINDS = ["land" as const, "touch_and_go" as const];

export const decideEvents = (
  ctx: DecisionContext,
  previous: EngineState,
  events: FlightEvent[],
): Decision => {
  let state = previous;
  const intents: AtcIntent[] = [];

  for (const event of events) {
    switch (event.type) {
      case "phase_changed":
        if (isAirbornePhase(event.to) && event.to !== FlightPhase.Upwind) {
          state = withStatus(state, ["line_up_and_wait", "takeoff"], "completed");
        }
        break;

      case "touchdown":
        state = withStatus(state, ["land"], "completed");

        if (ctx.situation.phase === FlightPhase.LandingRoll) {
          intents.push({
            type: "instruct",
            instruction: "vacate_runway",
            runway: event.runway ?? state.runway,
            touchdownFeetPerMinute: event.verticalSpeedFeetPerMinute,
          });
        }
        break;

      case "go_around":
        if (findActive(state, LANDING_KINDS)) {
          intents.push({
            type: "instruct",
            instruction: "go_around",
            runway: state.runway,
            expectReport: "downwind",
          });
          state = {
            ...withStatus(state, LANDING_KINDS, "cancelled"),
            expectedReport: "downwind",
          };
        }
        break;

      case "entered_airspace":
        state = { ...state, airspaceEnteredAtMs: event.atMs };
        break;

      case "left_airspace":
        state = { ...state, airspaceEnteredAtMs: undefined };
        break;

      case "lifted_off":
        break;
    }
  }

  return { intents, state };
};
