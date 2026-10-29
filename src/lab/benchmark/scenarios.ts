import { BenchmarkExpectations, BenchmarkScenario, BenchmarkStep } from "./benchmarkTypes";
import { knownPilot } from "./records";
import { positions } from "./telemetry";

/*
 * ---------------------------------------------------------------------------
 * Scenario data for the end-to-end benchmark (classifier -> engine -> speech)
 * ---------------------------------------------------------------------------
 *
 * Telemetry is derived from runway-relative positions, so every scenario is
 * geometrically consistent. A fact the expectation depends on (a clearance
 * already issued, a report already requested) is established by earlier steps
 * of the same scenario, not assumed.
 *
 * Remarks (welcome back, landing comments) are improvised by the model, so
 * the memory scenarios only check the operational part of the reply and what
 * must not appear. Whether a remark was attached shows in the report's
 * Decision column; read the wording yourself.
 *
 * Origins: "ported" keeps the original single-call benchmark's expectation,
 * "adapted" keeps its intent but follows the engine's design (a requested
 * report gets the next instruction; an unrequested one gets silence), and
 * "new" covers behavior the single-call benchmark could not test.
 */

const silent: BenchmarkExpectations = { responseRequired: false };

const requestFromTheHold: BenchmarkStep = {
  position: positions.holdingShort,
  pilot: "Tower, holding short runway 23, ready for departure, LV-INQ.",
};

const clearedForTakeoff: BenchmarkStep = {
  position: positions.linedUp,
  pilot: "Tower, lined up runway 23, ready for departure, LV-INQ.",
};

const airborne: BenchmarkStep = {
  position: positions.upwind,
  pilot: "Tower, airborne, initial climb, LV-INQ.",
};

const clearedToLand: BenchmarkStep = {
  position: positions.final,
  pilot: "Tower, final runway 23, LV-INQ.",
};

const enterPattern: BenchmarkStep = {
  position: positions.inboundFromSouth,
  pilot: "Tower, five miles south, request pattern entry runway 23, LV-INQ.",
};

const withExpectation = (
  step: BenchmarkStep,
  expect: BenchmarkExpectations,
): BenchmarkStep => ({ ...step, expect });

