import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngineState } from "../../engine/clearances";
import { decide } from "../../engine/decide";
import { ControllerStyle } from "../../domain/ControllerStyle";
import { FlightEvent } from "../../domain/FlightEvent";
import { FlightPhase } from "../../domain/FlightPhase";
import { FacilityRelationship, LandingRecord } from "../../domain/PilotRecord";
import { PilotMessage } from "../../domain/PilotMessage";
import { RemarkKind } from "../../domain/Remark";
import { Familiarity, familiarityOf, strictnessFor, deriveStyle } from "../../memory/familiarity";
import { JsonPilotRecordStore } from "../../memory/jsonPilotRecordStore";
import { classifyLanding } from "../../memory/landingQuality";
import {
  createPilotRecord,
  getRelationship,
  recordReadbackError,
  recordRemark,
  recordTouchdown,
  startVisit,
} from "../../memory/recordKeeping";
import { labAirport } from "../airports";
import { aircraftIn, label, msg, situationIn } from "../engine/support";

const FACILITY = "ZZZZ-TWR";
const NOW = Date.UTC(2026, 9, 29, 12);
const DAY = 24 * 60 * 60 * 1000;
const P = FlightPhase;

const landing = (fpm: number, daysAgo = 3): LandingRecord => ({
  atMs: NOW - daysAgo * DAY,
  runway: "23",
  touchdownVerticalSpeedFeetPerMinute: fpm,
});

const relationship = (
  visitCount: number,
  options: {
    lastSeenDaysAgo?: number;
    landings?: LandingRecord[];
    lastRemarkKind?: RemarkKind;
  } = {},
): FacilityRelationship => ({
  facilityId: FACILITY,
  visitCount,
  firstSeenAtMs: NOW - 200 * DAY,
  lastSeenAtMs: NOW - (options.lastSeenDaysAgo ?? 2) * DAY,
  landings: options.landings ?? [landing(-120)],
  readbackErrorCount: 0,
  lastRemarkKind: options.lastRemarkKind,
});

interface Step {
  atMs: number;
  phase: FlightPhase;
  pilot?: PilotMessage | "unintelligible";
  events?: FlightEvent[];
  expect: string[];
}

interface Scenario {
  name: string;
  history?: FacilityRelationship;
  trafficCount?: number;
  style?: ControllerStyle;
  steps: Step[];
}

const touchdown = (atMs: number, fpm: number): FlightEvent => ({
  type: "touchdown",
  atMs,
  runway: "23",
  verticalSpeedFeetPerMinute: fpm,
});

const scenarios: Scenario[] = [
  {
    name: "A stranger gets no remark",
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern"] },
    ],
  },
  {
    name: "An acquaintance is welcomed back, once per session",
    history: relationship(2),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern", "remark:welcome_back"] },
      { atMs: 300000, phase: P.Downwind, pilot: msg("position_report", null, "downwind"), expect: ["instruct:report"] },
    ],
  },
  {
    name: "A regular gets 'you again'",
    history: relationship(7),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern", "remark:you_again"] },
    ],
  },
  {
    name: "A firm previous landing is mentioned before anything else",
    history: relationship(7, { landings: [landing(-120, 10), landing(-750, 2)] }),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern", "remark:previous_firm_landing"] },
    ],
  },
  {
    name: "A strict controller makes no remarks",
    history: relationship(3),
    trafficCount: 8,
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern"] },
    ],
  },
  {
    name: "No remark while the pilot is busy, it waits for a calmer moment",
    history: relationship(7),
    steps: [
      { atMs: 0, phase: P.Final, pilot: msg("position_report", "23", "final"), expect: ["issue_clearance:land"] },
      { atMs: 5000, phase: P.Stationary, pilot: msg("question", null, "heading"), expect: ["advise:heading", "remark:you_again"] },
    ],
  },
  {
    name: "The same remark is not repeated from the last session",
    history: relationship(7, { lastRemarkKind: "you_again" }),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern"] },
    ],
  },
  {
    name: "Remarks wait for a plain reply, not a query",
    history: relationship(7),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: "unintelligible", expect: ["query:say_again"] },
      { atMs: 5000, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern", "remark:you_again"] },
    ],
  },
  {
    name: "An emergency suppresses remarks",
    history: relationship(7),
    steps: [
      { atMs: 0, phase: P.Downwind, pilot: msg("emergency", null, "other"), expect: ["emergency_response:nature+intention"] },
      { atMs: 5000, phase: P.Downwind, pilot: msg("question", null, "heading"), expect: ["advise:heading"] },
    ],
  },
  {
    name: "Landing remarks follow the touchdown rate",
    steps: [
      { atMs: 0, phase: P.LandingRoll, events: [touchdown(0, -90)], expect: ["instruct:vacate_runway", "remark:smooth_landing"] },
    ],
  },
  {
    name: "A firm landing is remarked on",
    steps: [
      { atMs: 0, phase: P.LandingRoll, events: [touchdown(0, -650)], expect: ["instruct:vacate_runway", "remark:firm_landing"] },
    ],
  },
  {
    name: "An ordinary landing gets no remark",
    steps: [
      { atMs: 0, phase: P.LandingRoll, events: [touchdown(0, -250)], expect: ["instruct:vacate_runway"] },
    ],
  },
  {
    name: "Remarks keep a minimum gap",
    history: relationship(7),
    steps: [
      { atMs: 0, phase: P.Inbound, pilot: msg("request", "23", "pattern_entry"), expect: ["instruct:enter_pattern", "remark:you_again"] },
      { atMs: 60000, phase: P.LandingRoll, events: [touchdown(60000, -90)], expect: ["instruct:vacate_runway"] },
      { atMs: 200000, phase: P.LandingRoll, events: [touchdown(200000, -90)], expect: ["instruct:vacate_runway", "remark:smooth_landing"] },
    ],
  },
];

