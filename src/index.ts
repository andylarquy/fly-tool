import * as readline from "node:readline";
import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { getAiResponse } from "./ai/ai";
import { AircraftState } from "./domain/AircraftState";
import { formatTimestamp } from "./utils/timeFormatting";

const simulator = new MsfsSimulator();

let latestAircraftState: AircraftState | null = null;

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await simulator.connect();

  console.log("Connected. Reading user-aircraft telemetry");

  simulator.onAircraftStateUpdate((state) => {
    latestAircraftState = state;
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Pilot> ",
  });

  const stop = (): void => {
    console.log("\nDisconnecting");

    rl.close();
    simulator.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("Type a pilot transmission and press Enter to send it to ATC.");
  rl.prompt();

  rl.on("line", async (line) => {
    const transmission = line.trim();

    if (!transmission) {
      rl.prompt();
      return;
    }

    if (!latestAircraftState) {
      console.log("No telemetry received yet, try again shortly.");
      rl.prompt();
      return;
    }

    // TODO: Eventually implement a proper ATC context once the lab research ends
    const latestAtcState = { situationContext: "" };

    const response = await getAiResponse(
      latestAircraftState,
      latestAtcState,
      transmission,
    );
    console.log(`[${formatTimestamp(new Date())}] ${response}`);
    rl.prompt();
  });
}

start().catch((error: unknown) => {
  console.error("Unable to connect to Microsoft Flight Simulator:", error);

  process.exitCode = 1;
});
