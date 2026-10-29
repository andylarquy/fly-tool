import { classifyPilotMessage } from "../../ai/classifier/pilotMessageClassifier";
import { PilotMessage } from "../../domain/PilotMessage";
import { MODEL } from "../../ai/modelConfig";
import { labAirport } from "../airports";
import { samples } from "./samples";

const RUNS_PER_SAMPLE = 1;

const runways = labAirport.runways.map((runway) => runway.designator);

interface SampleRun {
  message: PilotMessage | undefined;
  elapsedMs: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const describe = (message: PilotMessage | undefined): string =>
  message
    ? `${message.type}/${message.runway ?? "-"}/${message.subject}`
    : "INVALID";

const percent = (part: number, total: number): string =>
  `${part}/${total} (${Math.round((part / total) * 100)}%)`;

async function runClassification(): Promise<void> {
  console.log(`Classifying ${samples.length} samples x${RUNS_PER_SAMPLE} with ${MODEL}\n`);

  const confusion = new Map<string, number>();
  const latencies: number[] = [];
  let total = 0;
  let typeCorrect = 0;
  let runwayCorrect = 0;
  let subjectCorrect = 0;
  let invalid = 0;
  let unstable = 0;

  for (const sample of samples) {
    const runs: SampleRun[] = [];

    for (let run = 0; run < RUNS_PER_SAMPLE; run++) {
      const start = performance.now();
      const result = await classifyPilotMessage({
        pilotTransmission: sample.pilot,
        lastAtcTransmission: sample.lastAtc,
        runways,
      });
      runs.push({
        message: result.message,
        elapsedMs: performance.now() - start,
      });
    }

    const { expected } = sample;
    const outputs = new Set(runs.map((r) => describe(r.message)));

    if (outputs.size > 1) {
      unstable++;
    }

    for (const { message, elapsedMs } of runs) {
      total++;
      latencies.push(elapsedMs);

      if (!message) {
        invalid++;
        continue;
      }

      const key = `${expected.type} -> ${message.type}`;
      confusion.set(key, (confusion.get(key) ?? 0) + 1);

      typeCorrect += message.type === expected.type ? 1 : 0;
      runwayCorrect += message.runway === expected.runway ? 1 : 0;
      subjectCorrect += message.subject === expected.subject ? 1 : 0;
    }

    const allCorrect = runs.every(
      (r) => describe(r.message) === describe(expected),
    );

    console.log(`${allCorrect ? "OK  " : "DIFF"} "${sample.pilot}"`);

    if (!allCorrect) {
      if (sample.lastAtc) {
        console.log(`     last ATC: "${sample.lastAtc}"`);
      }
      console.log(`     expected: ${describe(expected)}`);
      console.log(`     got:      ${runs.map((r) => describe(r.message)).join("  |  ")}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Type:    ${percent(typeCorrect, total)}`);
  console.log(`Runway:  ${percent(runwayCorrect, total)}`);
  console.log(`Subject: ${percent(subjectCorrect, total)}`);
  console.log(`Invalid output: ${invalid}`);
  console.log(`Samples with inconsistent runs: ${unstable}/${samples.length}`);
  console.log(`Median latency: ${(median(latencies) / 1000).toFixed(2)} s`);

  console.log("\nType confusion (expected -> predicted):");
  [...confusion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, count]) => console.log(`  ${key}: ${count}`));
}

runClassification().catch((error: unknown) => {
  console.error("Classification failed:", error);
  process.exitCode = 1;
});
