import { AtcIntent, ReportPoint } from "../domain/AtcIntent";
import { ClearanceKind } from "../domain/Clearance";
import { EngineState } from "../domain/EngineState";
import { withClearance, withStatus } from "./clearances";
import { Decision } from "./decisionTypes";

export const silent = (state: EngineState): Decision => ({
  intents: [],
  state,
});

export const say = (intent: AtcIntent, state: EngineState): Decision => ({
  intents: [intent],
  state,
});

export const ask = (
  query: Extract<AtcIntent, { type: "query" }>["query"],
  state: EngineState,
): Decision => say({ type: "query", query }, state);

export const clear = (
  state: EngineState,
  kind: ClearanceKind,
  nowMs: number,
  expectReport?: ReportPoint,
): Decision => {
  const completed = kind === "takeoff" ? ["line_up_and_wait" as const] : [];

  return {
    intents: [
      { type: "issue_clearance", clearance: kind, runway: state.runway, expectReport },
    ],
    state: {
      ...withClearance(withStatus(state, completed, "completed"), kind, nowMs),
      expectedReport: expectReport,
    },
  };
};

export const instructReport = (
  state: EngineState,
  expectReport: ReportPoint,
): Decision =>
  say({ type: "instruct", instruction: "report", expectReport }, {
    ...state,
    expectedReport: expectReport,
  });
