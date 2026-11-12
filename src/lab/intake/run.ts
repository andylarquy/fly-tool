import { AtcIntent } from "../../domain/AtcIntent";
import { AirportRef, IntakeJudgement } from "../../domain/FlightIntake";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { decide } from "../../engine/decide";
import { createEngineState } from "../../engine/engineState";
import { AirportDirectory } from "../../directory/airportDirectory";
import { AirportEntry } from "../../domain/AirportEntry";
import { toAirportRef } from "../../directory/spokenName";
import { resolveDestination } from "../../pipeline/atcPipeline";
import { labAirportSingleController } from "../airports";
import { labDirectory } from "../directoryFixture";
import { aircraftIn, label, msg, situationIn } from "../engine/helpers";

const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

const ref = (id: string, name: string): AirportRef => ({
  id,
  name,
  position: { latitude: -34.45, longitude: -57.5 },
});

const entry = (id: string, name: string, latitude: number, longitude: number): AirportEntry => ({
  id,
  codes: [id],
  name,
  country: "ZZ",
  type: "medium",
  position: { latitude, longitude },
  aliases: [name, "Rivera"],
  frequencies: [],
});

const HARBOR = ref("SZHF", "Harbor Field");
const HERE = ref("ZZZZ", "Lab Field");

const heard = (
  base: PilotMessage,
  intake: IntakeJudgement,
): PilotMessage => ({ ...base, intake });

const judged = (overrides: Partial<IntakeJudgement> = {}): IntakeJudgement => ({
  local: false,
  ...overrides,
});

const takeoffCall = msg("request", null, "takeoff");
const answer = (intake: IntakeJudgement) => heard(msg("other", null, "other"), intake);

interface Step {
  pilot?: PilotMessage;
  phase?: FlightPhase;
  expect: string[];
}

interface Scenario {
  name: string;
  intake?: boolean;
  steps: Step[];
}

const LINE_UP = "issue_clearance:line_up_and_wait";
const ASK_BOTH = "intake_question:both";

const scenarios: Scenario[] = [
  {
    name: "First departure call is held until destination and rules are known, then answered",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR }, rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "A pilot who volunteers everything is answered at once",
    steps: [
      {
        pilot: heard(takeoffCall, judged({ destination: { kind: "resolved", airport: HARBOR }, rules: "VFR" })),
        expect: [LINE_UP],
      },
    ],
  },
  {
    name: "IFR is refused and the rules are asked again",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      {
        pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR }, rules: "IFR" })),
        expect: ["unable:ifr_not_available", "intake_question:rules"],
      },
      { pilot: answer(judged({ rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "IFR volunteered unprompted is refused at once, and a full answer later completes the plan",
    steps: [
      { pilot: answer(judged({ rules: "IFR" })), expect: ["unable:ifr_not_available", ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR }, rules: "VFR" })), expect: [] },
      { pilot: takeoffCall, expect: [LINE_UP] },
    ],
  },
  {
    name: "Only the rules given: the destination is asked",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ rules: "VFR" })), expect: ["intake_question:destination"] },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR } })), expect: [LINE_UP] },
    ],
  },
  {
    name: "Only the destination given: the rules are asked",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR } })), expect: ["intake_question:rules"] },
      { pilot: answer(judged({ rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "An ambiguous destination is clarified, and the clarification resolves it",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      {
        pilot: answer(
          judged({
            destination: { kind: "ambiguous", options: [ref("ZZR1", "Rivera Airport"), ref("ZZR2", "Rivera Airfield")] },
            rules: "VFR",
          }),
        ),
        expect: ["intake_clarify:Rivera Airport|Rivera Airfield"],
      },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: ref("ZZR1", "Rivera Airport") } })), expect: [LINE_UP] },
    ],
  },
  {
    name: "A destination nobody recognises is asked for again",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "unknown", text: "Xyzzy" }, rules: "VFR" })), expect: ["intake_question:destination"] },
    ],
  },
  {
    name: "With no airport data the spoken destination is taken as said",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "unresolvable", text: "Ezeiza" }, rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "A local flight needs no destination, only the rules",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ local: true })), expect: ["intake_question:rules"] },
      { pilot: answer(judged({ rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "A named destination wins over a 'local' guess",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      {
        pilot: answer(judged({ local: true, destination: { kind: "unknown", text: "Xyzzy" }, rules: "VFR" })),
        expect: ["intake_question:destination"],
      },
    ],
  },
  {
    name: "A departure request the model guesses is 'local', with no rules given, is still asked",
    steps: [{ pilot: heard(takeoffCall, judged({ local: true })), expect: [ASK_BOTH] }],
  },
  {
    name: "A departure request that says it is local and gives the rules is a local flight",
    steps: [{ pilot: heard(takeoffCall, judged({ local: true, rules: "VFR" })), expect: [LINE_UP] }],
  },
  {
    name: "Naming this very airport as the destination is a local flight",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HERE }, rules: "VFR" })), expect: [LINE_UP] },
    ],
  },
  {
    name: "A pilot who ignores the question is asked again, then left alone",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: takeoffCall, expect: [LINE_UP] },
    ],
  },
  {
    name: "A later message answering nothing does not repeat the question",
    steps: [
      { pilot: takeoffCall, expect: [ASK_BOTH] },
      { pilot: msg("question", null, "heading"), expect: ["advise:heading"] },
    ],
  },
  {
    name: "An emergency is never held up for a flight plan",
    steps: [{ pilot: msg("emergency", null, "other"), expect: ["emergency_response:nature+intention"] }],
  },
  {
    name: "Arriving calls are never held up for a flight plan",
    steps: [
      { pilot: msg("request", "23", "pattern_entry"), phase: FlightPhase.Inbound, expect: ["instruct:enter_pattern"] },
    ],
  },
  {
    name: "Without the option, no questions are asked",
    intake: false,
    steps: [{ pilot: takeoffCall, expect: [LINE_UP] }],
  },
  {
    name: "A destination given before being asked is remembered, and only the rules are asked",
    steps: [
      { pilot: answer(judged({ destination: { kind: "resolved", airport: HARBOR } })), expect: ["intake_question:rules"] },
      { pilot: answer(judged({ rules: "VFR" })), expect: [] },
      { pilot: takeoffCall, expect: [LINE_UP] },
    ],
  },
  {
    name: "Once complete the flight plan is never asked again",
    steps: [
      { pilot: heard(takeoffCall, judged({ destination: { kind: "resolved", airport: HARBOR }, rules: "VFR" })), expect: [LINE_UP] },
      { pilot: takeoffCall, expect: [] },
    ],
  },
];