const familiarityCases: {
  name: string;
  history?: FacilityRelationship;
  traffic: number;
  familiarity: Familiarity;
  strictness: ControllerStyle["strictness"];
}[] = [
  { name: "first visit, quiet field", traffic: 0, familiarity: "stranger", strictness: "normal" },
  { name: "first visit, busy field", traffic: 4, familiarity: "stranger", strictness: "strict" },
  { name: "known pilot, busy field", history: relationship(2), traffic: 7, familiarity: "acquaintance", strictness: "strict" },
  { name: "known pilot, moderate traffic", history: relationship(2), traffic: 3, familiarity: "acquaintance", strictness: "normal" },
  { name: "regular, quiet field", history: relationship(8), traffic: 1, familiarity: "regular", strictness: "relaxed" },
  { name: "regular, busy field", history: relationship(8), traffic: 5, familiarity: "regular", strictness: "normal" },
  { name: "acquaintance gone for months", history: relationship(2, { lastSeenDaysAgo: 200 }), traffic: 0, familiarity: "stranger", strictness: "normal" },
  { name: "regular gone for months", history: relationship(9, { lastSeenDaysAgo: 200 }), traffic: 0, familiarity: "acquaintance", strictness: "normal" },
];

const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

function runFamiliarity(): void {
  for (const c of familiarityCases) {
    const familiarity = familiarityOf(c.history, NOW);
    const strictness = strictnessFor(familiarity, c.traffic);
    check(
      `Familiarity: ${c.name}`,
      familiarity === c.familiarity && strictness === c.strictness,
      `expected ${c.familiarity}/${c.strictness}, got ${familiarity}/${strictness}`,
    );
  }

  check(
    "Landing quality bands",
    classifyLanding(-90) === "smooth" &&
      classifyLanding(-250) === "normal" &&
      classifyLanding(-500) === "firm" &&
      classifyLanding(-900) === "hard",
  );
}

function runEngineScenarios(): void {
  for (const scenario of scenarios) {
    let state = createEngineState("23");
    const style =
      scenario.style ?? deriveStyle(scenario.history, NOW, scenario.trafficCount ?? 0);
    const stepFailures: string[] = [];

    for (const step of scenario.steps) {
      const decision = decide(
        {
          aircraft: aircraftIn(step.phase),
          airport: labAirport,
          situation: situationIn(step.phase, step.atMs),
          style,
          memory: { history: scenario.history, epochMs: NOW + step.atMs },
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
        stepFailures.push(
          `t=${step.atMs}ms ${step.phase}: expected [${step.expect.join(", ")}], got [${actual.join(", ")}]`,
        );
      }
    }

    check(scenario.name, stepFailures.length === 0, stepFailures.join("\n  "));
  }
}

async function runRecordKeeping(): Promise<void> {
  let record = createPilotRecord("pilot-1", "Andres");
  record = startVisit(record, FACILITY, NOW);
  record = startVisit(record, FACILITY, NOW + DAY);
  record = recordTouchdown(record, FACILITY, landing(-300, 0));
  record = recordReadbackError(record, FACILITY, NOW + DAY);
  record = recordRemark(record, FACILITY, "you_again", NOW + DAY);

  const relation = getRelationship(record, FACILITY);

  check(
    "Record keeping accumulates visits, landings, errors and remarks",
    relation?.visitCount === 2 &&
      relation.landings.length === 1 &&
      relation.readbackErrorCount === 1 &&
      relation.lastRemarkKind === "you_again" &&
      relation.firstSeenAtMs === NOW,
    JSON.stringify(relation),
  );

  let many = createPilotRecord("pilot-2", "Many");
  for (let i = 0; i < 30; i++) {
    many = recordTouchdown(many, FACILITY, landing(-100 - i, 0));
  }
  check(
    "Only the most recent landings are kept",
    getRelationship(many, FACILITY)?.landings.length === 20,
  );

  const directory = await mkdtemp(join(tmpdir(), "fly-tool-records-"));

  try {
    const store = new JsonPilotRecordStore(directory);

    check("A missing record loads as undefined", (await store.load("nobody")) === undefined);

    await store.save(record);
    const loaded = await store.load("pilot-1");

    check(
      "A saved record loads back unchanged",
      JSON.stringify(loaded) === JSON.stringify(record),
    );

    await store.save({ ...record, displayName: "Renamed" });
    check(
      "Saving again overwrites the record",
      (await store.load("pilot-1"))?.displayName === "Renamed",
    );

    await store.save({ ...record, pilotId: "../escape" });
    check(
      "A pilot id cannot escape the data directory",
      (await store.load("../escape"))?.pilotId === "../escape",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runMemoryLab(): Promise<void> {
  runFamiliarity();
  runEngineScenarios();
  await runRecordKeeping();

  console.log(
    failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

runMemoryLab().catch((error: unknown) => {
  console.error("Memory lab failed:", error);
  process.exitCode = 1;
});
