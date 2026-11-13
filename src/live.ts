import { appendFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline";
import { MsfsFacilityReader } from "./adapters/msfs2024/MsfsFacilityReader";
import { MsfsSimulator } from "./adapters/msfs2024/MsfsSimulator";
import { AirportTracker, facilityFor, isJump, likelyActiveRunway } from "./app/airportTracker";
import { FlightSession } from "./app/flightSession";
import { SimClock } from "./app/simClock";
import { AirportDirectory } from "./directory/airportDirectory";
import { directoryFilesExist, loadOurAirports } from "./directory/ourAirports";
import { AircraftState } from "./domain/AircraftState";
import { Airport } from "./domain/Airport";
import { DEFAULT_FLIGHT_PLAN } from "./domain/defaultFlightPlan";
import { DEFAULT_PILOT_PROFILE } from "./domain/defaultPilot";
import { JsonPilotRecordStore } from "./memory/jsonPilotRecordStore";
import { createPilotRecord } from "./memory/recordKeeping";
import { PipelineTurn } from "./pipeline/atcPipeline";
import { distanceToPointFeet, nearestParking } from "./taxi/routing";
import { distanceFeet } from "./utils/geo";

const TICK_MS = 1000;
const RECONNECT_MS = 5000;
const AIRPORT_CHECK_MS = 5000;
const NO_TELEMETRY_NOTICE_MS = 5000;

const stringAfter = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

const flag = (name: string): boolean => process.argv.includes(name);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const HELP = `
Radio: type what you would say, e.g.  Ground, <callsign>, request taxi for departure.
Commands: /where (what the controller thinks), /quit (save the pilot record and leave).
Options: --airport <ICAO> (stay at that airport), --runway <designator>, --callsign <x>
         (default: the aircraft's tail number), --intake, --records <dir>,
         --trace <file> (one JSON line per second: phase, speed, runway-relative position, intents).
`;

const connectWhenAvailable = async (simulator: MsfsSimulator): Promise<void> => {
  let announced = false;

  for (;;) {
    try {
      await simulator.connect();

      return;
    } catch {
      if (!announced) {
        console.log("Waiting for Microsoft Flight Simulator 2024 to start (Ctrl+C to quit)...");
        announced = true;
      }

      await sleep(RECONNECT_MS);
    }
  }
};

const waitForTelemetry = (simulator: MsfsSimulator): Promise<AircraftState> =>
  new Promise((resolve) => {
    const notice = setTimeout(
      () => console.log("Connected, waiting for a flight to load..."),
      NO_TELEMETRY_NOTICE_MS,
    );

    simulator.onAircraftStateUpdate((state) => {
      clearTimeout(notice);
      resolve(state);
    });
  });

async function main(): Promise<void> {
  const simulator = new MsfsSimulator();

  console.log("Connecting to Microsoft Flight Simulator 2024...");
  await connectWhenAvailable(simulator);

  const aircraft = await waitForTelemetry(simulator);
  const reader = new MsfsFacilityReader(simulator.getHandle());
  const forcedAirport = stringAfter("--airport")?.toUpperCase();
  const forcedRunway = stringAfter("--runway");
  const forcedCallsign = stringAfter("--callsign");
  const callsignFor = (state: AircraftState): string =>
    forcedCallsign || state.tailNumber || DEFAULT_FLIGHT_PLAN.callsign || "UNKNOWN";

  const tracker = new AirportTracker({
    list: () => reader.listAirports(),
    read: async (icao, region) => {
      const { airport: read, warnings } = await reader.readAirport(icao, region);

      warnings.forEach((warning) => console.warn(`! ${icao}: ${warning}`));

      return read;
    },
  });

  let airport: Airport;

  if (forcedAirport) {
    const { airport: read, warnings } = await reader.readAirport(forcedAirport);

    warnings.forEach((warning) => console.warn(`! ${warning}`));
    airport = read;
  } else {
    const nearest = await tracker.nearest(aircraft);

    if (!nearest) {
      throw new Error("No airport with a runway was found near the aircraft.");
    }

    airport = nearest;
  }

  const activeRunwayFor = (target: Airport, state: AircraftState): string =>
    (target.runways.find((r) => r.designator === forcedRunway) ?? likelyActiveRunway(target, state)).designator;

  const store = new JsonPilotRecordStore(stringAfter("--records"));
  const record =
    (await store.load(DEFAULT_PILOT_PROFILE.pilotId)) ??
    createPilotRecord(DEFAULT_PILOT_PROFILE.pilotId, DEFAULT_PILOT_PROFILE.displayName);

  const clock = new SimClock();
  const startedAt = Date.now();
  let latest: AircraftState = aircraft;
  let pendingReset = false;

  clock.observe(aircraft, Date.now());
  simulator.onAircraftStateUpdate((state) => {
    if (isJump(latest, state)) {
      pendingReset = true;
    }

    clock.observe(state, Date.now());
    latest = state;
  });

  let directory: AirportDirectory | undefined;
  let closed = false;

  const stamp = (): string => {
    const total = Math.floor(clock.now() / 1000);

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

  const summarize = (target: Airport, runway: string, callsign: string): string => {
    const tower = target.frequencies?.find((f) => f.type === "tower");
    const ground = target.frequencies?.find((f) => f.type === "ground");

    return (
      `${target.name} (${target.icao}), runway ${runway} active, callsign ${callsign}.\n` +
      `Runways: ${target.runways.map((r) => r.designator).join(", ")}. ` +
      `Taxi network: ${target.taxi ? `${target.taxi.points.length} points` : "none"}. ` +
      `Frequencies: ${tower ? `tower ${tower.frequencyMhz}` : "no tower"}${ground ? `, ground ${ground.frequencyMhz}` : ""}.`
    );
  };

  const session = new FlightSession({
    simulator,
    airport,
    facility: facilityFor(airport),
    record,
    store,
    callsign: callsignFor(aircraft),
    runway: activeRunwayFor(airport, aircraft),
    clock: () => clock.now(),
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
      show(`[${stamp()}] ATC> ${text}${pilotSpoke ? "" : "  (unprompted)"}\n${describe(turn)}`),
    onTurn: (turn, pilotSpoke, state) => {
      if (!tracePath) {
        return;
      }

      const { situation, message, intents } = turn.trace;

      appendFileSync(
        tracePath,
        `${JSON.stringify({
          t: stamp(),
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
  let stopping = false;
  let checking = false;

  // Moves to a new airport, or starts over at the same one after a jump (a
  // teleport or a flight reload): the controller's memory of the old situation
  // would otherwise carry over to a place where it means nothing.
  const reevaluate = async (): Promise<void> => {
    if (checking || stopping) {
      return;
    }

    checking = true;

    try {
      const resetting = pendingReset;
      let target: Airport | undefined;

      if (resetting) {
        pendingReset = false;
        target = (forcedAirport ? undefined : await tracker.nearest(latest)) ?? airport;
      } else if (!forcedAirport) {
        target = await tracker.next(latest, airport);
      }

      if (target) {
        const state = latest;
        const runway = activeRunwayFor(target, state);
        const callsign = callsignFor(state);

        await session.relocate({ airport: target, facility: facilityFor(target), runway, callsign });
        airport = target;
        show(`${resetting ? "Position jumped, starting over at" : "Now at"} ${summarize(target, runway, callsign)}`);
      }
    } catch (error) {
      show(`! ${(error as Error).message}`);
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(() => session.tick(), TICK_MS);
  const airportTimer = setInterval(() => void reevaluate(), AIRPORT_CHECK_MS);

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    clearInterval(timer);
    clearInterval(airportTimer);
    await session.stop();
    simulator.disconnect();

    if (!closed) {
      rl.close();
    }

    process.exit(0);
  };

  simulator.onDisconnect(() => {
    console.log("\nThe simulator closed the connection. Saving the pilot record and leaving.");
    void stop();
  });

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
        `${airport.name} (${airport.icao}), phase ${situation?.phase ?? "unknown"}, ` +
          `controller: ${engine.position ?? "single"}, flight plan: ${engine.intake?.destination?.name ?? "none"}`,
      ];

      if (airport.taxi) {
        const spot = nearestParking(airport.taxi, here);

        if (spot) {
          lines.push(`nearest parking: ${spot.name}, ${Math.round(distanceFeet(here, spot.position))} ft`);
        }

        const taxi = engine.taxi;
        const last = taxi?.pointIds[taxi.pointIds.length - 1];

        if (taxi && last !== undefined) {
          const target =
            taxi.destination.kind === "runway" ? `runway ${taxi.destination.runway} hold line` : taxi.destination.name;
          const legs = taxi.legs
            .map((leg) => (leg.kind === "taxiway" ? leg.name : `cross ${leg.runway}`))
            .join(", ");

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
      show(`[${stamp()}] ATC> (no response)\n${describe(turn)}`);
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

  console.log(
    `Connected. ${summarize(airport, activeRunwayFor(airport, aircraft), callsignFor(aircraft))}${HELP}`,
  );

  session.start();
  rl.prompt();
}

main().catch((error: unknown) => {
  console.error("Live session failed:", error);
  process.exitCode = 1;
});
