import {
  buildTaxiNetwork,
  parkingName,
  runwayNameFromFacility,
} from "../../adapters/msfs2024/taxiFacility";
import { Airport } from "../../domain/Airport";
import { Strictness } from "../../domain/ControllerStyle";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { Situation } from "../../domain/Situation";
import { TaxiLeg } from "../../domain/Taxi";
import { TaxiNetwork } from "../../domain/TaxiNetwork";
import { decide } from "../../engine/decide";
import { createEngineState } from "../../engine/engineState";
import { checkTaxiReadback } from "../../engine/taxiReadback";
import { deriveSituation } from "../../situation/deriveSituation";
import {
  distanceToRouteFeet,
  firstCrossingOf,
  holdingShortRunway,
  holdShortPointFor,
  isOnNetwork,
  nearestParking,
  planRoute,
  planRouteFrom,
  sameRunway,
} from "../../taxi/routing";
import { distanceFeet, pointFromRunwayFrame } from "../../utils/geo";
import { labAirport, labTaxiNetwork } from "../airports";
import { positions, RunwayFrameSpec, telemetryAt } from "../benchmark/telemetry";
import { label, msg } from "../engine/helpers";
import { labFacilityData } from "./facilityFixture";

const SETTLE_TICKS = 5;
const TICK_MS = 1000;
const runway23 = labAirport.runways[0];
const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

  if (!ok) {
    failures.push(name);
    if (detail) console.log(`  ${detail}`);
  }
};

const at = (spec: RunwayFrameSpec) =>
  telemetryAt(runway23, labAirport.elevationFeet, spec);

const inFrame = (alongFeet: number, crossFeet: number) =>
  pointFromRunwayFrame(runway23.threshold, runway23.trueHeading, alongFeet, crossFeet);

const spell = (legs: TaxiLeg[] | undefined): string | undefined =>
  legs?.map((leg) => (leg.kind === "taxiway" ? leg.name : `x${leg.runway}`)).join("+");

// A second, crossing runway "13" on the way to Ramp 2, to test crossings
// that are cleared as part of the route.
const crossRunwayNetwork: TaxiNetwork = {
  ...labTaxiNetwork,
  points: [
    ...labTaxiNetwork.points,
    { id: 20, position: inFrame(2800, 700) },
    { id: 21, position: inFrame(2800, 800) },
  ],
  segments: [
    ...labTaxiNetwork.segments.filter((s) => !(s.from === 9 && s.to === 10)),
    { from: 9, to: 20, taxiway: "G" },
    { from: 20, to: 21, crossesRunway: "13" },
    { from: 21, to: 10, taxiway: "G" },
  ],
};

const crossRunwayAirport: Airport = { ...labAirport, taxi: crossRunwayNetwork };

function runRouting(): void {
  const route = (from: number, to: number) => planRoute(labTaxiNetwork, from, to);
  const names = (from: number, to: number) => spell(route(from, to)?.legs);

  check("Ramp 1 to runway 23 goes via C, A, B", names(0, 5) === "C+A+B", names(0, 5));
  check("Ramp 1 to runway 05 goes via C, A, D", names(0, 8) === "C+A+D", names(0, 8));
  check("Unnamed apron paths are not spoken", names(10, 5) === "C+A+B", names(10, 5));
  check("A route to the same point is a single point", route(5, 5)?.pointIds.length === 1);

  const island = {
    ...labTaxiNetwork,
    points: [...labTaxiNetwork.points, { id: 99, position: labTaxiNetwork.points[0].position }],
  };
  check("An unreachable point has no route", planRoute(island, 0, 99) === undefined);

  check(
    "An aircraft far from every taxi segment is not on the network",
    !isOnNetwork(labTaxiNetwork, at(positions.offTheNetwork)),
  );
  check(
    "An aircraft in the middle of a long segment is on the network",
    isOnNetwork(labTaxiNetwork, at(positions.taxiingOnAlpha)),
  );
  check(
    "The hold line of runway 23 is recognised",
    holdingShortRunway(labTaxiNetwork, at(positions.holdingShort)) === "23",
  );
  check(
    "A spot on the taxiway is not a hold line",
    holdingShortRunway(labTaxiNetwork, at(positions.taxiingOnAlpha)) === undefined,
  );
  check(
    "The nearest parking spot is chosen",
    nearestParking(labTaxiNetwork, at(positions.clearOfRunway))?.name === "Ramp 1",
  );

  const onRoute = distanceToRouteFeet(labTaxiNetwork, route(0, 5)!.pointIds, at(positions.taxiingOnAlpha));
  const offRoute = distanceToRouteFeet(labTaxiNetwork, route(0, 5)!.pointIds, at(positions.wrongWayOnAlpha));
  check("A position on the route is within a few feet of it", onRoute < 5, `${onRoute}`);
  check("A position past the route is far from it", offRoute > 1000, `${offRoute}`);

  const midSegment = planRouteFrom(labTaxiNetwork, at(positions.taxiingOnAlpha), 5);
  check(
    "Routing from the middle of a segment can head either way",
    spell(midSegment?.legs) === "A+B",
    spell(midSegment?.legs),
  );
}

