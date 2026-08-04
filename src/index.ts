import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { getAiResponse } from "./ai/ai";

const simulator = new MsfsSimulator();

var hasRequestedAiResponse = false;

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await simulator.connect();

  console.log("Connected. Reading user-aircraft telemetry");

  simulator.onAircraftStateUpdate(async (state) => {
    if (hasRequestedAiResponse) return;
    hasRequestedAiResponse = true;

    // process.stdout.write(telemetry);
    console.log("Getting response...");
    const response = await getAiResponse(state);
    console.log(response);
    stop();
  });

  const stop = (): void => {
    console.log("\nDisconnecting");

    simulator.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

start().catch((error: unknown) => {
  console.error("Unable to connect to Microsoft Flight Simulator:", error);

  process.exitCode = 1;
});
