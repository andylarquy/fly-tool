import * as readline from "node:readline";
import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { getAiResponse } from "./ai/singleCall/singleCallAtc";
import { formatInferenceStats } from "./ai/inferenceStats";
import { formatTimestamp } from "./utils/timeFormatting";
import { AircraftState } from "./domain/AircraftState";
import { DEFAULT_FLIGHT_PLAN } from "./domain/defaultFlightPlan";

const simulator = new MsfsSimulator();

let latestAircraftState: AircraftState | undefined;

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
    const atcState = { situationContext: "" };

    // TODO: Eventually implement a proper Flight Plan context once the lab research ends
    const flightPlan = DEFAULT_FLIGHT_PLAN;

    const { content, thinking, response } = await getAiResponse(
      { aircraftState: latestAircraftState, atcState, flightPlan },
      transmission,
    );

    console.log(`\nThinking:\n${thinking}\n`);
    console.log(`\n${formatInferenceStats(response)}\n`);
    console.log(`[${formatTimestamp(new Date())}] ${content}`);
    rl.prompt();
  });
}

start().catch((error: unknown) => {
  console.error("Unable to connect to Microsoft Flight Simulator:", error);

  process.exitCode = 1;
});