function runRunways(): void {
  check("23 and 05 are the same runway", sameRunway("23", "05"));
  check("05L and 23R are the same runway", sameRunway("05L", "23R"));
  check("05L and 23L are not the same runway", !sameRunway("05L", "23L"));
  check("18 and 36 are the same runway", sameRunway("18", "36"));
  check("01 and 19 are the same runway", sameRunway("01", "19"));
  check("23 and 14 are different runways", !sameRunway("23", "14"));

  const toHold = (from: number) => planRoute(labTaxiNetwork, from, 5);

  check("Ramp 1 never crosses a runway on its way to runway 23", firstCrossingOf(labTaxiNetwork, toHold(0)!.pointIds, "23") === undefined);

  const fromRampThree = toHold(14);
  check(
    "Ramp 3 can only reach runway 23 by crossing it",
    spell(fromRampThree?.legs) === "F+E+x23+E+A+B",
    spell(fromRampThree?.legs),
  );

  const crossing = firstCrossingOf(labTaxiNetwork, fromRampThree!.pointIds, "05");
  check(
    "A crossing of runway 23 is found when asked about runway 05",
    crossing?.startIndex === 2 && crossing.endIndex === 3,
    JSON.stringify(crossing),
  );

  check(
    "The hold line nearest the runway's own threshold is the destination",
    holdShortPointFor(labTaxiNetwork, runway23)?.id === 5,
  );
}

const named = (...names: string[]): TaxiLeg[] =>
  names.map((name) => ({ kind: "taxiway", name }));

function runReadbackMatching(): void {
  const cab = named("C", "A", "B");
  const heard = (text: string, legs = cab) =>
    checkTaxiReadback(text, legs, "23", "LV-INQ");
  const summary = (c: ReturnType<typeof heard>) =>
    `hold=${c.holdShortHeard} missing=[${c.missing}] unexpected=[${c.unexpected}]`;

  const full = heard("Taxi to runway 23 via Charlie, Alpha, Bravo, hold short runway 23, LV-INQ.");
  check("A complete readback has nothing missing", full.holdShortHeard && full.missing.length === 0 && full.unexpected.length === 0, summary(full));

  const lacksAlpha = heard("Taxi via Charlie, Bravo, hold short runway 23, LV-INQ.");
  check("A skipped taxiway is reported missing", lacksAlpha.missing.join() === "A" && lacksAlpha.unexpected.length === 0, summary(lacksAlpha));

  check("A readback without hold short is noticed", !heard("Taxi via Charlie, Alpha, Bravo, LV-INQ.").holdShortHeard);
  check("'Holding short' counts as hold short", heard("Holding short runway 23, via Charlie, Alpha, Bravo").holdShortHeard);

  const wrong = heard("Taxi via Charlie, Delta, Bravo, hold short runway 23.");
  check("A taxiway that is not on the route is unexpected", wrong.unexpected.join() === "delta" && wrong.missing.join() === "A", summary(wrong));

  const alfa = heard("Taxi via Charlie, Alfa, Bravo, hold short runway 23.");
  check("Alfa is Alpha", alfa.missing.length === 0 && alfa.unexpected.length === 0, summary(alfa));

  const letters = heard("Taxi via C A B, hold short runway 23.");
  check("Bare letters are accepted for single-letter taxiways", letters.missing.length === 0, summary(letters));

  const numbered = named("A1");
  check("A numbered taxiway is heard as Alpha one or Alpha 1", heard("via Alpha one", numbered).missing.length === 0 && heard("via alpha 1", numbered).missing.length === 0);
  check("Half of a numbered taxiway is missing", heard("via Alpha", numbered).missing.join() === "A1");

  const phoneticCallsign = heard("Taxi via Charlie, Alpha, Bravo, hold short runway 23, Lima Victor India November Quebec");
  check("A phonetic callsign is not taken for a taxiway", phoneticCallsign.unexpected.length === 0, summary(phoneticCallsign));

  check("Taxiways out of order count as missing", heard("via Alpha, Charlie, Bravo, hold short").missing.join() === "A");
  check("Hold short is not required when there is none", checkTaxiReadback("via Charlie, Alpha, Bravo", cab, undefined, "LV-INQ").holdShortHeard);
  check("A taxiway named with a word is matched as a word", checkTaxiReadback("via apron", named("Apron"), undefined, "LV-INQ").missing.length === 0);
}

