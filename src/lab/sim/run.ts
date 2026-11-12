import { FlightSession, FlightSessionOptions } from "../../app/flightSession";
import { FlightEvent } from "../../domain/FlightEvent";
import { PilotRecord } from "../../domain/PilotRecord";
import { createPilotRecord } from "../../memory/recordKeeping";
import { PipelineInput, PipelineState, PipelineTurn, runPipelineTurn } from "../../pipeline/atcPipeline";
import { Situation } from "../../domain/Situation";
import { deriveSituation } from "../../situation/deriveSituation";
import { standardFlight, startOfFlight } from "../../sim/standardFlight";
import { SimulatedSimulator } from "../../sim/simulatedSimulator";
import { labAirport, labTower } from "../airports";

const runway = labAirport.runways[0];
const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

interface Observation {
  stage: string;
  atSeconds: number;
  phase: string;
}

function flyWholeFlight(): { observations: Observation[]; events: { at: number; event: FlightEvent }[] } {
  const simulator = new SimulatedSimulator(runway, labAirport.elevationFeet, startOfFlight);
  const observations: Observation[] = [];
  const events: { at: number; event: FlightEvent }[] = [];
  let previous: Situation | undefined;
  let now = 0;

  for (const stage of standardFlight) {
    simulator.enqueue(stage.path);

    while (simulator.busy) {
      now += 1;
      simulator.advance(1);

      const derived = deriveSituation(
        { aircraft: simulator.state, airport: labAirport, runway: runway.designator, observedAtMs: now * 1000 },
        previous,
      );

      if (derived.situation.phase !== previous?.phase) {
        observations.push({ stage: stage.name, atSeconds: now, phase: derived.situation.phase });
      }

      derived.events
        .filter((event) => event.type !== "phase_changed")
        .forEach((event) => events.push({ at: now, event }));
      previous = derived.situation;
    }
  }

  return { observations, events };
}

const { observations, events } = flyWholeFlight();

console.log("Timeline (sim seconds):");
observations.forEach((o) => console.log(`  ${String(o.atSeconds).padStart(5)} s  [${o.stage}] ${o.phase}`));
events.forEach((e) => console.log(`  ${String(e.at).padStart(5)} s  event ${JSON.stringify(e.event)}`));
console.log("");

const sequence = observations.map((o) => o.phase);
const expected = [
  "stationary", "taxiing", "holding_short", "taxiing", "lined_up", "takeoff_roll", "upwind", "crosswind",
  "downwind", "base", "final", "landing_roll", "taxiing", "stationary", "taxiing", "stationary",
];

check("The phases follow the flight in order, with nothing missing or flickering", sequence.join() === expected.join(), `got: ${sequence.join(" > ")}`);
check("Lift-off is detected once", events.filter((e) => e.event.type === "lifted_off").length === 1);

const touchdowns = events.filter((e) => e.event.type === "touchdown");
check("Touchdown is detected once, on the runway", touchdowns.length === 1 && touchdowns[0].event.type === "touchdown" && touchdowns[0].event.runway === "23");
check(
  "The touchdown rate is the flare's, a gentle one",
  touchdowns[0]?.event.type === "touchdown" && touchdowns[0].event.verticalSpeedFeetPerMinute > -300,
  JSON.stringify(touchdowns[0]?.event),
);
check("No go-around is reported on a normal landing", events.every((e) => e.event.type !== "go_around"));
check("The aircraft ends where it started", (() => {
  const end = standardFlight[standardFlight.length - 1].endsAt;
  return end.alongFeet === startOfFlight.alongFeet && end.crossFeet === startOfFlight.crossFeet;
})());


// --- the live loop, with the pipeline replaced by a fake that takes time ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeTurn = (log: string[], delayMs = 20, failOn?: string): typeof runPipelineTurn =>
  (async (input: PipelineInput, previous: PipelineState): Promise<PipelineTurn> => {
    log.push(`start ${input.pilotTransmission ?? "tick"} @${input.aircraft.altitudeFeet}`);
    await sleep(delayMs);

    if (input.pilotTransmission === failOn) {
      throw new Error("boom");
    }

    log.push(`end ${input.pilotTransmission ?? "tick"}`);

    return {
      transmission: input.pilotTransmission ? `ack ${input.pilotTransmission}` : undefined,
      state: { ...previous, lastAtcTransmission: input.pilotTransmission ?? previous.lastAtcTransmission },
      trace: {} as PipelineTurn["trace"],
    };
  }) as typeof runPipelineTurn;

