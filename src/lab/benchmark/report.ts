import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BenchmarkRun, BenchmarkScenario } from "./benchmarkTypes";

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

export function printScenarioSummary(
  scenario: BenchmarkScenario,
  runs: BenchmarkRun[],
): void {
  const passedRuns = runs.filter((run) => run.evaluation.passed).length;

  const latencies = runs.map((run) => run.elapsedMs);

  const medianLatency = median(latencies);

  console.log("\nScenario summary");
  console.log("----------------");
  console.log(
    `Automated checks: ${passedRuns}/${runs.length} ` +
      `(${((passedRuns / runs.length) * 100).toFixed(0)}%)`,
  );

  console.log(`Median latency: ${(medianLatency / 1000).toFixed(2)} s`);

  for (const run of runs) {
    console.log(
      `  Run ${run.run}: ` +
        `${run.evaluation.passed ? "PASS" : "FAIL"} ` +
        `${(run.elapsedMs / 1000).toFixed(2)} s`,
    );

    console.log(`    ${run.response}`);

    if (run.evaluation.failures.length > 0) {
      for (const failure of run.evaluation.failures) {
        console.log(`    ! ${failure}`);
      }
    }
  }
}

export interface ScenarioResult {
  scenario: BenchmarkScenario;
  runs: BenchmarkRun[];
}

const escapeTableCell = (text: string): string =>
  text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function buildMarkdownReport(results: ScenarioResult[]): string {
  const lines: string[] = ["# Fly Tool ATC Benchmark", ""];

  for (const { scenario, runs } of results) {
    const passedRuns = runs.filter((run) => run.evaluation.passed).length;
    const medianLatency = median(runs.map((run) => run.elapsedMs));

    lines.push(`## ${scenario.name}`, "");
    lines.push(`**Pilot:** "${scenario.pilotTransmission}"`, "");
    lines.push(
      `Automated checks: ${passedRuns}/${runs.length} (${((passedRuns / runs.length) * 100).toFixed(0)}%) — Median latency: ${(medianLatency / 1000).toFixed(2)} s`,
      "",
    );

    lines.push("| Run | Result | Latency | Response |");
    lines.push("| --- | --- | --- | --- |");

    for (const run of runs) {
      const result = run.evaluation.passed ? "PASS" : "FAIL";

      lines.push(
        `| ${run.run} | ${result} | ${(run.elapsedMs / 1000).toFixed(2)}s | ${escapeTableCell(run.response)} |`,
      );
    }

    lines.push("");

    const failedRuns = runs.filter((run) => run.evaluation.failures.length > 0);

    if (failedRuns.length > 0) {
      for (const run of failedRuns) {
        lines.push(`**Run ${run.run} failures:**`);
        run.evaluation.failures.forEach((failure) =>
          lines.push(`- ${failure}`),
        );
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

const RESULTS_DIR = join(process.cwd(), "benchmark-results");

export function saveMarkdownReport(markdown: string): string {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(RESULTS_DIR, `benchmark-${timestamp}.md`);

  writeFileSync(filePath, markdown);

  return filePath;
}