function runFacilityConversion(): void {
  const network = buildTaxiNetwork(labFacilityData, labAirport.runways);
  const byId = (id: number) => network.points.find((p) => p.id === id)!;

  check(
    "The parking spot that a path leads to is a point; the others are dropped",
    network.parking.length === 1 && network.parking[0].name === "Ramp 1" && network.points.length === 11,
    `${network.parking.length} parking, ${network.points.length} points`,
  );
  check(
    "Closed, vehicle, road, painted-line and invalid paths are not segments",
    network.segments.length === 10,
    `${network.segments.length} segments`,
  );

  const parkingPoint = network.parking[0].pointId;
  const toHold = planRoute(network, parkingPoint, 5);

  check(
    "A route from the parking spot ignores the shortcut paths",
    spell(toHold?.legs) === "C+A+B",
    spell(toHold?.legs),
  );
  check(
    "The parking path does not create a phantom segment to the end of taxiway A",
    !network.segments.some(
      (s) => (s.from === 0 && s.to === 6) || (s.from === 6 && s.to === 0),
    ) && Math.abs((toHold?.lengthFeet ?? 0) - 3_300) < 10,
    `${toHold?.lengthFeet}`,
  );
  check(
    "Positions survive the meters-from-reference conversion",
    distanceFeet(byId(5).position, inFrame(0, 150)) < 1 &&
      distanceFeet(byId(0).position, inFrame(2500, 900)) < 1,
    `${distanceFeet(byId(5).position, inFrame(0, 150))}`,
  );
  check(
    "Hold lines are labeled with the runway end they serve",
    byId(5).holdShortRunway === "23" && byId(7).holdShortRunway === "05",
    `${byId(5).holdShortRunway} ${byId(7).holdShortRunway}`,
  );
  check(
    "An intersection hold line is labeled with a runway too",
    byId(8).holdShortRunway !== undefined && byId(9).holdShortRunway !== undefined,
  );
  check(
    "Ordinary taxi points have no hold label",
    byId(0).holdShortRunway === undefined && byId(2).holdShortRunway === undefined,
  );
  check(
    "A runway path becomes a crossing of that runway",
    network.segments.some((s) => s.from === 8 && s.to === 9 && s.crossesRunway === "23"),
  );
  check(
    "Runway names decode like the facility numbers them",
    runwayNameFromFacility(23, 0) === "23" &&
      runwayNameFromFacility(5, 1) === "05L" &&
      runwayNameFromFacility(36, 2) === "36R" &&
      runwayNameFromFacility(38, 0) === "NE",
  );
  check(
    "Parking names combine name, number and suffix",
    parkingName({ name: "Gate", number: 12, suffix: "A", biasXMeters: 0, biasZMeters: 0 }) === "Gate 12A" &&
      parkingName({ name: "Ramp", number: 3, suffix: "", biasXMeters: 0, biasZMeters: 0 }) === "Ramp 3",
  );

  const converted: Airport = { ...labAirport, taxi: network };
  const located = planRouteFrom(network, at(positions.rampSpot), holdShortPointFor(network, runway23)!.id);

  check(
    "The converted network answers a route request like the hand-built one",
    spell(located?.legs) === "C+A+B" && converted.taxi === network,
    spell(located?.legs),
  );
}