const newSession = (runTurn: typeof runPipelineTurn, extra: Partial<FlightSessionOptions> = {}) => {
  const simulator = new SimulatedSimulator(runway, labAirport.elevationFeet, startOfFlight);
  const heard: string[] = [];
  const errors: string[] = [];
  const saved: PilotRecord[] = [];
  let clockMs = 0;
  const session = new FlightSession({
    simulator,
    airport: labAirport,
    facility: labTower,
    record: createPilotRecord("p", "P"),
    clock: () => (clockMs += 1000),
    epochBaseMs: 0,
    runTurn,
    store: { load: async () => undefined, save: async (record) => void saved.push(record) },
    onTransmission: (text) => heard.push(text),
    onError: (error) => errors.push(String((error as Error).message)),
    ...extra,
  });

  return { simulator, session, heard, errors, saved };
};

async function runSessionChecks(): Promise<void> {
  {
    const log: string[] = [];
    const { session, simulator } = newSession(fakeTurn(log));

    session.tick();
    check("Nothing happens before the first telemetry", log.length === 0);

    session.start();
    simulator.advance(1);
    session.tick();
    session.tick();
    session.tick();
    await sleep(60);
    check("Ticks that find a turn in flight are dropped", log.filter((l) => l.startsWith("start tick")).length === 1, log.join(" | "));
  }

  {
    const log: string[] = [];
    const { session, simulator, heard } = newSession(fakeTurn(log, 30));

    session.start();
    simulator.advance(1);
    const first = session.say("one");
    const second = session.say("two");
    session.tick();
    const third = session.say("three");
    await Promise.all([first, second, third]);

    check("Pilot lines are answered one at a time, in the order spoken", heard.join() === "ack one,ack two,ack three", heard.join());
    check(
      "Turns never overlap",
      log.every((entry, i) => !entry.startsWith("start") || i === 0 || log[i - 1].startsWith("end")),
      log.join(" | "),
    );
    check("A tick behind queued pilot lines is dropped", log.filter((l) => l.includes("tick")).length === 0, log.join(" | "));
  }

  {
    const log: string[] = [];
    const { session, simulator } = newSession(fakeTurn(log, 20));

    session.start();
    simulator.advance(1);
    const slow = session.say("first");
    simulator.jumpTo({ ...startOfFlight, aglFeet: 500, onGround: false });
    await slow;
    const second = session.say("second");
    await second;
    check("Each turn uses the telemetry from when it runs, not when it was queued", log.some((l) => l === "start second @513") && log.some((l) => l.startsWith("start first")), log.join(" | "));
  }

  {
    const log: string[] = [];
    const { session, simulator, heard, errors } = newSession(fakeTurn(log, 5, "bad"));

    session.start();
    simulator.advance(1);
    const failed = await session.say("bad");
    const next = await session.say("good");

    check("A failing turn is reported and returns nothing", failed === undefined && errors.join() === "boom", errors.join());
    check("The loop carries on after a failure", next?.transmission === "ack good" && heard.join() === "ack good");
  }

  {
    const { session, errors } = newSession(fakeTurn([]));
    const result = await session.say("hello");
    check("Speaking before any telemetry is refused politely", result === undefined && errors.length === 1);
  }

  {
    const log: string[] = [];
    const { session, simulator, saved } = newSession(fakeTurn(log, 40));

    session.start();
    simulator.advance(1);
    void session.say("last");
    await session.stop();
    check("Stopping waits for the turn in flight, then saves the record once", log.includes("end last") && saved.length === 1);
    session.tick();
    await sleep(20);
    check("A stopped session starts nothing new", log.filter((l) => l.startsWith("start")).length === 1);
  }
}

runSessionChecks().then(() => {
  console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
  process.exitCode = failures.length === 0 ? 0 : 1;
});
