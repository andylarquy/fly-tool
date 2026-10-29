import { createEngineState } from "../../engine/clearances";
import { decide } from "../../engine/decide";
import { Strictness } from "../../domain/ControllerStyle";
import { FlightEvent } from "../../domain/FlightEvent";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { labAirport } from "../airports";
import { aircraftIn, label, msg, situationIn } from "./support";

type Heard = PilotMessage | "unintelligible";

interface Step {
  atMs: number;
  phase: FlightPhase;
  pilot?: Heard;
  events?: FlightEvent[];
  expect: string[];
}

interface EngineScenario {
  name: string;
  strictness?: Strictness;
  steps: Step[];
}

const P = FlightPhase;

const scenarios: EngineScenario[] = [
  {
    name: "Full pattern circuit",
    steps: [
      { atMs: 0, phase: P.Stationary, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:line_up_and_wait"] },
      { atMs: 2000, phase: P.Stationary, pilot: msg("readback", "23", "line_up"), expect: [] },
      { atMs: 10000, phase: P.LinedUp, expect: ["issue_clearance:takeoff"] },
      { atMs: 12000, phase: P.LinedUp, pilot: msg("readback", "23", "takeoff"), expect: [] },
      { atMs: 40000, phase: P.Upwind, events: [{ type: "lifted_off", atMs: 40000, runway: "23" }], expect: [] },
      { atMs: 45000, phase: P.Upwind, pilot: msg("position_report", null, "airborne"), expect: ["instruct:report"] },
      { atMs: 60000, phase: P.Crosswind, pilot: msg("position_report", null, "crosswind"), expect: [] },
      { atMs: 80000, phase: P.Downwind, pilot: msg("position_report", "23", "downwind"), expect: ["instruct:report"] },
      { atMs: 100000, phase: P.Base, pilot: msg("position_report", null, "base"), expect: ["instruct:report"] },
      { atMs: 120000, phase: P.Final, pilot: msg("position_report", "23", "final"), expect: ["issue_clearance:land"] },
      { atMs: 122000, phase: P.Final, pilot: msg("readback", "23", "landing"), expect: [] },
      { atMs: 130000, phase: P.Final, pilot: msg("position_report", null, "final"), expect: [] },
      { atMs: 140000, phase: P.LandingRoll, events: [{ type: "touchdown", atMs: 140000, runway: "23", verticalSpeedFeetPerMinute: -300 }], expect: ["instruct:vacate_runway"] },
    ],
  },
  {
    name: "Pilot already lined up asks for takeoff",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:takeoff"] },
      { atMs: 2000, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: [] },
    ],
  },
  {
    name: "Position report with nothing expected stays silent",
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("position_report", null, "downwind"), expect: [] },
      { atMs: 2000, phase: P.Crosswind, pilot: msg("position_report", null, "crosswind"), expect: [] },
    ],
  },
  {
    name: "Position report contradicting telemetry is queried",
    steps: [
      { atMs: 0, phase: P.Base, pilot: msg("position_report", null, "downwind"), expect: ["query:confirm_position"] },
      { atMs: 2000, phase: P.Downwind, pilot: msg("position_report", null, "base"), expect: [] },
    ],
  },
  {
    name: "Wrong runway readback is corrected",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:takeoff"] },
      { atMs: 2000, phase: P.LinedUp, pilot: msg("readback", "05", "takeoff"), expect: ["correct_readback"] },
    ],
  },
  {
    name: "Wrong clearance in readback is corrected",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:takeoff"] },
      { atMs: 2000, phase: P.LinedUp, pilot: msg("readback", "23", "landing"), expect: ["correct_readback"] },
    ],
  },
  {
    name: "Readback without runway: tolerated when normal",
    strictness: "normal",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:takeoff"] },
      { atMs: 2000, phase: P.LinedUp, pilot: msg("readback", null, "takeoff"), expect: [] },
    ],
  },
  {
    name: "Readback without runway: full readback requested when strict",
    strictness: "strict",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:takeoff"] },
      { atMs: 2000, phase: P.LinedUp, pilot: msg("readback", null, "takeoff"), expect: ["query:full_readback"] },
      { atMs: 4000, phase: P.LinedUp, pilot: msg("readback", "23", "takeoff"), expect: ["acknowledge:readback_correct"] },
    ],
  },
  {
    name: "Pilot asks for a different runway than the active one",
    steps: [
      { atMs: 0, phase: P.LinedUp, pilot: msg("request", "05", "takeoff"), expect: ["issue_clearance:takeoff"] },
    ],
  },
  {
    name: "Go-around announced by the pilot, then detected",
    steps: [
      { atMs: 0, phase: P.Final, pilot: msg("position_report", null, "final"), expect: ["issue_clearance:land"] },
      { atMs: 5000, phase: P.Final, pilot: msg("position_report", null, "go_around"), expect: ["instruct:go_around"] },
      { atMs: 9000, phase: P.Upwind, events: [{ type: "go_around", atMs: 9000 }], expect: [] },
    ],
  },
  {
    name: "Go-around detected without a call",
    steps: [
      { atMs: 0, phase: P.Final, pilot: msg("position_report", null, "final"), expect: ["issue_clearance:land"] },
      { atMs: 9000, phase: P.Upwind, events: [{ type: "go_around", atMs: 9000 }], expect: ["instruct:go_around"] },
    ],
  },
  {
    name: "Pattern entry from outside",
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern"] },
      { atMs: 2000, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: [] },
    ],
  },
  {
    name: "Landing request in the pattern",
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("request", "23", "landing"), expect: ["instruct:report"] },
      { atMs: 2000, phase: P.Final, pilot: msg("request", "23", "landing"), expect: ["issue_clearance:land"] },
    ],
  },
  {
    name: "Questions are answered from telemetry or declined",
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("question", null, "heading"), expect: ["advise:heading"] },
      { atMs: 2000, phase: P.Downwind, pilot: msg("question", null, "airborne"), expect: ["advise:airborne"] },
      { atMs: 4000, phase: P.Downwind, pilot: msg("question", null, "other"), expect: ["unable:no_information"] },
    ],
  },
  {
    name: "Unintelligible input",
    steps: [
      { atMs: 0, phase: P.Upwind, pilot: "unintelligible", expect: ["query:say_again"] },
    ],
  },
  {
    name: "Mayday without details asks for nature and intentions",
    steps: [
      { atMs: 0, phase: P.Upwind, pilot: msg("emergency", null, "other"), expect: ["emergency_response:nature+intention"] },
      { atMs: 2000, phase: P.Upwind, pilot: msg("emergency", null, "other"), expect: ["emergency_response"] },
    ],
  },
  {
    name: "Emergency: stated details are remembered and the rest asked when it fits",
    steps: [
      { atMs: 0, phase: P.Upwind, pilot: msg("emergency", null, "other", { urgency: "mayday", nature: "engine_failure" }), expect: ["emergency_response:intention"] },
      { atMs: 4000, phase: P.Upwind, pilot: msg("other", null, "other", { intention: "land_at_airport" }), expect: ["emergency_response"] },
      { atMs: 30000, phase: P.Downwind, pilot: msg("other", null, "other", { soulsOnBoard: 3 }), expect: ["emergency_response:fuel"] },
      { atMs: 50000, phase: P.Base, pilot: msg("other", null, "other", { fuelEnduranceMinutes: 40 }), expect: ["emergency_response", "issue_clearance:land"] },
      { atMs: 52000, phase: P.Base, pilot: msg("readback", "23", "landing"), expect: [] },
    ],
  },
  {
    name: "Emergency: souls and fuel are asked once the pilot is not busy",
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("emergency", null, "other", { nature: "medical", intention: "land_at_airport" }), expect: ["emergency_response:souls+fuel"] },
      { atMs: 4000, phase: P.Downwind, pilot: msg("position_report", null, "downwind"), expect: [] },
    ],
  },
  {
    name: "Pan-pan keeps its urgency",
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("emergency", null, "other", { urgency: "pan_pan", nature: "fire" }), expect: ["emergency_response:intention"] },
    ],
  },
  {
    name: "Chatter depends on strictness",
    strictness: "relaxed",
    steps: [
      { atMs: 0, phase: P.Stationary, pilot: msg("other", null, "other"), expect: ["acknowledge:courtesy"] },
    ],
  },
  {
    name: "Entering the airspace without contact",
    steps: [
      { atMs: 0, phase: P.Inbound, events: [{ type: "entered_airspace", atMs: 0 }], expect: [] },
      { atMs: 10000, phase: P.Inbound, expect: [] },
      { atMs: 31000, phase: P.Inbound, expect: ["query:say_intentions"] },
      { atMs: 40000, phase: P.Inbound, expect: [] },
    ],
  },
  {
    name: "Entering the airspace after making contact",
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern"] },
      { atMs: 1000, phase: P.Inbound, events: [{ type: "entered_airspace", atMs: 1000 }], expect: [] },
      { atMs: 40000, phase: P.Inbound, expect: [] },
    ],
  },
];

