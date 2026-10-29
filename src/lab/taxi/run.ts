import { createEngineState } from "../../engine/engineState";
import { decide } from "../../engine/decide";
import { FlightPhase } from "../../domain/FlightPhase";
import { PilotMessage } from "../../domain/PilotMessage";
import { Situation } from "../../domain/Situation";
import { deriveSituation } from "../../situation/deriveSituation";
import {
  distanceToRouteFeet,
  holdingShortRunway,
  nearestParking,
  nearestPoint,
  planRoute,
} from "../../taxi/routing";
import { labAirport, labTaxiNetwork } from "../airports";
import { positions, RunwayFrameSpec, telemetryAt } from "../benchmark/telemetry";
import { label, msg } from "../engine/helpers";

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

function runRouting(): void {
  const route = (from: number, to: number) => planRoute(labTaxiNetwork, from, to);
  const names = (from: number, to: number) => route(from, to)?.taxiways.join("+");

  check("Ramp 1 to runway 23 goes via C, A, B", names(0, 5) === "C+A+B", names(0, 5));
  check("Ramp 1 to runway 05 goes via C, A, D", names(0, 8) === "C+A+D", names(0, 8));
  check("Unnamed apron paths are not spoken", names(10, 5) === "C+A+B", names(10, 5));
  check("A route to the same point is a single point", route(5, 5)?.pointIds.length === 1);

  const island = {
    ...labTaxiNetwork,
    points: [...labTaxiNetwork.points, { id: 99, position: labTaxiNetwork.points[0].position }],
  };
  check("An unreachable point has no route", planRoute(island, 0, 99) === undefined);

  const center = labAirport.position;
  check(
    "An aircraft far from every taxi point is not on the network",
    nearestPoint(labTaxiNetwork, center) === undefined,
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
}

interface Step {
  position: RunwayFrameSpec;
  pilot?: PilotMessage;
  expect: string[];
  ticks?: number;
}

interface Scenario {
  name: string;
  runway?: string;
  steps: Step[];
}

const A = positions;

const taxiToRunway23 = "taxi_instruction:request:runway 23:C+A+B";

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
        expect: ["taxi_instruction:readback_error:runway 23:C+A+B"],
      },
    ],
  },
  {
    name: "The route is repeated on request",
    steps: [
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: [taxiToRunway23] },
      { position: A.rampSpot, pilot: msg("question", null, "taxi"), expect: ["taxi_instruction:repeat:runway 23:C+A+B"] },
      { position: A.rampSpot, pilot: msg("request", "23", "taxi"), expect: ["taxi_instruction:repeat:runway 23:C+A+B"] },
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
      { position: A.wrongWayOnAlpha, expect: ["taxi_instruction:off_route:runway 23:A+B"] },
      { position: A.wrongWayOnAlpha, expect: [] },
    ],
  },
  {
    name: "The active runway decides the route",
    runway: "05",
    steps: [
      { position: A.rampSpot, pilot: msg("request", null, "taxi"), expect: ["taxi_instruction:request:runway 05:C+A+D"] },
    ],
  },
  {
    name: "Holding short of the wrong runway is sent to the active one",
    steps: [
      { position: A.holdingShortFarEnd, pilot: msg("request", null, "takeoff"), expect: ["taxi_instruction:request:runway 23:D+A+B"] },
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
];

function runScenarios(): void {
  for (const scenario of scenarios) {
    let engine = createEngineState(scenario.runway ?? "23");
    let situation: Situation | undefined;
    let nowMs = 0;
    const stepFailures: string[] = [];

    const tick = (position: RunwayFrameSpec, pilot?: PilotMessage): string[] => {
      nowMs += TICK_MS;
      const aircraft = at(position);
      const derived = deriveSituation(
        { aircraft, airport: labAirport, runway: engine.runway, observedAtMs: nowMs },
        situation,
      );
      situation = derived.situation;

      const decision = decide(
        {
          aircraft,
          airport: labAirport,
          situation,
          style: { strictness: "normal" },
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
runScenarios();

check(
  "The hold-short phase exists in the model",
  FlightPhase.HoldingShort === "holding_short",
);

console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
