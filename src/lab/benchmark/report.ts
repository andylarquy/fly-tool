import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL, THINKING } from "../../ai/modelConfig";
import { BenchmarkRun, BenchmarkScenario } from "./benchmarkTypes";

export interface ScenarioResult {
  scenario: BenchmarkScenario;
  runs: BenchmarkRun[];
}

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

const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;

const percent = (part: number, total: number): string =>
  total === 0 ? "n/a" : `${((part / total) * 100).toFixed(0)}%`;

const passedRuns = (runs: BenchmarkRun[]): number =>
  runs.filter((run) => run.passed).length;

const pilotSteps = (runs: BenchmarkRun[]) =>
  runs.flatMap((run) => run.steps.filter((step) => step.elapsedMs !== undefined));

const stageMedians = (results: ScenarioResult[]) => {
  const steps = results.flatMap(({ runs }) => pilotSteps(runs));
  const rendered = steps.filter((step) => (step.timings?.renderMs ?? 0) > 0);

  return {
    turn: median(steps.map((step) => step.elapsedMs ?? 0)),
    classify: median(steps.map((step) => step.timings?.classifyMs ?? 0)),
    render: median(rendered.map((step) => step.timings?.renderMs ?? 0)),
    pilotTurns: steps.length,
  };
};

export function printScenarioSummary(
  scenario: BenchmarkScenario,
  runs: BenchmarkRun[],
): void {
  const passed = passedRuns(runs);

  console.log(
    `\n${scenario.name} [${scenario.origin}]: ${passed}/${runs.length} ` +
      `(${percent(passed, runs.length)}), median pilot turn ` +
      seconds(median(pilotSteps(runs).map((step) => step.elapsedMs ?? 0))),
  );

  for (const run of runs) {
    console.log(`  Run ${run.run}: ${run.passed ? "PASS" : "FAIL"}`);

    for (const step of run.steps) {
      if (step.pilot) console.log(`    Pilot> ${step.pilot}`);
      if (step.trace) console.log(`      ${step.trace}`);
      console.log(`    ATC> ${step.response}${step.proactive ? "  (unprompted)" : ""}`);

      step.evaluation?.failures.forEach((failure) =>
        console.log(`      ! ${failure}`),
      );
    }
  }
}

const escapeTableCell = (text: string): string =>
  text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function buildMarkdownReport(results: ScenarioResult[]): string {
  const allRuns = results.flatMap(({ runs }) => runs);
  const totalPassed = allRuns.filter((run) => run.passed).length;
  const timing = stageMedians(results);

  const lines: string[] = [
    "# Fly Tool ATC Benchmark",
    "",
    `Pipeline: classifier -> engine -> speech. Model: \`${MODEL}\`, thinking: \`${THINKING}\`.`,
    "",
    "## Summary",
    "",
    `- Scenario runs passed: ${totalPassed}/${allRuns.length} (${percent(totalPassed, allRuns.length)})`,
    `- Pilot turns measured: ${timing.pilotTurns}`,
    `- Median pilot turn: ${seconds(timing.turn)} (classifier ${seconds(timing.classify)}, speech ${seconds(timing.render)})`,
    "",
    "| Section | Scenario | Origin | Passed | Median pilot turn |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const { scenario, runs } of results) {
    const passed = passedRuns(runs);
    const latency = median(pilotSteps(runs).map((step) => step.elapsedMs ?? 0));

    lines.push(
      `| ${scenario.section} | ${scenario.name} | ${scenario.origin} | ${passed}/${runs.length} (${percent(passed, runs.length)}) | ${seconds(latency)} |`,
    );
  }

  lines.push("");

  for (const { scenario, runs } of results) {
    const passed = passedRuns(runs);

    lines.push(`## ${scenario.name}`, "");
    lines.push(
      `_${scenario.section} · ${scenario.origin} · ${passed}/${runs.length} (${percent(passed, runs.length)})_`,
      "",
    );

    scenario.steps.forEach((step, index) => {
      if (!step.pilot && !step.expect) {
        return;
      }

      const heading = step.pilot
        ? `**Step ${index + 1} — Pilot:** "${step.pilot}"`
        : `**Step ${index + 1} — no pilot transmission**`;

      lines.push(heading, "", "| Run | Result | Pilot turn | Decision | ATC |", "| --- | --- | --- | --- | --- |");

      for (const run of runs) {
        const result = run.steps[index];
        const verdict = result.evaluation
          ? result.evaluation.passed
            ? "PASS"
            : "FAIL"
          : "-";
        const latency =
          result.elapsedMs === undefined ? "-" : seconds(result.elapsedMs);

        lines.push(
          `| ${run.run} | ${verdict} | ${latency} | ${escapeTableCell(result.trace ?? "-")} | ${escapeTableCell(result.response)} |`,
        );
      }

      lines.push("");

      for (const run of runs) {
        const failures = run.steps[index].evaluation?.failures ?? [];

        if (failures.length > 0) {
          lines.push(`Run ${run.run} failures:`);
          failures.forEach((failure) => lines.push(`- ${failure}`));
          lines.push("");
        }
      }
    });
  }

  return lines.join("\n");
}

const RESULTS_DIR = join(process.cwd(), "benchmark-results");

// e.g. "qwen3:4b-instruct-2507-q4_K_M" -> "qwen3-4b-instruct-2507-q4KM"
// e.g. "maternion/lfm2.5:8b" -> "maternion-lfm2.5-8b"
const sanitizeForFilename = (value: string): string =>
  value.replace(/[:/\\]/g, "-").replace(/_/g, "");

const buildReportBaseName = (filter?: string): string =>
  `${sanitizeForFilename(MODEL)}_thinking_${THINKING}` +
  (filter ? `_only-${filter.replace(/[^a-z0-9]+/g, "-")}` : "");

const resolveAvailableFilePath = (baseName: string): string => {
  const plainPath = join(RESULTS_DIR, `${baseName}.md`);

  if (!existsSync(plainPath)) {
    return plainPath;
  }

  let suffix = 1;
  let candidatePath = join(RESULTS_DIR, `${baseName}_${suffix}.md`);

  while (existsSync(candidatePath)) {
    suffix += 1;
    candidatePath = join(RESULTS_DIR, `${baseName}_${suffix}.md`);
  }

  return candidatePath;
};

export function saveMarkdownReport(markdown: string, filter?: string): string {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const filePath = resolveAvailableFilePath(buildReportBaseName(filter));

  writeFileSync(filePath, markdown);

  return filePath;
}
