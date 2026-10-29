import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { attachRemark } from "./remarks";
import { decideEvents } from "./decideEvents";
import { decideTick } from "./decideTick";
import { decidePilotMessage } from "./decidePilotMessage";
import { ask } from "./intentBuilders";
import { Decision, DecisionInput } from "./decisionTypes";

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
    apply(decidePilotMessage(ctx, state, pilot.message));
  } else if (pilot.status === "unintelligible") {
    apply(ask("say_again", { ...state, contacted: true }));
  }

  apply(decideEvents(ctx, state, events));
  apply(decideTick(ctx, state));

  return attachRemark(ctx, state, intents, events);
};
