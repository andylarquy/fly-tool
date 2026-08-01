import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";

const simulator = new MsfsSimulator();

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await simulator.connect();

  console.log("Connected. Reading user-aircraft telemetry");

  simulator.onAircraftStateUpdate((state) => {
    process.stdout.write(
      `\rLat ${state.latitude.toFixed(5)}  Lon ${state.longitude.toFixed(5)} | ` +
        `Alt ${state.altitudeFeet.toFixed(0)} ft  GS ${state.groundSpeed.toFixed(1)} kt | ` +
        `HDG ${state.trueHeading.toFixed(1)}  Pitch ${state.pitch.toFixed(1)} | ` +
        `Bank ${state.bank.toFixed(1)}  Ground: ${state.isOnGround ? "yes" : "no"}`,
    );
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
