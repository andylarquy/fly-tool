import { AirportSource, AirportTracker, isJump, likelyActiveRunway } from "../../app/airportTracker";
import { SimClock } from "../../app/simClock";
import { AircraftState } from "../../domain/AircraftState";
import { Airport } from "../../domain/Airport";
import { ListedAirport } from "../../domain/ListedAirport";
import { labAirport } from "../airports";

const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

// One degree of latitude is 60 nautical miles, so latitudes read as distances:
// 0.1 degree is 6 nm.
const at = (latitude: number, extra: Partial<AircraftState> = {}): AircraftState => ({
  latitude,
  longitude: 0,
  altitudeFeet: 0,
  trueHeading: 0,
  groundSpeed: 0,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: true,
  ...extra,
});

const airport = (icao: string, latitude: number, runways = 1): Airport => ({
  ...labAirport,
  icao,
  name: icao,
  position: { latitude, longitude: 0 },
  runways: labAirport.runways.slice(0, runways),
});

const world = [airport("AAAA", 0), airport("BBBB", 0.2), airport("CCCC", 0.06), airport("HELI", 0.004, 0)];

const source = (reads: string[]): AirportSource => ({
  list: async (): Promise<ListedAirport[]> =>
    world.map((a) => ({ icao: a.icao, region: "", position: a.position })),
  read: async (icao) => {
    reads.push(icao);

    return world.find((a) => a.icao === icao)!;
  },
});

async function trackerChecks(): Promise<void> {
  const reads: string[] = [];
  const tracker = new AirportTracker(source(reads));
  const A = world[0];

  const beside = await tracker.nearest(at(0.005));
  check("A heliport (no runway) is skipped for the nearest airport with one", beside?.icao === "AAAA", beside?.icao);
  await tracker.nearest(at(0.005));
  check("Each airport is read at most once, the heliport included", reads.join() === "HELI,AAAA", reads.join());

  check("Sitting at the current airport changes nothing", (await tracker.next(at(0.005), A)) === undefined);
  check(
    "On the ground at another airport 12 nm away: switch",
    (await tracker.next(at(0.2), A))?.icao === "BBBB",
  );
  check(
    "In the air 9 nm out and 3 nm from the next airport: switch",
    (await tracker.next(at(0.15, { isOnGround: false }), A))?.icao === "BBBB",
  );
  check(
    "In the air but still within 8 nm of the current airport: stay",
    (await tracker.next(at(0.13, { isOnGround: false }), A)) === undefined,
  );
  check(
    "Halfway between two airports nobody flips (needs a clear margin)",
    (await tracker.next(at(0.1, { isOnGround: false }), A)) === undefined,
  );
  check(
    "In the air 18 nm from the next airport (30 nm range): prepare for it",
    (await tracker.next(at(0.5, { isOnGround: false }), A))?.icao === "BBBB",
  );
  check(
    "In the air 60 nm from anything: stay where we were",
    (await tracker.next(at(1.2, { isOnGround: false }), A)) === undefined,
  );
  check(
    "On the ground at a neighbor 3.6 nm away: switch",
    (await tracker.next(at(0.06), A))?.icao === "CCCC",
  );
  check("On the ground between close neighbors: stay", (await tracker.next(at(0.03), A)) === undefined);

  const lone = new AirportTracker({ list: async () => [], read: async () => A });
  check("No airports listed: nothing to choose", (await lone.nearest(at(0))) === undefined);
}

function jumpChecks(): void {
  const here = at(0, { simTimeSeconds: 1000 });

  check("A normal step is no jump", !isJump(here, at(0.0001, { simTimeSeconds: 1000.02 })));
  check("A teleport is a jump", isJump(here, at(0.2, { simTimeSeconds: 1000.02 })));
  check("Sim time going back (a flight reload) is a jump", isJump(here, at(0, { simTimeSeconds: 900 })));
  check("Pausing (same sim time) is no jump", !isJump(here, at(0, { simTimeSeconds: 1000 })));
  check(
    "Without sim time only distance counts",
    !isJump(at(0), at(0.0001)) && isJump(at(0), at(0.2)),
  );
}

function runwayChecks(): void {
  const runway05 = likelyActiveRunway(labAirport, at(0, { trueHeading: 50 }));
  const runway23 = likelyActiveRunway(labAirport, at(0, { trueHeading: 220 }));

  check("The runway the aircraft points along is the likely active one", runway05.designator === "05" && runway23.designator === "23");
}

function clockChecks(): void {
  const withSim = (seconds: number) => at(0, { simTimeSeconds: seconds });
  const clock = new SimClock();

  clock.observe(withSim(1000), 0);
  clock.observe(withSim(1001), 5000);
  check("The clock follows sim time, not wall time", clock.now() === 1000, String(clock.now()));
  clock.observe(withSim(1001), 9000);
  check("A pause (sim time standing still) stops it", clock.now() === 1000, String(clock.now()));
  clock.observe(withSim(1005), 10000);
  check("A faster sim rate runs it faster", clock.now() === 5000, String(clock.now()));
  clock.observe(withSim(900), 11000);
  check("A step backwards adds nothing and never runs it backwards", clock.now() === 5000, String(clock.now()));
  clock.observe(withSim(901), 12000);
  check("It carries on from the new sim time", clock.now() === 6000, String(clock.now()));
  clock.observe(withSim(9000), 13000);
  check("A leap of hours (a flight reload) adds nothing", clock.now() === 6000, String(clock.now()));

  const wall = new SimClock();

  wall.observe(at(0), 1000);
  wall.observe(at(0), 4000);
  check("Without sim time it falls back to wall time", wall.now() === 3000, String(wall.now()));
}

async function main(): Promise<void> {
  await trackerChecks();
  jumpChecks();
  runwayChecks();
  clockChecks();
  console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("Tracker lab failed:", error);
  process.exitCode = 1;
});