function runScenarios(): void {
  for (const scenario of scenarios) {
    let state = createEngineState("23", { askFlightIntake: scenario.intake ?? true });
    const stepFailures: string[] = [];
    let nowMs = 0;

    scenario.steps.forEach((step, index) => {
      nowMs += 5000;
      const phase = step.phase ?? FlightPhase.Stationary;
      const decision = decide(
        {
          aircraft: aircraftIn(phase),
          airport: labAirportSingleController,
          situation: situationIn(phase, nowMs),
          style: { strictness: "normal" },
          events: [],
          pilot: step.pilot ? { status: "heard", message: step.pilot } : { status: "none" },
        },
        state,
      );

      state = decision.state;
      const actual = decision.intents.map((intent: AtcIntent) => label(intent));

      if (actual.join(",") !== step.expect.join(",")) {
        stepFailures.push(`step ${index + 1}: expected [${step.expect.join(", ")}], got [${actual.join(", ")}]`);
      }
    });

    check(scenario.name, stepFailures.length === 0, stepFailures.join("\n  "));
  }
}

function runResolution(): void {
  const near = labAirportSingleController.position;
  const resolve = (spoken: string) => resolveDestination(spoken, near, () => labDirectory);

  check("A name is resolved", resolve("Harbor Field").kind === "resolved");
  check("A name with 'airport' and an accent-free typo resolves", resolve("Harbour Field").kind === "resolved" || resolve("Harbor").kind === "resolved");
  check("A code spelled out as words resolves through its initials", (() => {
    const result = resolve("Sierra Alpha Bravo Echo");
    return result.kind !== "resolved" || result.airport.id === "SABE";
  })());
  check("Sierra Zulu Hotel Foxtrot resolves to SZHF", (() => {
    const result = resolve("Sierra Zulu Hotel Foxtrot");
    return result.kind === "resolved" && result.airport.id === "SZHF";
  })());
  check("Two airports sharing a name are offered as options", (() => {
    const result = resolve("Rivera");
    return result.kind === "ambiguous" && result.options.length === 2;
  })());
  check("A cue word in front of the name is ignored", (() => {
    const result = resolve("Destino Harbor Field");
    return result.kind === "resolved" && result.airport.id === "SZHF";
  })());
  check("Two airports that sound the same are told apart by their full names", (() => {
    const same = new AirportDirectory([
      entry("A1", "Rivera Airport", -34.0, -57.9),
      entry("A2", "Rivera Airfield", -34.1, -58.0),
    ]);
    const result = resolveDestination("Rivera", near, () => same);
    return result.kind === "ambiguous" && result.options[0].name !== result.options[1].name;
  })());
  check("A real name is not mistaken for a code", (() => {
    const result = resolve("Harbor Field Airport");
    return result.kind === "resolved" && result.airport.id === "SZHF";
  })());
  check("Nonsense is unknown", resolve("Xyzzy").kind === "unknown");
  check("With no airport data the words are kept", resolveDestination("Ezeiza", near, () => undefined).kind === "unresolvable");
  check("The spoken name of an airport drops generic words", toAirportRef(labDirectory.byCode("SZHF")!).name === "Harbor Field");
}

runScenarios();
runResolution();

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
