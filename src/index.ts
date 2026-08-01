import { Simulator } from "./constants/Simulators";
import { getSimAdapter } from "./simulator/api";

export const SIMULATOR = Simulator.MSFS_2024;
const SimulatorAdapter = getSimAdapter(SIMULATOR);

async function start(): Promise<void> {
  console.log("Connecting to Microsoft Flight Simulator 2024");

  await SimulatorAdapter.Connector.connect();

  console.log(
    `Connected to ${SimulatorAdapter.Connector.getAppName()}. Reading user-aircraft telemetry`,
  );

  SimulatorAdapter.AircraftState.setupListeners();

  SimulatorAdapter.AircraftState.onAircraftStateUpdate((received: any) => {
    const data = received.data;
    const latitude = data.readFloat64();
    const longitude = data.readFloat64();
    const altitudeFeet = data.readFloat64();
    const trueHeading = data.readFloat64();
    const groundSpeed = data.readFloat64();
    const pitch = data.readFloat64();
    const bank = data.readFloat64();
    const isOnGround = data.readInt32() !== 0;

    process.stdout.write(
      `\rLat ${latitude.toFixed(5)}  Lon ${longitude.toFixed(5)} | ` +
        `Alt ${altitudeFeet.toFixed(0)} ft  GS ${groundSpeed.toFixed(1)} kt | ` +
        `HDG ${trueHeading.toFixed(1)}  Pitch ${pitch.toFixed(1)} | ` +
        `Bank ${bank.toFixed(1)}  Ground: ${isOnGround ? "yes" : "no"}`,
    );
  });

  process.once("SIGINT", async () => {
    console.log("\nDisconnecting");
    await SimulatorAdapter.Connector.disconnect();
  });

  process.once("SIGTERM", async () => {
    console.log("\nDisconnecting");
    await SimulatorAdapter.Connector.disconnect();
  });
}

start().catch((error: unknown) => {
  console.error("Unable to connect to Microsoft Flight Simulator:", error);
  process.exitCode = 1;
});
