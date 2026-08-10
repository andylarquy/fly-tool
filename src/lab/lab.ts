import * as readline from "node:readline";
import { getAiResponse } from "../ai/ai";
import { formatTimestamp } from "../utils/timeFormatting";
import { cases, LabCase } from "./cases";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function selectCase(): Promise<LabCase> {
  console.log("Available cases:");
  cases.forEach((labCase, index) => {
    console.log(`  ${index + 1}. ${labCase.name}`);
  });

  const answer = await ask("Case> ");
  const selected = cases[Number(answer.trim()) - 1];

  if (!selected) {
    console.log("Invalid case, try again.");
    return selectCase();
  }

  return selected;
}

async function start(): Promise<void> {
  console.log("Fly Tool lab: run pilot transmissions against fixed aircraft states.");
  console.log("Type a pilot transmission and press Enter to send it to ATC.");

  const stop = (): void => {
    console.log("\nExiting lab");

    rl.close();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  for (;;) {
    console.log('\n')
    const transmission = (await ask("Pilot> ")).trim();

    if (!transmission) {
      continue;
    }

    const testCase = await selectCase();

    const response = await getAiResponse(testCase.aircraftState,testCase.atcState, transmission);
    console.log(`\n[${formatTimestamp(new Date())}] ${response}`);
  }
}

start();
