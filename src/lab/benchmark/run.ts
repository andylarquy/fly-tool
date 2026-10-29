import { MODEL } from "../../ai/modelConfig";
import { Runway } from "../../domain/Airport";
import { DEFAULT_FLIGHT_PLAN } from "../../domain/defaultFlightPlan";
import { DEFAULT_PILOT_PROFILE } from "../../domain/defaultPilot";
import { createPilotRecord } from "../../memory/recordKeeping";
import {
  createPipelineState,
  PipelineState,
  runPipelineTurn,
} from "../../pipeline/atcPipeline";
import { labAirport, labTower } from "../airports";
import { BenchmarkRun, BenchmarkScenario, StepResult } from "./benchmarkTypes";
import { evaluateResponse } from "./checks";
import {
  buildMarkdownReport,
  printScenarioSummary,
  saveMarkdownReport,
  ScenarioResult,
} from "./report";
import { scenarios } from "./scenarios";
import { telemetryAt } from "./telemetry";

const RUNS_PER_SCENARIO = 3;
const ACTIVE_RUNWAY = "23";
const SETTLE_TICKS = 5;
const TICK_MS = 1000;
const NO_RESPONSE = "[NO RESPONSE]";
const EPOCH_MS = Date.UTC(2026, 9, 29, 12);

async function runScenarioOnce(
  scenario: BenchmarkScenario,
  runway: Runway,
  run: number,
): Promise<BenchmarkRun> {
  const callsign = DEFAULT_FLIGHT_PLAN.callsign;

  let state: PipelineState = createPipelineState(
    ACTIVE_RUNWAY,
    scenario.record ??
      createPilotRecord(
        DEFAULT_PILOT_PROFILE.pilotId,
        DEFAULT_PILOT_PROFILE.displayName,
      ),
  );
  let nowMs = 0;

  const steps: StepResult[] = [];

  for (const step of scenario.steps) {
    const aircraft = telemetryAt(runway, labAirport.elevationFeet, step.position);
    const unprompted: string[] = [];

    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
      nowMs += TICK_MS;

      const turn = await runPipelineTurn(
        {
          aircraft,
          airport: labAirport,
          observedAtMs: nowMs,
          facility: labTower,
          epochMs: EPOCH_MS + nowMs,
          trafficCount: scenario.trafficCount,
          callsign,
        },
        state,
      );

      state = turn.state;

      if (turn.transmission) {
        unprompted.push(turn.transmission);
      }
    }

    let result: StepResult;

    if (step.pilot) {
      nowMs += TICK_MS;
      const start = performance.now();

      const turn = await runPipelineTurn(
        {
          aircraft,
          airport: labAirport,
          observedAtMs: nowMs,
          facility: labTower,
          epochMs: EPOCH_MS + nowMs,
          trafficCount: scenario.trafficCount,
          callsign,
          pilotTransmission: step.pilot,
        },
        state,
      );

      state = turn.state;

      const { message, intents, situation, timings } = turn.trace;
      const heard = message
        ? `${message.type}/${message.runway ?? "-"}/${message.subject}`
        : "unintelligible";

      result = {
        pilot: step.pilot,
        response: turn.transmission ?? NO_RESPONSE,
        proactive: false,
        trace: `[${situation.phase}] ${heard} -> ${intents.map((i) => i.type).join(", ") || "silence"}`,
        elapsedMs: performance.now() - start,
        timings,
      };
    } else {
      result = {
        response: unprompted.join(" ") || NO_RESPONSE,
        proactive: unprompted.length > 0,
      };
    }

    if (step.expect) {
      result.evaluation = evaluateResponse(result.response, step.expect);
    }

    steps.push(result);
  }

  return {
    run,
    steps,
    passed: steps.every((step) => step.evaluation?.passed ?? true),
  };
}

async function runBenchmark(): Promise<void> {
  const runway = labAirport.runways.find((r) => r.designator === ACTIVE_RUNWAY);

  if (!runway) {
    throw new Error(`Runway ${ACTIVE_RUNWAY} not found in lab airport`);
  }

  console.log(`ATC pipeline benchmark with ${MODEL}`);

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);

    const runs: BenchmarkRun[] = [];

    for (let run = 1; run <= RUNS_PER_SCENARIO; run++) {
      runs.push(await runScenarioOnce(scenario, runway, run));
    }

    printScenarioSummary(scenario, runs);
    results.push({ scenario, runs });
  }

  const filePath = saveMarkdownReport(buildMarkdownReport(results));
  console.log(`\nSaved markdown report: ${filePath}`);
}

runBenchmark().catch((error: unknown) => {
  console.error("Benchmark failed:", error);
  process.exitCode = 1;
});
