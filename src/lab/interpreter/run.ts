import { extractEmergencyDetails } from "../../ai/interpreter/emergencyDetailsExtractor";
import { extractFlightIntake } from "../../ai/interpreter/flightIntakeExtractor";
import { verifyTaxiReadback } from "../../ai/interpreter/taxiReadbackVerifier";
import { classifyPilotMessage } from "../../ai/interpreter/pilotMessageClassifier";
import { PilotMessage } from "../../domain/PilotMessage";
import { MODEL } from "../../ai/modelConfig";
import { labAirport } from "../airports";
import { intakeSamples } from "./intakeSamples";
import { readbackSamples } from "./readbackSamples";
import { samples } from "./samples";

const RUNS_PER_SAMPLE = 1;

const EMERGENCY_KEYS = [
  "urgency",
  "nature",
  "intention",
  "soulsOnBoard",
  "fuelEnduranceMinutes",
] as const;

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
  let emergencyChecks = 0;
  let emergencyCorrect = 0;
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

    if (expected.emergency) {
      const details = await extractEmergencyDetails(sample.pilot);

      for (const key of EMERGENCY_KEYS) {
        const want = (expected.emergency as Record<string, unknown>)[key];
        const got = (details as Record<string, unknown> | undefined)?.[key];
        emergencyChecks++;
        emergencyCorrect += got === want ? 1 : 0;

        if (got !== want) {
          console.log(`DIFF emergency "${sample.pilot}"`);
          console.log(`     ${key}: expected ${want}, got ${got}`);
        }
      }
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
  console.log(`Emergency details: ${percent(emergencyCorrect, emergencyChecks)}`);
  console.log(`Invalid output: ${invalid}`);
  console.log(`Samples with inconsistent runs: ${unstable}/${samples.length}`);
  console.log(`Median latency: ${(median(latencies) / 1000).toFixed(2)} s`);

  console.log("\nType confusion (expected -> predicted):");
  [...confusion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, count]) => console.log(`  ${key}: ${count}`));
}

async function runReadbackVerification(): Promise<void> {
  console.log("\n=== Taxi readback verifier ===");

  const fields = { readsBack: 0, holdShortRepeated: 0, taxiwaysRepeated: 0, mentionsOtherTaxiway: 0 };
  let invalid = 0;
  const latencies: number[] = [];

  for (const sample of readbackSamples) {
    const start = performance.now();
    const got = await verifyTaxiReadback({
      transcript: sample.transcript,
      legs: sample.taxiways.map((name) => ({ kind: "taxiway", name })),
      holdShort: sample.holdShort,
      callsign: "LV-INQ",
      destination: sample.destination ?? (sample.holdShort ? `runway ${sample.holdShort}` : undefined),
      knownNonTaxiways: [sample.holdShort, sample.destination].filter(
        (text): text is string => text !== undefined,
      ),
    });
    latencies.push(performance.now() - start);

    if (!got) {
      invalid++;
      console.log(`INVALID "${sample.transcript}"`);
      continue;
    }

    const want = sample.expected;
    const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
    const correct = {
      readsBack: got.readsBack === want.readsBack,
      holdShortRepeated: got.holdShortRepeated === want.holdShortRepeated,
      taxiwaysRepeated: sameSet(got.taxiwaysRepeated, want.taxiwaysRepeated),
      mentionsOtherTaxiway: got.mentionsOtherTaxiway === want.mentionsOtherTaxiway,
    };

    (Object.keys(fields) as (keyof typeof fields)[]).forEach((key) => {
      fields[key] += correct[key] ? 1 : 0;
    });

    if (Object.values(correct).some((ok) => !ok)) {
      console.log(`DIFF "${sample.transcript}"`);
      console.log(`     expected: ${JSON.stringify(want)}`);
      console.log(`     got:      ${JSON.stringify(got)}`);
    }
  }

  const total = readbackSamples.length;
  console.log("");
  (Object.keys(fields) as (keyof typeof fields)[]).forEach((key) =>
    console.log(`${key}: ${percent(fields[key], total)}`),
  );
  console.log(`Invalid output: ${invalid}`);
  console.log(`Median latency: ${(median(latencies) / 1000).toFixed(2)} s`);
}

async function runIntakeExtraction(): Promise<void> {
  console.log("\n=== Flight intake extractor ===");

  const squash = (text?: string) => (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  let destinationOk = 0;
  let rulesOk = 0;
  let localOk = 0;
  let invalid = 0;
  const latencies: number[] = [];

  for (const sample of intakeSamples) {
    const start = performance.now();
    const got = await extractFlightIntake(sample.transcript, "LV-INQ", sample.lastAtc);
    latencies.push(performance.now() - start);

    if (!got) {
      invalid++;
      console.log(`INVALID "${sample.transcript}"`);
      continue;
    }

    // "SAEZ" and "Sierra Alpha Echo Zulu" are the same destination.
    const initials = (text?: string) =>
      (text ?? "").split(/[^\p{L}]+/u).filter(Boolean).map((word) => word[0]).join("").toLowerCase();
    const sameDestination =
      squash(got.destinationText) === squash(sample.destination) ||
      (sample.destination !== undefined && squash(got.destinationText) === initials(sample.destination));

    const correct = {
      destination: sameDestination,
      rules: got.rules === sample.rules,
      local: got.local === (sample.local ?? false),
    };

    destinationOk += correct.destination ? 1 : 0;
    rulesOk += correct.rules ? 1 : 0;
    localOk += correct.local ? 1 : 0;

    if (Object.values(correct).some((ok) => !ok)) {
      console.log(`DIFF "${sample.transcript}"`);
      console.log(`     expected: ${JSON.stringify({ destination: sample.destination, rules: sample.rules, local: sample.local ?? false })}`);
      console.log(`     got:      ${JSON.stringify(got)}`);
    }
  }

  const total = intakeSamples.length;
  console.log("");
  console.log(`destination: ${percent(destinationOk, total)}`);
  console.log(`rules: ${percent(rulesOk, total)}`);
  console.log(`local: ${percent(localOk, total)}`);
  console.log(`Invalid output: ${invalid}`);
  console.log(`Median latency: ${(median(latencies) / 1000).toFixed(2)} s`);
}

async function main(): Promise<void> {
  const only = ["--verifier", "--intake"].find((flag) => process.argv.includes(flag));

  if (!only) {
    await runClassification();
  }

  if (!only || only === "--verifier") {
    await runReadbackVerification();
  }

  if (!only || only === "--intake") {
    await runIntakeExtraction();
  }
}

main().catch((error: unknown) => {
  console.error("Interpreter lab failed:", error);
  process.exitCode = 1;
});
