import { appendFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline";
import { MsfsFacilityReader } from "./adapters/msfs2024/MsfsFacilityReader";
import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { FlightSession } from "./app/flightSession";
import { AirportDirectory } from "./directory/airportDirectory";
import { directoryFilesExist, loadOurAirports } from "./directory/ourAirports";
import { AircraftState } from "./domain/AircraftState";
import { Airport, Runway } from "./domain/Airport";
import { DEFAULT_FLIGHT_PLAN } from "./domain/defaultFlightPlan";
import { DEFAULT_PILOT_PROFILE } from "./domain/defaultPilot";
import { Facility } from "./domain/Facility";
import { JsonPilotRecordStore } from "./memory/jsonPilotRecordStore";
import { createPilotRecord } from "./memory/recordKeeping";
import { PipelineTurn } from "./pipeline/atcPipeline";
import { nearestParking, distanceToPointFeet } from "./taxi/routing";
import { angleDifferenceDegrees, distanceFeet } from "./utils/geo";

const TICK_MS = 1000;

const stringAfter = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

const flag = (name: string): boolean => process.argv.includes(name);

const HELP = `
Radio: type what you would say, e.g.  Ground, LV-INQ, request taxi for departure.
Commands: /where (what the controller thinks), /quit (save the pilot record and leave).
Options: --airport <ICAO>, --runway <designator>, --callsign <x>, --intake, --records <dir>,
         --trace <file> (one JSON line per second: phase, speed, runway-relative position, intents).
`;

const waitForTelemetry = (simulator: MsfsSimulator): Promise<AircraftState> =>
  new Promise((resolve) => {
    simulator.onAircraftStateUpdate((state) => resolve(state));
  });

// Without wind data, the end the aircraft already points along is the best guess
// at the runway in use; from the ramp the first one is as good as any.
const likelyActiveRunway = (airport: Airport, aircraft: AircraftState): Runway =>
  airport.runways.reduce((best, runway) =>
    Math.abs(angleDifferenceDegrees(aircraft.trueHeading, runway.trueHeading)) <
    Math.abs(angleDifferenceDegrees(aircraft.trueHeading, best.trueHeading))
      ? runway
      : best,
  );

const facilityFor = (airport: Airport): Facility => ({
  id: `${airport.icao}-TWR`,
  airportIcao: airport.icao,
  role: "tower",
  frequencyMhz: airport.frequencies?.find((f) => f.type === "tower")?.frequencyMhz ?? 0,
});

async function main(): Promise<void> {
  const simulator = new MsfsSimulator();

  console.log("Connecting to Microsoft Flight Simulator 2024...");
  await simulator.connect();

  const aircraft = await waitForTelemetry(simulator);
  const reader = new MsfsFacilityReader(simulator.getHandle());
  const forced = stringAfter("--airport");
  const listed = forced
    ? { icao: forced.toUpperCase(), region: undefined }
    : await reader.nearestAirport(aircraft);
  const { airport, warnings } = await reader.readAirport(listed.icao, listed.region || undefined);

  warnings.forEach((warning) => console.warn(`! ${warning}`));

  const runway =
    airport.runways.find((r) => r.designator === stringAfter("--runway")) ??
    likelyActiveRunway(airport, aircraft);
  const callsign = stringAfter("--callsign") ?? DEFAULT_FLIGHT_PLAN.callsign;
  const store = new JsonPilotRecordStore(stringAfter("--records"));
  const record =
    (await store.load(DEFAULT_PILOT_PROFILE.pilotId)) ??
    createPilotRecord(DEFAULT_PILOT_PROFILE.pilotId, DEFAULT_PILOT_PROFILE.displayName);

  let latest: AircraftState | undefined = aircraft;
  simulator.onAircraftStateUpdate((state) => {
    latest = state;
  });
  let directory: AirportDirectory | undefined;
  const startedAt = Date.now();
  let closed = false;

  const clock = (): string => {
    const total = Math.floor((Date.now() - startedAt) / 1000);

    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const tracePath = stringAfter("--trace");

  if (tracePath) {
    writeFileSync(tracePath, "");
  }

  const show = (text: string): void => {
    process.stdout.write(`\n${text}\n`);

    if (!closed) {
      rl.prompt(true);
    }
  };

  const describe = (turn: PipelineTurn): string => {
    const { situation, message, intents } = turn.trace;
    const heard = message ? `${message.type}/${message.runway ?? "-"}/${message.subject}` : "-";

    return `  [${situation.phase}] heard ${heard} -> ${intents.map((i) => i.type).join(", ") || "silence"}`;
  };

  const session = new FlightSession({
    simulator,
    airport,
    facility: facilityFor(airport),
    record,
    store,
    callsign,
    runway: runway.designator,
    clock: () => Date.now() - startedAt,
    epochBaseMs: startedAt,
    directory: () => {
      if (!directoryFilesExist()) {
        return undefined;
      }

      directory ??= new AirportDirectory(loadOurAirports());

      return directory;
    },
    askFlightIntake: flag("--intake"),
    onTransmission: (text, turn, pilotSpoke) =>
      show(`[${clock()}] ATC> ${text}${pilotSpoke ? "" : "  (unprompted)"}\n${describe(turn)}`),
    onTurn: (turn, pilotSpoke, state) => {
      if (!tracePath) {
        return;
      }

      const { situation, message, intents } = turn.trace;

      appendFileSync(
        tracePath,
        `${JSON.stringify({
          t: clock(),
          phase: situation.phase,
          pending: situation.pendingPhase?.phase,
          groundSpeed: Math.round(state.groundSpeed * 10) / 10,
          alongFeet: Math.round(situation.geometry.alongFeet),
          crossFeet: Math.round(situation.geometry.crossFeet),
          headingOffset: Math.round(situation.geometry.headingOffsetDegrees),
          onRunway: situation.onRunway,
          holdingShort: situation.holdingShortRunway,
          pilot: pilotSpoke ? message : undefined,
          intents: intents.map((i) => i.type),
        })}\n`,
      );
    },
    onError: (error) => show(`! ${(error as Error).message}`),
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "Pilot> " });
  const timer = setInterval(() => session.tick(), TICK_MS);
  let stopping = false;

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    clearInterval(timer);
    await session.stop();
    simulator.disconnect();

    if (!closed) {
      rl.close();
    }

    process.exit(0);
  };

  let lines: Promise<unknown> = Promise.resolve();

  const handle = async (text: string): Promise<void> => {
    if (!text) {
      if (!closed) rl.prompt();
      return;
    }

    if (text === "/quit") {
      await stop();
      return;
    }

    if (text === "/where") {
      const { situation, engine } = session.state;
      const here = latest;
      const lines = [
        `phase ${situation?.phase ?? "unknown"}, controller: ${engine.position ?? "single"}, ` +
          `flight plan: ${engine.intake?.destination?.name ?? "none"}`,
      ];

      if (here && airport.taxi) {
        const spot = nearestParking(airport.taxi, here);

        if (spot) {
          lines.push(`nearest parking: ${spot.name}, ${Math.round(distanceFeet(here, spot.position))} ft`);
        }

        const taxi = engine.taxi;
        const last = taxi?.pointIds[taxi.pointIds.length - 1];

        if (taxi && last !== undefined) {
          const target = taxi.destination.kind === "runway" ? `runway ${taxi.destination.runway} hold line` : taxi.destination.name;
          const legs = taxi.legs.map((leg) => (leg.kind === "taxiway" ? leg.name : `cross ${leg.runway}`)).join(", ");

          lines.push(
            `taxiing to ${target}: ${Math.round(distanceToPointFeet(airport.taxi, last, here))} ft to go${legs ? ` via ${legs}` : ""}`,
          );
        }
      }

      show(lines.join("\n"));
      return;
    }

    if (text.startsWith("/")) {
      show(HELP);
      return;
    }

    const turn = await session.say(text);

    if (turn && !turn.transmission) {
      show(`[${clock()}] ATC> (no response)\n${describe(turn)}`);
    }
  };

  rl.on("line", (line) => {
    lines = lines.then(() => handle(line.trim()));
  });
  rl.on("close", () => {
    closed = true;
    void lines.then(stop);
  });
  process.once("SIGINT", () => void stop());

  const tower = airport.frequencies?.find((f) => f.type === "tower");
  const ground = airport.frequencies?.find((f) => f.type === "ground");

  console.log(
    `Connected. ${airport.name} (${airport.icao}), runway ${runway.designator} active, callsign ${callsign}.\n` +
      `Runways: ${airport.runways.map((r) => r.designator).join(", ")}. ` +
      `Taxi network: ${airport.taxi ? `${airport.taxi.points.length} points` : "none"}. ` +
      `Frequencies: ${tower ? `tower ${tower.frequencyMhz}` : "no tower"}${ground ? `, ground ${ground.frequencyMhz}` : ""}.${HELP}`,
  );

  session.start();
  rl.prompt();
}

main().catch((error: unknown) => {
  console.error("Live session failed:", error);
  process.exitCode = 1;
});
