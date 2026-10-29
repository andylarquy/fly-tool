import { BenchmarkExpectations } from "../benchmark/benchmarkTypes";
import { positions, RunwayFrameSpec } from "./telemetry";

export interface PipelineStep {
  position: RunwayFrameSpec;
  pilot?: string;
  expect?: BenchmarkExpectations;
}

export interface PipelineScenario {
  name: string;
  origin: "benchmark" | "adapted" | "new";
  steps: PipelineStep[];
}

const silent: BenchmarkExpectations = { responseRequired: false };

const takeoffFlow: PipelineStep[] = [
  { position: positions.linedUp, pilot: "Tower, lined up runway 23, ready for departure, LV-INQ." },
];

export const pipelineScenarios: PipelineScenario[] = [
  {
    name: "Departure: line up and wait, then proactive takeoff clearance",
    origin: "new",
    steps: [
      {
        position: positions.holdingShort,
        pilot: "Tower, holding short runway 23, ready for departure, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["line up and wait", "23"],
          forbiddenPatterns: ["cleared for takeoff"],
        },
      },
      {
        position: positions.holdingShort,
        pilot: "Line up and wait runway 23, LV-INQ.",
        expect: silent,
      },
      {
        position: positions.linedUp,
        expect: {
          responseRequired: true,
          requiredConcepts: ["cleared for takeoff", "23"],
        },
      },
      {
        position: positions.linedUp,
        pilot: "Cleared for takeoff runway 23, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Report downwind when no action is required",
    origin: "benchmark",
    steps: [
      { position: positions.downwind, pilot: "Tower, downwind, LV-INQ.", expect: silent },
    ],
  },
  {
    name: "Position report should not become a clearance request",
    origin: "benchmark",
    steps: [
      {
        position: positions.downwind,
        pilot: "Tower, currently downwind runway 23, LV-INQ.",
        expect: { responseRequired: false, forbiddenPatterns: ["cleared for takeoff", "cleared to land"] },
      },
    ],
  },
  {
    name: "Completed instruction should not be repeated",
    origin: "adapted",
    steps: [
      ...takeoffFlow,
      {
        position: positions.upwind,
        pilot: "Tower, airborne, initial climb, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["report downwind"] },
      },
      {
        position: positions.downwind,
        pilot: "Downwind at 1000 feet, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["report base"],
          forbiddenPatterns: ["climb and maintain", "climb to"],
        },
      },
    ],
  },
  {
    name: "Crosswind position report",
    origin: "adapted",
    steps: [
      {
        position: positions.crosswind,
        pilot: "Tower, turning crosswind, LV-INQ.",
        expect: {
          responseRequired: false,
          forbiddenPatterns: ["cleared for takeoff", "cleared to land"],
        },
      },
    ],
  },
  {
    name: "Final with runway available",
    origin: "benchmark",
    steps: [
      {
        position: positions.final,
        pilot: "Tower, final runway 23, full stop, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["cleared to land", "23"],
          forbiddenPatterns: ["cleared for takeoff"],
        },
      },
    ],
  },
  {
    name: "Already cleared to land on short final",
    origin: "benchmark",
    steps: [
      { position: positions.final, pilot: "Tower, final runway 23, LV-INQ." },
      { position: positions.shortFinal, pilot: "Tower, short final, LV-INQ.", expect: silent },
    ],
  },
  {
    name: "Incorrect runway readback",
    origin: "benchmark",
    steps: [
      ...takeoffFlow,
      {
        position: positions.linedUp,
        pilot: "Cleared for takeoff runway 05, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["23"],
          forbiddenPatterns: ["runway 05"],
        },
      },
    ],
  },
  {
    name: "Go-around",
    origin: "benchmark",
    steps: [
      { position: positions.final, pilot: "Tower, final runway 23, LV-INQ." },
      {
        position: positions.final,
        pilot: "Tower, going around, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["go around"],
          forbiddenPatterns: ["cleared to land"],
        },
      },
    ],
  },
  {
    name: "Pilot asks current heading",
    origin: "benchmark",
    steps: [
      {
        position: positions.upwind,
        pilot: "Tower, what is my current heading?",
        expect: { responseRequired: true, requiredConcepts: ["224"] },
      },
    ],
  },
  {
    name: "Pilot asks whether airborne",
    origin: "benchmark",
    steps: [
      {
        position: positions.upwind,
        pilot: "Tower, confirm we're airborne.",
        expect: { responseRequired: true, requiredConcepts: ["airborne"] },
      },
    ],
  },
  {
    name: "Request traffic pattern entry",
    origin: "benchmark",
    steps: [
      {
        position: positions.inboundFromSouth,
        pilot: "Tower, five miles south, request pattern entry runway 23, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["23"],
          forbiddenPatterns: ["cleared to land"],
        },
      },
    ],
  },
  {
    name: "Emergency declaration takes priority",
    origin: "adapted",
    steps: [
      {
        position: positions.upwind,
        pilot: "MAYDAY MAYDAY MAYDAY, LV-INQ, engine failure, 700 feet.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["mayday", "engine failure", "intentions"],
          forbiddenPatterns: ["nature of", "report downwind", "report base", "report final", "cleared for takeoff"],
        },
      },
    ],
  },
  {
    name: "Emergency: details are remembered and the rest is asked when it fits",
    origin: "new",
    steps: [
      {
        position: positions.upwind,
        pilot: "MAYDAY MAYDAY MAYDAY, LV-INQ, engine failure, 700 feet.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["engine failure", "intentions"],
          forbiddenPatterns: ["nature of", "souls", "fuel"],
        },
      },
      {
        position: positions.upwind,
        pilot: "Returning to the field, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["mayday"],
          forbiddenPatterns: ["say", "intentions", "nature of", "souls", "fuel"],
        },
      },
      {
        position: positions.downwind,
        pilot: "Three souls on board, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["fuel"],
          forbiddenPatterns: ["souls on board", "intentions", "nature of"],
        },
      },
      {
        position: positions.base,
        pilot: "Forty minutes of fuel, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["cleared to land", "23"],
          forbiddenPatterns: ["say", "intentions"],
        },
      },
    ],
  },
  {
    name: "Pilot report contradicting telemetry is queried",
    origin: "new",
    steps: [
      {
        position: positions.base,
        pilot: "Tower, downwind runway 23, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["confirm downwind", "base"] },
      },
    ],
  },
  {
    name: "Pilot asks for the wind",
    origin: "new",
    steps: [
      {
        position: positions.downwind,
        pilot: "Tower, can you say the wind?",
        expect: {
          responseRequired: true,
          requiredConcepts: ["unable"],
          forbiddenPatterns: ["knots", "degrees"],
        },
      },
    ],
  },
];
