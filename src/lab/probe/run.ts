import { MsfsSimulator } from "../../adapters/msfs2024/MsfsSimulator";
import { MsfsFacilityReader } from "../../adapters/msfs2024/MsfsFacilityReader";
import { locateOnNetwork } from "../../taxi/routing";
import { runwayOffset } from "../../utils/geo";
import { AircraftState } from "../../domain/AircraftState";

const PRINT_EVERY_MS = 1000;

async function main(): Promise<void> {
  const simulator = new MsfsSimulator();

  console.log("Connecting to Microsoft Flight Simulator 2024...");
  await simulator.connect();
  console.log("Connected. Printing telemetry once a second. Ctrl+C to stop.");

  let latest: AircraftState | undefined;
  let received = 0;

  simulator.onAircraftStateUpdate((state) => {
    latest = state;
    received++;
  });

  if (process.argv.includes("--airport")) {
    const position = await new Promise<AircraftState>((resolve) => {
      const wait = setInterval(() => {
        if (latest) {
          clearInterval(wait);
          resolve(latest);
        }
      }, 100);
    });
    const reader = new MsfsFacilityReader(simulator.getHandle());
    const nearest = await reader.nearestAirport(position);

    console.log("Nearest airport:", JSON.stringify(nearest));

    const { airport, warnings } = await reader.readAirport(nearest.icao, nearest.region);

    console.log("Warnings:", warnings.length > 0 ? warnings : "none");
    console.log(JSON.stringify({ ...airport, taxi: undefined }, null, 2));
    console.log(
      "Taxi network:",
      airport.taxi
        ? `${airport.taxi.points.length} points, ${airport.taxi.segments.length} segments, ${airport.taxi.parking.length} parking, ${airport.taxi.points.filter((p) => p.holdShortRunway).length} hold-short points`
        : "none",
    );
    if (airport.taxi) {
      const here = locateOnNetwork(airport.taxi, position);
      const runway = airport.runways[0];
      const frame = (point: { latitude: number; longitude: number }) => {
        const offset = runwayOffset(runway.threshold, runway.trueHeading, point);

        return `along ${Math.round(offset.alongFeet)} cross ${Math.round(offset.crossFeet)}`;
      };

      console.log(`Aircraft on network: ${JSON.stringify(here)}`);
      console.log(`Aircraft in runway ${runway.designator} frame: ${frame(position)}`);
      console.log(
        "Taxiways:",
        [...new Set(airport.taxi.segments.map((s) => s.taxiway ?? "(unnamed)"))].join(", "),
      );
      if (process.argv.includes("--segments")) {
        const at = (id: number) => frame(airport.taxi!.points[id].position);

        for (const s of airport.taxi.segments) {
          console.log(`  ${s.from} (${at(s.from)}) -> ${s.to} (${at(s.to)}) ${s.taxiway ?? ""}${s.crossesRunway ? ` CROSSES ${s.crossesRunway}` : ""}`);
        }
      }
      console.log("Crossings:", airport.taxi.segments.filter((s) => s.crossesRunway).length);
      for (const point of airport.taxi.points.filter((p) => p.holdShortRunway)) {
        console.log(`Hold short ${point.holdShortRunway}: ${frame(point.position)}`);
      }
      for (const spot of airport.taxi.parking) {
        console.log(`Parking "${spot.name}" -> point ${spot.pointId}: ${frame(spot.position)}`);
      }
    }

    simulator.disconnect();
    process.exit(0);
  }

  const timer = setInterval(() => {
    if (!latest) {
      console.log("(no telemetry yet)");
      return;
    }

    console.log(`${received} samples`, JSON.stringify(latest));
  }, PRINT_EVERY_MS);

  process.once("SIGINT", () => {
    clearInterval(timer);
    simulator.disconnect();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error("Probe failed:", error);
  process.exitCode = 1;
});
