import * as readline from "node:readline";
import { FlightSession } from "../../app/flightSession";
import { AirportDirectory } from "../../directory/airportDirectory";
import { directoryFilesExist, loadOurAirports } from "../../directory/ourAirports";
import { DEFAULT_FLIGHT_PLAN } from "../../domain/defaultFlightPlan";
import { DEFAULT_PILOT_PROFILE } from "../../domain/defaultPilot";
import { JsonPilotRecordStore } from "../../memory/jsonPilotRecordStore";
import { createPilotRecord } from "../../memory/recordKeeping";
import { PipelineTurn } from "../../pipeline/atcPipeline";
import { standardFlight, startOfFlight } from "../../sim/standardFlight";
import { SimulatedSimulator } from "../../sim/simulatedSimulator";
import { labAirport, labTower } from "../airports";
import { labDirectory } from "../directoryFixture";

const TICK_REAL_MS = 1000;

const flag = (name: string): boolean => process.argv.includes(name);
const numberAfter = (name: string, fallback: number): number => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const HELP = `
Radio: just type what you would say, e.g.  Ground, LV-INQ, request taxi for departure.
Commands (start with /):
  /next            fly or taxi the next stage of the standard pattern flight
  /stages          list the stages and where you are
  /jump <stage>    put the aircraft at the start of a stage (name or number)
  /advance <s>     fast-forward s simulated seconds, one tick per second
  /speed <n>       simulated seconds per real second (now and for /next)
  /tune <mhz|off>  tune COM1 (the controller notices which frequency you are on)
  /where           what the controller thinks is going on
  /quit            save the pilot record and leave
`;

const clockText = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

async function main(): Promise<void> {
  const recordsAt = process.argv.indexOf("--records");
  const store = new JsonPilotRecordStore(recordsAt === -1 ? undefined : process.argv[recordsAt + 1]);
  const record =
    (await store.load(DEFAULT_PILOT_PROFILE.pilotId)) ??
    createPilotRecord(DEFAULT_PILOT_PROFILE.pilotId, DEFAULT_PILOT_PROFILE.displayName);

  const real = flag("--real-airports") && directoryFilesExist();
  let realDirectory: AirportDirectory | undefined;
  const directory = (): AirportDirectory => {
    if (real) {
      realDirectory ??= new AirportDirectory(loadOurAirports());
      return realDirectory;
    }

    return labDirectory;
  };

  const runway = labAirport.runways[0];
  const simulator = new SimulatedSimulator(runway, labAirport.elevationFeet, startOfFlight);
  let simMs = 0;
  let speed = numberAfter("--speed", 1);
  let nextStage = 0;
  let fastForwarding = false;

  let closed = false;

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
    airport: labAirport,
    facility: labTower,
    record,
    store,
    callsign: DEFAULT_FLIGHT_PLAN.callsign,
    clock: () => simMs,
    epochBaseMs: Date.now(),
    directory,
    askFlightIntake: flag("--intake"),
    onTransmission: (text, turn, pilotSpoke) =>
      show(`[${clockText(simMs)}] ATC> ${text}${pilotSpoke ? "" : "  (unprompted)"}\n${describe(turn)}`),
    onError: (error) => show(`! ${(error as Error).message}`),
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "Pilot> " });

  const advance = (seconds: number): void => {
    simulator.advance(seconds);
    simMs += seconds * 1000;
    session.tick();
  };

  const timer = setInterval(() => {
    if (!fastForwarding) {
      advance(speed);
    }
  }, TICK_REAL_MS);

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

  const command = async (line: string): Promise<void> => {
    const [name, argument] = line.slice(1).trim().split(/\s+/);

    switch (name) {
      case "next": {
        const stage = standardFlight[nextStage];

        if (!stage) {
          show("The flight is complete. /jump taxi to start again.");
          return;
        }

        simulator.enqueue(stage.path);
        nextStage++;
        show(`Stage ${nextStage}/${standardFlight.length}: ${stage.description}`);
        return;
      }
      case "stages":
        show(
          standardFlight
            .map((s, i) => `${i === nextStage ? ">" : " "} ${i + 1}. ${s.name} - ${s.description}`)
            .join("\n"),
        );
        return;
      case "jump": {
        const index = Number.isInteger(Number(argument))
          ? Number(argument) - 1
          : standardFlight.findIndex((s) => s.name === argument);

        if (index < 0 || index >= standardFlight.length) {
          show("Unknown stage. /stages lists them.");
          return;
        }

        simulator.jumpTo(index === 0 ? startOfFlight : standardFlight[index - 1].endsAt);
        nextStage = index;
        show(`At the start of stage ${index + 1}: ${standardFlight[index].name}.`);
        return;
      }
      case "advance": {
        const seconds = Math.max(1, Math.floor(Number(argument) || 0));

        fastForwarding = true;

        for (let i = 0; i < seconds; i++) {
          advance(1);
          await session.idle();
        }

        fastForwarding = false;
        show(`Advanced ${seconds} s.`);
        return;
      }
      case "speed":
        speed = Number(argument) > 0 ? Number(argument) : speed;
        show(`Simulated seconds per real second: ${speed}.`);
        return;
      case "tune":
        simulator.tune(argument === "off" ? undefined : Number(argument));
        show(argument === "off" ? "COM1 not reported." : `COM1 ${argument}.`);
        return;
      case "where": {
        const { situation, engine } = session.state;
        show(
          `phase ${situation?.phase ?? "unknown"}, ground speed ${Math.round(simulator.state.groundSpeed)} kt, ` +
            `controller: ${engine.position ?? "single"}, flight plan: ${engine.intake?.destination?.name ?? "none"}`,
        );
        return;
      }
      case "quit":
        await stop();
        return;
      default:
        show(HELP);
    }
  };

  // One line at a time, so a fast-forward or a slow reply finishes before the
  // next line is handled.
  let lines: Promise<unknown> = Promise.resolve();

  const handle = async (text: string): Promise<void> => {
    if (!text) {
      if (!closed) rl.prompt();
      return;
    }

    if (text.startsWith("/")) {
      await command(text);
      return;
    }

    const turn = await session.say(text);

    if (turn && !turn.transmission) {
      show(`[${clockText(simMs)}] ATC> (no response)\n${describe(turn)}`);
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
    `Fly Tool play: a simulated aircraft at ${labAirport.name}${flag("--intake") ? ", flight plan asked" : ""}. ` +
      `Airports: ${real ? "OurAirports" : "lab fixture"}.${HELP}`,
  );

  session.start();
  simulator.advance(0);
  rl.prompt();
}

main().catch((error: unknown) => {
  console.error("Play failed:", error);
  process.exitCode = 1;
});
