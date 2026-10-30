import { Airport } from "../domain/Airport";
import { ControllerPosition, FrequencyType } from "../domain/Frequency";
import { EngineState } from "../domain/EngineState";
import { FlightPhase } from "../domain/FlightPhase";
import { PilotMessage } from "../domain/PilotMessage";
import { Decision, DecisionContext } from "./decisionTypes";
import { say } from "./intentBuilders";

const RADIO_TOLERANCE_MHZ = 0.005;

const TYPE_OF: Record<ControllerPosition, FrequencyType> = {
  ground: "ground",
  tower: "tower",
};

export const frequencyFor = (
  airport: Airport,
  position: ControllerPosition,
): number | undefined =>
  airport.frequencies?.find((f) => f.type === TYPE_OF[position])?.frequencyMhz;

// Ground and tower are separate controllers only when the airport has a
// frequency for each. With one of them missing, the other covers everything,
// as at a small field where the tower also handles the ground.
export const hasSeparatePositions = (airport: Airport): boolean =>
  frequencyFor(airport, "ground") !== undefined &&
  frequencyFor(airport, "tower") !== undefined;

const positionOnRadio = (
  airport: Airport,
  frequencyMhz: number,
): ControllerPosition | undefined =>
  (["ground", "tower"] as const).find((position) => {
    const frequency = frequencyFor(airport, position);

    return frequency !== undefined && Math.abs(frequency - frequencyMhz) < RADIO_TOLERANCE_MHZ;
  });

// Where the pilot starts: on the ramp or a taxiway the pilot is with ground;
// at a hold line, on the runway, or in the air, with tower.
const initialPosition = ({ situation }: DecisionContext): ControllerPosition =>
  situation.onGround &&
  !situation.onRunway &&
  situation.phase !== FlightPhase.HoldingShort &&
  situation.phase !== FlightPhase.LandingRoll
    ? "ground"
    : "tower";

// Settles which controller the pilot is with: the first time from where the
// aircraft is, and afterwards from the radio when the telemetry says what is
// tuned (a pilot who tunes the other controller is simply talking to them).
export const syncPosition = (
  ctx: DecisionContext,
  state: EngineState,
): EngineState => {
  if (!hasSeparatePositions(ctx.airport)) {
    return state;
  }

  const tuned =
    ctx.aircraft.com1FrequencyMhz === undefined
      ? undefined
      : positionOnRadio(ctx.airport, ctx.aircraft.com1FrequencyMhz);

  const position = tuned ?? state.position ?? initialPosition(ctx);

  return position === state.position ? state : { ...state, position };
};

export const handOffTo = (
  ctx: DecisionContext,
  state: EngineState,
  to: ControllerPosition,
): Decision =>
  say(
    { type: "handoff", to, frequencyMhz: frequencyFor(ctx.airport, to)! },
    { ...state, position: to, awaitingGroundHandoff: undefined },
  );

const GROUND_SUBJECTS: PilotMessage["subject"][] = ["taxi", "parking"];
const DEPARTURE_SUBJECTS: PilotMessage["subject"][] = ["takeoff", "line_up", "hold_short"];
const TOWER_SUBJECTS: PilotMessage["subject"][] = [
  "pattern_entry",
  "landing",
  "airborne",
  "crosswind",
  "downwind",
  "base",
  "final",
  "go_around",
];

// A departure call belongs to tower only once the aircraft is at the hold line
// of the *active* runway or on it; anywhere else on the ground it is a taxi
// matter. (Otherwise a pilot at the wrong hold line would bounce between the
// two controllers.)
const atTheActiveRunway = (ctx: DecisionContext, state: EngineState): boolean =>
  !ctx.situation.onGround ||
  ctx.situation.onRunway ||
  (ctx.situation.phase === FlightPhase.HoldingShort &&
    ctx.situation.holdingShortRunway === state.runway);

export const positionForRequest = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
): ControllerPosition | undefined => {
  if (message.type !== "request") {
    return undefined;
  }

  if (GROUND_SUBJECTS.includes(message.subject)) {
    return "ground";
  }

  if (DEPARTURE_SUBJECTS.includes(message.subject)) {
    return atTheActiveRunway(ctx, state) ? "tower" : "ground";
  }

  return TOWER_SUBJECTS.includes(message.subject) ? "tower" : undefined;
};
