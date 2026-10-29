import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { decideEvents, decideTick } from "./decideEvents";
import { decideTransmission } from "./decideTransmission";
import { ask } from "./decisions";
import { Decision, DecisionInput } from "./types";

export const decide = (
  input: DecisionInput,
  previous: EngineState,
): Decision => {
  const { pilot, events, ...ctx } = input;
  const intents: AtcIntent[] = [];
  let state = previous;

  const apply = (decision: Decision): void => {
    intents.push(...decision.intents);
    state = decision.state;
  };

  if (pilot.status === "heard") {
    apply(decideTransmission(ctx, state, pilot.message));
  } else if (pilot.status === "unintelligible") {
    apply(ask("say_again", { ...state, contacted: true }));
  }

  apply(decideEvents(ctx, state, events));
  apply(decideTick(ctx, state));

  return { intents, state };
};