interface Step {
  position: RunwayFrameSpec;
  pilot?: PilotMessage;
  expect: string[];
  ticks?: number;
}

interface Scenario {
  name: string;
  strictness?: Strictness;
  runway?: string;
  airport?: Airport;
  steps: Step[];
}

const A = positions;

const taxiToRunway23 = "taxi_instruction:request:runway 23:C+A+B:hold 23";
const requestFromRamp: Step = {
  position: A.rampSpot,
  pilot: msg("request", "23", "taxi"),
  expect: [taxiToRunway23],
};

const readback = (
  transcript: string,
  expect: string[],
  runway: string | null = "23",
  subject: PilotMessage["subject"] = "taxi",
): Step => ({
  position: A.rampSpot,
  pilot: { ...msg("readback", runway, subject), transcript },
  expect,
});

const COMPLETE = "Taxi to runway 23 via Charlie, Alpha, Bravo, hold short runway 23, LV-INQ.";
const NO_HOLD_SHORT = "Taxi to runway 23 via Charlie, Alpha, Bravo, LV-INQ.";
const NO_ALPHA = "Taxi to runway 23 via Charlie, Bravo, hold short runway 23, LV-INQ.";
const WRONG_TAXIWAY = "Taxi to runway 23 via Charlie, Delta, Bravo, hold short runway 23, LV-INQ.";
const REPEAT_ROUTE = "taxi_instruction:readback_error:runway 23:C+A+B:hold 23";

