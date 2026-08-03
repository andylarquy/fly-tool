import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { getAiResponse } from "./ai/ai";

const simulator = new MsfsSimulator();

var flag = 0;

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await simulator.connect();

  console.log("Connected. Reading user-aircraft telemetry");

  simulator.onAircraftStateUpdate(async (state) => {
    if (flag === 1) {
     return;
    }

    flag = 1;

    const telemetry =
      `\rLat ${state.latitude.toFixed(5)}  Lon ${state.longitude.toFixed(5)} | ` +
      `Alt ${state.altitudeFeet.toFixed(0)} ft  GS ${state.groundSpeed.toFixed(1)} kt | ` +
      `HDG ${state.trueHeading.toFixed(1)}  Pitch ${state.pitch.toFixed(1)} | ` +
      `Bank ${state.bank.toFixed(1)}  Ground: ${state.isOnGround ? "yes" : "no"}`;

    // process.stdout.write(telemetry);
    console.log(telemetry);
    console.log("Getting response...");
    const response = await getAiResponse(telemetry);
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
