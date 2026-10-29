import { AtcIntent } from "../domain/AtcIntent";
import {
  EmergencyDetails,
  EmergencyQuestion,
  EmergencyState,
} from "../domain/Emergency";
import { EngineState } from "../domain/EngineState";
import { FlightPhase } from "../domain/FlightPhase";
import { PilotMessage } from "../domain/PilotMessage";
import { findActive } from "./clearances";
import { clear } from "./decisions";
import { Decision, DecisionContext } from "./types";

const LANDING_INTENTIONS = ["land_at_airport", "land_ahead"];

// Questions about souls and fuel wait until the pilot is not busy flying the
// departure or the approach.
const BUSY_PHASES: FlightPhase[] = [
  FlightPhase.TakeoffRoll,
  FlightPhase.Upwind,
  FlightPhase.Base,
  FlightPhase.Final,
  FlightPhase.LandingRoll,
];

export const hasEmergencyDetails = (message: PilotMessage): boolean =>
  message.emergency !== undefined &&
  Object.keys(message.emergency).length > 0;

const nextQuestions = (
  details: EmergencyDetails,
  asked: EmergencyQuestion[],
  busy: boolean,
): EmergencyQuestion[] => {
  const priority: EmergencyQuestion[] = [];

  if (!details.nature) priority.push("nature");
  if (!details.intention) priority.push("intention");

  if (priority.length > 0) {
    return priority.filter((question) => !asked.includes(question));
  }

  if (busy) {
    return [];
  }

  const secondary: EmergencyQuestion[] = [];

  if (!details.soulsOnBoard) secondary.push("souls");
  if (!details.fuelEnduranceMinutes) secondary.push("fuel");

  return secondary.filter((question) => !asked.includes(question));
};

export const decideEmergency = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): Decision => {
  const { situation } = ctx;
  const previous = state.emergency;

  const details: EmergencyDetails = {
    ...previous?.details,
    ...message.emergency,
  };
  details.urgency ??= "mayday";

  const ask = nextQuestions(
    details,
    previous?.asked ?? [],
    BUSY_PHASES.includes(situation.phase),
  );

  const emergency: EmergencyState = {
    declaredAtMs: previous?.declaredAtMs ?? situation.observedAtMs,
    details,
    asked: [...(previous?.asked ?? []), ...ask],
  };

  const response: AtcIntent = {
    type: "emergency_response",
    urgency: details.urgency,
    nature: details.nature,
    ask,
  };

  const next: EngineState = { ...state, emergency };

  const canLand =
    details.intention !== undefined &&
    LANDING_INTENTIONS.includes(details.intention) &&
    (situation.phase === FlightPhase.Base || situation.phase === FlightPhase.Final) &&
    !findActive(next, ["land", "touch_and_go"]);

  if (!canLand) {
    return { intents: [response], state: next };
  }

  const landing = clear(next, "land", situation.observedAtMs);

  return { intents: [response, ...landing.intents], state: landing.state };
};
