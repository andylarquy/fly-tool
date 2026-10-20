import {
  getAiResponse,
  resetConversation,
  seedConversationTurn,
} from "../../ai/ai";
import { getInferenceMetrics } from "../../ai/inferenceStats";
import { DEFAULT_FLIGHT_PLAN } from "../../domain/defaultFlightPlan";

import { BenchmarkRun } from "./benchmarkTypes";
import { evaluateResponse } from "./checks";
import {
  buildMarkdownReport,
  printScenarioSummary,
  saveMarkdownReport,
  ScenarioResult,
} from "./report";
import { scenarios } from "./scenarios";

const RUNS_PER_SCENARIO = 3;

async function runBenchmark(): Promise<void> {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);

    const runs: BenchmarkRun[] = [];

    for (let run = 1; run <= RUNS_PER_SCENARIO; run++) {
      resetConversation();
      scenario.initialConversation?.forEach((turn) => {
        seedConversationTurn(turn.pilot, turn.atc);
      });

      if (RUNS_PER_SCENARIO > 1) {
        console.log(`\nRun ${run}/${RUNS_PER_SCENARIO}`);
      }

      console.log(`Pilot> ${scenario.pilotTransmission}`);

      const start = performance.now();

      const result = await getAiResponse(
        {
          aircraftState: scenario.aircraftState,
          atcState: scenario.atcState,
          flightPlan: DEFAULT_FLIGHT_PLAN,
        },
        scenario.pilotTransmission,
      );

      const elapsedMs = performance.now() - start;

      const metrics = getInferenceMetrics(result.response);

      const evaluation = evaluateResponse(
        result.content,
        scenario.expectations,
      );

      const runResult: BenchmarkRun = {
        run,
        response: result.content,
        evaluation,
        elapsedMs,
        metrics,
      };

      runs.push(runResult);

      console.log(
        `${evaluation.passed ? "PASS" : "FAIL"} ` +
          `${(elapsedMs / 1000).toFixed(2)} s`,
      );

      console.log(`[ATC] ${result.content}`);
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