const scenarios: Scenario[] = [
  {
    name: "Request taxi from the ramp, read it back, taxi, arrive, then line up",
    steps: [
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: [taxiToRunway23] },
      { position: A.rampSpot, pilot: msg("readback", "23", "taxi"), expect: [] },
      { position: A.taxiingOnAlpha, expect: [] },
      { position: A.holdingShort, expect: [] },
      { position: A.holdingShort, pilot: msg("request", "23", "takeoff"), expect: ["issue_clearance:line_up_and_wait"] },
    ],
  },
  {
    name: "Ready for departure from the ramp gets a taxi instruction, not line up",
    steps: [
      { position: A.rampSpot, pilot: msg("request", null, "takeoff"), expect: [taxiToRunway23] },
    ],
  },
  {
    name: "A taxi readback with the wrong runway is corrected",
    steps: [
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: [taxiToRunway23] },
      {
        position: A.rampSpot,
        pilot: msg("readback", "05", "taxi"),
        expect: ["taxi_instruction:readback_error:runway 23:C+A+B:hold 23"],
      },
    ],
  },
  {
    name: "Strict: a complete readback is confirmed",
    strictness: "strict",
    steps: [requestFromRamp, readback(COMPLETE, ["acknowledge:readback_correct"])],
  },
  {
    name: "Strict: a readback without hold short is sent back",
    strictness: "strict",
    steps: [requestFromRamp, readback(NO_HOLD_SHORT, ["query:full_readback"])],
  },
  {
    name: "Strict: a skipped taxiway is sent back",
    strictness: "strict",
    steps: [requestFromRamp, readback(NO_ALPHA, ["query:full_readback"])],
  },
  {
    name: "Strict: a wrong taxiway is corrected with the route",
    strictness: "strict",
    steps: [requestFromRamp, readback(WRONG_TAXIWAY, [REPEAT_ROUTE])],
  },
  {
    name: "Normal: a skipped taxiway is accepted",
    steps: [requestFromRamp, readback(NO_ALPHA, [])],
  },
  {
    name: "Normal: a readback without hold short is sent back",
    steps: [requestFromRamp, readback(NO_HOLD_SHORT, ["query:full_readback"])],
  },
  {
    name: "Normal: a bare roger to a taxi instruction is not enough",
    steps: [requestFromRamp, readback("Roger, LV-INQ.", ["query:full_readback"], null, "other")],
  },
  {
    name: "Normal: a wrong taxiway is corrected with the route",
    steps: [requestFromRamp, readback(WRONG_TAXIWAY, [REPEAT_ROUTE])],
  },
  {
    name: "Relaxed: a sloppy readback is accepted",
    strictness: "relaxed",
    steps: [requestFromRamp, readback("Roger, LV-INQ.", [], null, "other")],
  },
  {
    name: "Relaxed: even a wrong taxiway is left for the progress check",
    strictness: "relaxed",
    steps: [requestFromRamp, readback(WRONG_TAXIWAY, [])],
  },
  {
    name: "Relaxed: a wrong runway is still corrected",
    strictness: "relaxed",
    steps: [
      requestFromRamp,
      readback("Taxi to runway 05 via Charlie, Alpha, Bravo, hold short runway 05, LV-INQ.", [REPEAT_ROUTE], "05"),
    ],
  },
  {
    name: "Without a transcript the readback is judged on its labels only",
    strictness: "strict",
    steps: [
      requestFromRamp,
      { position: A.rampSpot, pilot: msg("readback", "23", "taxi"), expect: ["acknowledge:readback_correct"] },
    ],
  },
  {
    name: "Relaxed: a taxi call after the instruction that asks for nothing is its readback",
    strictness: "relaxed",
    steps: [
      requestFromRamp,
      {
        position: A.rampSpot,
        pilot: { ...msg("request", "23", "taxi"), transcript: "Taxi to runway 23, LV-INQ." },
        expect: [],
      },
    ],
  },
  {
    name: "Normal: that same call is a readback without hold short, so it is sent back",
    steps: [
      requestFromRamp,
      {
        position: A.rampSpot,
        pilot: { ...msg("request", "23", "taxi"), transcript: "Taxi to runway 23, LV-INQ." },
        expect: ["query:full_readback"],
      },
    ],
  },
  {
    name: "A taxi call that does ask for taxi is still a request",
    steps: [
      requestFromRamp,
      {
        position: A.rampSpot,
        pilot: { ...msg("request", "23", "taxi"), transcript: "Ground, request taxi to runway 23, LV-INQ." },
        expect: ["taxi_instruction:repeat:runway 23:C+A+B:hold 23"],
      },
    ],
  },
  {
    name: "The route is repeated on request",
    steps: [
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: [taxiToRunway23] },
      { position: A.rampSpot, pilot: msg("question", null, "taxi"), expect: ["taxi_instruction:repeat:runway 23:C+A+B:hold 23"] },
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: ["taxi_instruction:repeat:runway 23:C+A+B:hold 23"] },
    ],
  },
  {
    name: "A question about the route with no instruction is declined",
    steps: [
      { position: A.rampSpot, pilot: msg("question", null, "taxi"), expect: ["unable:no_information"] },
    ],
  },
  {
    name: "A wrong turn is corrected once, then left alone",
    steps: [
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: [taxiToRunway23] },
      { position: A.wrongWayOnAlpha, expect: ["taxi_instruction:off_route:runway 23:A+B:hold 23"] },
      { position: A.wrongWayOnAlpha, expect: [] },
    ],
  },
  {
    name: "The active runway decides the route",
    runway: "05",
    steps: [
      { position: A.rampSpot, pilot: msg("request", null, "taxi"), expect: ["taxi_instruction:request:runway 05:C+A+D:hold 05"] },
    ],
  },
  {
    name: "Holding short of the wrong runway is sent to the active one",
    steps: [
      { position: A.holdingShortFarEnd, pilot: msg("request", null, "takeoff"), expect: ["taxi_instruction:request:runway 23:D+A+B:hold 23"] },
    ],
  },
  {
    name: "Entering a runway without clearance is stopped",
    steps: [
      { position: A.crossingRunway, expect: ["instruct:hold_position"] },
      { position: A.crossingRunway, expect: [] },
    ],
  },
  {
    name: "Taxi to parking after vacating the runway",
    steps: [
      { position: A.clearOfRunway, pilot: msg("request", null, "parking"), expect: ["taxi_instruction:request:Ramp 1:C"] },
    ],
  },
  {
    name: "Away from the taxi network the old behavior remains",
    steps: [
      { position: A.offTheNetwork, pilot: msg("request", null, "takeoff"), expect: ["issue_clearance:line_up_and_wait"] },
    ],
  },
  {
    name: "A taxi request in the air is not answered with a route",
    steps: [
      { position: A.upwind, pilot: msg("request", null, "taxi"), expect: ["query:say_again"] },
    ],
  },
  {
    name: "The active runway is crossed only after holding short and being cleared",
    steps: [
      {
        position: A.rampThree,
        pilot: msg("request", null, "taxi"),
        expect: ["taxi_instruction:request:runway 23:F+E:hold 23"],
      },
      { position: A.holdingShortLeftOfRunway, expect: ["taxi_instruction:continue:runway 23:E+A+B:hold 23:cross 23"] },
      { position: A.middleOfTheRunway, expect: [] },
      { position: A.holdingShortRightOfRunway, expect: [] },
      { position: A.holdingShort, expect: [] },
      { position: A.holdingShort, pilot: msg("request", null, "takeoff"), expect: ["issue_clearance:line_up_and_wait"] },
    ],
  },
  {
    name: "Waiting at the hold line does not repeat the crossing clearance",
    steps: [
      {
        position: A.rampThree,
        pilot: msg("request", null, "taxi"),
        expect: ["taxi_instruction:request:runway 23:F+E:hold 23"],
      },
      { position: A.holdingShortLeftOfRunway, expect: ["taxi_instruction:continue:runway 23:E+A+B:hold 23:cross 23"] },
      { position: A.holdingShortLeftOfRunway, expect: [] },
    ],
  },
  {
    name: "Entering the active runway at the crossing without being cleared is stopped",
    steps: [
      {
        position: A.rampThree,
        pilot: msg("request", null, "taxi"),
        expect: ["taxi_instruction:request:runway 23:F+E:hold 23"],
      },
      { position: A.middleOfTheRunway, expect: ["instruct:hold_position"] },
    ],
  },
  {
    name: "A crossing of another runway is cleared as part of the route",
    airport: crossRunwayAirport,
    steps: [
      {
        position: { ...A.rampSpot, alongFeet: 2800, crossFeet: 600 },
        pilot: msg("request", null, "parking"),
        expect: ["taxi_instruction:request:Ramp 2:G+x13+G"],
      },
    ],
  },
];

