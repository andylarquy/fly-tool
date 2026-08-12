import * as readline from "node:readline";
import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { getAiResponse } from "./ai/ai";
import { formatInferenceStats } from "./ai/inferenceStats";
import { formatTimestamp } from "./utils/timeFormatting";
import { AtcSession } from "./domain/AtcSession";
import { isEmpty } from "lodash";

const simulator = new MsfsSimulator();

type EmptyObject = Record<string, never>; // {}
let atcSession: AtcSession | EmptyObject = {};

const isAtcSession = (
  session: AtcSession | EmptyObject,
): session is AtcSession => !isEmpty(session);

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await simulator.connect();

  console.log("Connected. Reading user-aircraft telemetry");

  simulator.onAircraftStateUpdate((state) => {
    atcSession.aircraftState = state;
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

    if (!atcSession.aircraftState) {
      console.log("No telemetry received yet, try again shortly.");
      rl.prompt();
      return;
    }

    // TODO: Eventually implement a proper ATC context once the lab research ends
    const atcState = { situationContext: "" };
    atcSession.atcState = atcState;

    // TODO: Eventually implement a proper Flight Plan context once the lab research ends
    const flightPlan = { callsign: "LV-INQ" };
    atcSession.flightPlan = flightPlan;

    if (!isAtcSession(atcSession)) return;

    const { content, thinking, response } = await getAiResponse(
      atcSession,
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
