import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { DestinationJudgement, FlightIntake } from "../domain/FlightIntake";
import { PilotMessage } from "../domain/PilotMessage";
import { Decision, DecisionContext } from "./decisionTypes";

const MAX_QUESTIONS = 3;

// The calls that start a departure. Anything else (arriving, an emergency, a
// readback) is never held up for a flight plan.
const GATED_SUBJECTS: PilotMessage["subject"][] = ["taxi", "takeoff", "line_up", "hold_short"];

export const isIntakeComplete = (intake: FlightIntake): boolean =>
  intake.abandoned === true || (intake.destination !== undefined && intake.rules !== undefined);

export const needsIntake = (state: EngineState): boolean =>
  state.intake !== undefined && !isIntakeComplete(state.intake);

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const missingOf = (intake: FlightIntake): "destination" | "rules" | "both" =>
  intake.destination === undefined
    ? intake.rules === undefined
      ? "both"
      : "destination"
    : "rules";

const applyDestination = (
  ctx: DecisionContext,
  intake: FlightIntake,
  judgement: DestinationJudgement,
): { intake: FlightIntake; clarify?: string[] } => {
  switch (judgement.kind) {
    case "resolved": {
      const here = judgement.airport.id === ctx.airport.icao;

      return {
        intake: {
          ...intake,
          destination: {
            name: here ? ctx.airport.name : (judgement.saidAs ?? judgement.airport.name),
            id: judgement.airport.id,
            position: judgement.airport.position,
            ...(here ? { local: true } : {}),
          },
          options: undefined,
        },
      };
    }
    case "ambiguous":
      return {
        intake: { ...intake, options: judgement.options },
        clarify: judgement.options.map((option) => option.name),
      };
    case "unresolvable":
      return { intake: { ...intake, destination: { name: judgement.text } } };
    // A name we cannot place is asked for once more. Said again the same way,
    // it is a real place missing from our data (or a speech-to-text habit), so
    // it is taken as spoken instead of asking forever.
    case "unknown": {
      const same = squash(judgement.text) === intake.unrecognized;

      return same
        ? { intake: { ...intake, destination: { name: judgement.text }, unrecognized: undefined } }
        : { intake: { ...intake, unrecognized: squash(judgement.text) } };
    }
  }
};

const question = (
  ask: "destination" | "rules" | "both",
  state: EngineState,
  intake: FlightIntake,
  lead: AtcIntent[] = [],
): Decision => ({
  intents: [...lead, { type: "intake_question", ask }],
  state: { ...state, intake: { ...intake, asked: intake.asked + 1 } },
});

export interface IntakeResult {
  state: EngineState;
  decision?: Decision;
}

// Gathers the flight plan by asking. Returns a decision when the controller
// has something to say about it, and otherwise the state to carry on with.
export const applyIntake = (
  ctx: DecisionContext,
  state: EngineState,
  message: PilotMessage,
  replay: (state: EngineState, deferred: PilotMessage) => Decision,
): IntakeResult => {
  const before = state.intake;

  if (!before || isIntakeComplete(before)) {
    return { state };
  }

  const heard = message.intake;
  const gated = message.type === "request" && GATED_SUBJECTS.includes(message.subject);
  let intake = before;
  let clarify: string[] | undefined;

  // A destination the pilot named always wins: "local" is the model's guess
  // about a transmission, and it over-reports.
  if (heard?.destination) {
    const applied = applyDestination(ctx, intake, heard.destination);

    intake = applied.intake;
    clarify = applied.clarify;
  } else if (heard?.local && !(gated && heard.rules === undefined)) {
    intake = {
      ...intake,
      destination: { name: ctx.airport.name, id: ctx.airport.icao, local: true },
    };
  }

  const refusedIfr = heard?.rules === "IFR";

  if (heard?.rules === "VFR") {
    intake = { ...intake, rules: "VFR" };
  }

  const gaveAnything =
    heard !== undefined &&
    ((heard.local && !(gated && heard.rules === undefined)) ||
      heard.rules !== undefined ||
      heard.destination !== undefined);

  if (!gaveAnything) {
    if (!gated) {
      return { state };
    }

    if (intake.asked >= MAX_QUESTIONS) {
      return { state: { ...state, intake: { ...intake, abandoned: true } } };
    }

    return {
      state,
      decision: question(missingOf(intake), { ...state, deferred: message }, intake),
    };
  }

  // A departure request that arrives with only part of the plan is held back
  // too, to be answered once the rest is given.
  const next: EngineState = { ...state, intake, ...(gated ? { deferred: message } : {}) };

  if (refusedIfr) {
    const lead: AtcIntent[] = [{ type: "unable", reason: "ifr_not_available" }];

    return { state: next, decision: question(missingOf(intake), next, intake, lead) };
  }

  if (clarify) {
    return {
      state: next,
      decision: {
        intents: [{ type: "intake_clarify", options: clarify }],
        state: { ...next, intake: { ...intake, asked: intake.asked + 1 } },
      },
    };
  }

  if (!isIntakeComplete(intake)) {
    return { state: next, decision: question(missingOf(intake), next, intake) };
  }

  // Complete. If this very message was the request, carry on and answer it;
  // otherwise answer the request that was held back.
  const { deferred, ...rest } = next;

  if (gated) {
    return { state: rest };
  }


  if (deferred) {
    return { state: rest, decision: replay(rest, deferred) };
  }

  // The plan came on its own, with nothing held back to answer: acknowledge
  // it, as a controller would, instead of leaving the pilot in silence.
  return {
    state: rest,
    decision: {
      intents: [
        {
          type: "flight_plan_accepted",
          destination: intake.destination?.name ?? "",
          local: intake.destination?.local === true,
        },
      ],
      state: rest,
    },
  };
};