function runEngineReplay(): void {
  let failedSteps = 0;

  for (const scenario of scenarios) {
    let state = createEngineState("23");
    const failures: string[] = [];

    for (const step of scenario.steps) {
      const decision = decide(
        {
          aircraft: aircraftIn(step.phase),
          airport: labAirport,
          situation: situationIn(step.phase, step.atMs),
          style: { strictness: scenario.strictness ?? "normal" },
          events: step.events ?? [],
          pilot:
            step.pilot === undefined
              ? { status: "none" }
              : step.pilot === "unintelligible"
                ? { status: "unintelligible" }
                : { status: "heard", message: step.pilot },
        },
        state,
      );

      state = decision.state;

      const actual = decision.intents.map(label);

      if (actual.join(",") !== step.expect.join(",")) {
        failures.push(
          `  t=${step.atMs}ms ${step.phase}: expected [${step.expect.join(", ")}], got [${actual.join(", ")}]`,
        );
      }
    }

    failedSteps += failures.length;
    console.log(`${failures.length === 0 ? "PASS" : "FAIL"} ${scenario.name}`);
    failures.forEach((failure) => console.log(failure));
  }

  console.log(
    failedSteps === 0 ? "\nAll scenarios passed." : `\n${failedSteps} step(s) failed.`,
  );
  process.exitCode = failedSteps === 0 ? 0 : 1;
}

runEngineReplay();