export const scenarios: BenchmarkScenario[] = [
  /* ===================================================================== */
  /* DEPARTURE                                                             */
  /* ===================================================================== */

  {
    name: "Ready for departure at the hold",
    section: "Departure",
    origin: "adapted",
    steps: [
      withExpectation(requestFromTheHold, {
        responseRequired: true,
        requiredConcepts: ["line up and wait", "23"],
        forbiddenPatterns: ["cleared for takeoff"],
      }),
    ],
  },
  {
    name: "Lined up and requesting takeoff clearance",
    section: "Departure",
    origin: "ported",
    steps: [
      withExpectation(clearedForTakeoff, {
        responseRequired: true,
        requiredConcepts: ["cleared for takeoff", "23"],
        forbiddenPatterns: ["taxi to", "hold short"],
      }),
    ],
  },
  {
    name: "Takeoff clearance follows line up and wait on its own",
    section: "Departure",
    origin: "new",
    steps: [
      requestFromTheHold,
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
    ],
  },
  {
    name: "Pilot asks for a runway that is not active",
    section: "Departure",
    origin: "new",
    steps: [
      {
        position: positions.linedUp,
        pilot: "Tower, lined up runway 05, ready for departure, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["cleared for takeoff", "23"],
          forbiddenPatterns: ["05"],
        },
      },
    ],
  },
  {
    name: "A repeated request does not repeat the clearance",
    section: "Departure",
    origin: "new",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Tower, lined up runway 23, ready for departure, LV-INQ.",
        expect: silent,
      },
    ],
  },

  /* ===================================================================== */
  /* READBACKS                                                             */
  /* ===================================================================== */

  {
    name: "Correct takeoff readback",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Cleared for takeoff runway 23, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Paraphrased takeoff readback",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Roger, we're cleared for takeoff on runway 23, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Wilco takeoff readback",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Wilco, cleared for takeoff runway 23, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Incorrect runway readback",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedForTakeoff,
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
    name: "Readback of the wrong clearance",
    section: "Readbacks",
    origin: "new",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Cleared to land runway 23, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["negative", "cleared for takeoff", "23"],
        },
      },
    ],
  },
  {
    name: "Readback without the runway is accepted",
    section: "Readbacks",
    origin: "new",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Cleared for takeoff, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Correct landing clearance readback",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedToLand,
      {
        position: positions.final,
        pilot: "Cleared to land runway 23, LV-INQ.",
        expect: silent,
      },
    ],
  },
  {
    name: "Readback should not trigger duplicate clearance",
    section: "Readbacks",
    origin: "ported",
    steps: [
      clearedForTakeoff,
      {
        position: positions.linedUp,
        pilot: "Cleared for takeoff runway 23, LV-INQ.",
        expect: { responseRequired: false, forbiddenPatterns: ["cleared for takeoff"] },
      },
    ],
  },

  /* ===================================================================== */
  /* TRAFFIC PATTERN                                                       */
  /* ===================================================================== */

  {
    name: "Initial climb instruction",
    section: "Traffic pattern",
    origin: "adapted",
    steps: [
      clearedForTakeoff,
      withExpectation(airborne, {
        responseRequired: true,
        requiredConcepts: ["report downwind"],
        forbiddenPatterns: ["cleared to land"],
      }),
    ],
  },
  {
    name: "Already climbing, do not repeat takeoff clearance",
    section: "Traffic pattern",
    origin: "ported",
    steps: [
      clearedForTakeoff,
      airborne,
      {
        position: positions.upwind,
        pilot: "Currently climbing through 700 feet, LV-INQ.",
        expect: { responseRequired: false, forbiddenPatterns: ["cleared for takeoff", "takeoff"] },
      },
    ],
  },
  {
    name: "Crosswind position report",
    section: "Traffic pattern",
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
    name: "Report downwind when no action is required",
    section: "Traffic pattern",
    origin: "ported",
    steps: [
      { position: positions.downwind, pilot: "Tower, downwind, LV-INQ.", expect: silent },
    ],
  },
  {
    name: "Position report should not become a clearance request",
    section: "Traffic pattern",
    origin: "ported",
    steps: [
      {
        position: positions.downwind,
        pilot: "Tower, currently downwind runway 23, LV-INQ.",
        expect: { responseRequired: false, forbiddenPatterns: ["cleared for takeoff", "cleared to land"] },
      },
    ],
  },
  {
    name: "Downwind position report",
    section: "Traffic pattern",
    origin: "adapted",
    steps: [
      enterPattern,
      {
        position: positions.downwind,
        pilot: "Tower, downwind, LV-INQ.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["report base"],
          forbiddenPatterns: ["cleared for takeoff", "cleared to land"],
        },
      },
    ],
  },
  {
    name: "Completed instruction should not be repeated",
    section: "Traffic pattern",
    origin: "adapted",
    steps: [
      clearedForTakeoff,
      airborne,
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
    name: "Pattern progression from entry to landing clearance",
    section: "Traffic pattern",
    origin: "new",
    steps: [
      withExpectation(enterPattern, {
        responseRequired: true,
        requiredConcepts: ["23", "report downwind"],
      }),
      {
        position: positions.downwind,
        pilot: "Tower, downwind runway 23, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["report base"] },
      },
      {
        position: positions.base,
        pilot: "Tower, base runway 23, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["report final"] },
      },
      {
        position: positions.final,
        pilot: "Tower, final runway 23, full stop, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["cleared to land", "23"] },
      },
    ],
  },
  {
    name: "Pilot report contradicting telemetry is queried",
    section: "Traffic pattern",
    origin: "new",
    steps: [
      {
        position: positions.base,
        pilot: "Tower, downwind runway 23, LV-INQ.",
        expect: { responseRequired: true, requiredConcepts: ["confirm downwind", "base"] },
      },
    ],
  },

  /* ===================================================================== */
  /* ARRIVAL                                                               */
  /* ===================================================================== */

  {
    name: "Request traffic pattern entry",
    section: "Arrival",
    origin: "ported",
    steps: [
      withExpectation(enterPattern, {
        responseRequired: true,
        requiredConcepts: ["23"],
        forbiddenPatterns: ["cleared to land"],
      }),
    ],
  },
  {
    name: "Final with runway available",
    section: "Arrival",
    origin: "ported",
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
    section: "Arrival",
    origin: "ported",
    steps: [
      clearedToLand,
      {
        position: positions.shortFinal,
        pilot: "Tower, short final, LV-INQ.",
        expect: { responseRequired: false, forbiddenPatterns: ["cleared to land"] },
      },
    ],
  },
  {
    name: "Go-around",
    section: "Arrival",
    origin: "adapted",
    steps: [
      clearedToLand,
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
    name: "Vacate the runway after landing",
    section: "Arrival",
    origin: "new",
    steps: [
      clearedToLand,
      { position: positions.smoothFlare },
      {
        position: positions.landingRoll,
        expect: {
          responseRequired: true,
          requiredConcepts: ["vacate", "23"],
          forbiddenPatterns: ["feet per minute"],
        },
      },
    ],
  },

  /* ===================================================================== */
  /* QUESTIONS                                                             */
  /* ===================================================================== */

  {
    name: "Pilot asks current heading",
    section: "Questions",
    origin: "ported",
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
    section: "Questions",
    origin: "ported",
    steps: [
      {
        position: positions.upwind,
        pilot: "Tower, confirm we're airborne.",
        expect: { responseRequired: true, requiredConcepts: ["airborne"] },
      },
    ],
  },
  {
    name: "Pilot asks for the wind",
    section: "Questions",
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

  /* ===================================================================== */
  /* EMERGENCY                                                             */
  /* ===================================================================== */

  {
    name: "Emergency declaration takes priority",
    section: "Emergency",
    origin: "adapted",
    steps: [
      {
        position: positions.upwind,
        pilot: "MAYDAY MAYDAY MAYDAY, LV-INQ, engine failure, 700 feet.",
        expect: {
          responseRequired: true,
          requiredConcepts: ["mayday", "engine failure", "intentions"],
          forbiddenPatterns: [
            "nature of",
            "report downwind",
            "report base",
            "report final",
            "cleared for takeoff",
          ],
        },
      },
    ],
  },
  {
    name: "Emergency details are remembered and the rest asked when it fits",
    section: "Emergency",
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

  /* ===================================================================== */
  /* MEMORY                                                                */
  /* ===================================================================== */

  {
    name: "A returning regular is recognized",
    section: "Memory",
    origin: "new",
    record: knownPilot({ visits: 7 }),
    steps: [
      withExpectation(enterPattern, {
        responseRequired: true,
        requiredConcepts: ["23", "report downwind"],
      }),
    ],
  },
  {
    name: "A firm previous landing is mentioned",
    section: "Memory",
    origin: "new",
    record: knownPilot({ visits: 3, lastLandingFpm: -780 }),
    steps: [
      withExpectation(enterPattern, {
        responseRequired: true,
        requiredConcepts: ["23", "report downwind"],
        forbiddenPatterns: ["780", "feet per minute", "fpm"],
      }),
    ],
  },
  {
    name: "A smooth landing is complimented",
    section: "Memory",
    origin: "new",
    steps: [
      clearedToLand,
      { position: positions.smoothFlare },
      {
        position: positions.landingRoll,
        expect: {
          responseRequired: true,
          requiredConcepts: ["vacate", "23"],
          forbiddenPatterns: ["feet per minute", "fpm", "90"],
        },
      },
    ],
  },
  {
    name: "A busy field means no small talk, even for a known pilot",
    section: "Memory",
    origin: "new",
    record: knownPilot({ visits: 3 }),
    trafficCount: 8,
    steps: [
      withExpectation(enterPattern, {
        responseRequired: true,
        requiredConcepts: ["23"],
        forbiddenPatterns: [
          "welcome back",
          "you again",
          "back again",
          "old friend",
          "nice to see",
          "landing gear",
          "gently",
        ],
      }),
    ],
  },
];