function runScenarios(): void {
  for (const scenario of scenarios) {
    const airport = scenario.airport ?? labAirport;
    let engine = createEngineState(scenario.runway ?? "23");
    let situation: Situation | undefined;
    let nowMs = 0;
    const stepFailures: string[] = [];

    const tick = (position: RunwayFrameSpec, pilot?: PilotMessage): string[] => {
      nowMs += TICK_MS;
      const aircraft = at(position);
      const derived = deriveSituation(
        { aircraft, airport, runway: engine.runway, observedAtMs: nowMs },
        situation,
      );
      situation = derived.situation;

      const decision = decide(
        {
          aircraft,
          airport,
          situation,
          style: { strictness: scenario.strictness ?? "normal" },
          callsign: "LV-INQ",
          events: derived.events,
          pilot: pilot ? { status: "heard", message: pilot } : { status: "none" },
        },
        engine,
      );
      engine = decision.state;

      return decision.intents.map(label);
    };

    scenario.steps.forEach((step, index) => {
      const actual: string[] = [];

      for (let i = 0; i < (step.ticks ?? SETTLE_TICKS); i++) {
        actual.push(...tick(step.position));
      }

      if (step.pilot) {
        actual.push(...tick(step.position, step.pilot));
      }

      if (actual.join(",") !== step.expect.join(",")) {
        stepFailures.push(
          `step ${index + 1} [${situation?.phase ?? "?"}]: expected [${step.expect.join(", ")}], got [${actual.join(", ")}]`,
        );
      }
    });

    check(scenario.name, stepFailures.length === 0, stepFailures.join("\n  "));
  }
}

runRouting();
runRunways();
runReadbackMatching();
runFacilityConversion();
runScenarios();

check(
  "The hold-short phase exists in the model",
  FlightPhase.HoldingShort === "holding_short",
);

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
