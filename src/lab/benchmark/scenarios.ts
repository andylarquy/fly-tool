import { AircraftState } from "../../domain/AircraftState";
import { BenchmarkScenario, ConversationTurn } from "./benchmarkTypes";

/*
 * ---------------------------------------------------------------------------
 * Shared aircraft states
 * ---------------------------------------------------------------------------
 *
 * These are deliberately simple and internally consistent.
 *
 * The benchmark is testing ATC reasoning, not navigation/geometric accuracy,
 * so we don't need dozens of unique telemetry samples yet.
 */

const holdingShort: AircraftState = {
  latitude: -34.450169564238806,
  longitude: -58.585754419918246,
  altitudeFeet: 13,
  trueHeading: 224,
  groundSpeed: 0,
  pitch: -0.13830090636339298,
  bank: -0.16137975025545245,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: true,
};

const linedUp: AircraftState = {
  latitude: -34.450169564238806,
  longitude: -58.585754419918246,
  altitudeFeet: 13,
  trueHeading: 224,
  groundSpeed: 0,
  pitch: -0.13830090636339298,
  bank: -0.16137975025545245,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: true,
};

const initialClimb: AircraftState = {
  latitude: -34.466053600241985,
  longitude: -58.60380201309368,
  altitudeFeet: 694,
  trueHeading: 223,
  groundSpeed: 60,
  pitch: -7.184934695847636,
  bank: 1.4493565442989484,
  verticalSpeedFeetPerMinute: 789,
  isOnGround: false,
};

const downwind: AircraftState = {
  latitude: -34.44601906163748,
  longitude: -58.56284715153178,
  altitudeFeet: 1056,
  trueHeading: 323,
  groundSpeed: 75,
  pitch: 1.1911054611925342,
  bank: -1.367722324568578,
  verticalSpeedFeetPerMinute: -98,
  isOnGround: false,
};

/*
 * ---------------------------------------------------------------------------
 * Shared situation contexts
 * ---------------------------------------------------------------------------
 */

const takeoffContext = `
Active runway is 23.
Aircraft is operating in the left-hand traffic pattern for runway 23.
Aircraft is holding short of runway 23 and is ready for departure.
`.trim();

const linedUpContext = `
Active runway is 23.
Aircraft is operating in the left-hand traffic pattern for runway 23.
Aircraft is lined up on runway 23 and is awaiting takeoff clearance.
`.trim();

const initialClimbContext = `
Active runway is 23.
Aircraft is operating in the left-hand traffic pattern for runway 23.
Aircraft has departed runway 23 and is currently climbing.
`.trim();

const downwindContext = `
Active runway is 23.
Aircraft is operating in the left-hand traffic pattern for runway 23.
Aircraft is currently on the downwind leg.
`.trim();

/*
 * ---------------------------------------------------------------------------
 * Shared conversation histories
 * ---------------------------------------------------------------------------
 *
 * These are used only when the scenario genuinely depends on something
 * previously said by ATC.
 */

const takeoffClearanceIssued: ConversationTurn[] = [
  {
    pilot: "Tower, holding short runway 23, ready for departure, LV-INQ.",
    atc: "LV-INQ, cleared for takeoff runway 23.",
  },
];

const landingClearanceIssued: ConversationTurn[] = [
  {
    pilot: "Tower, final runway 23,  LV-INQ.",
    atc: "LV-INQ, cleared to land runway 23.",
  },
];

const climbInstructionIssued: ConversationTurn[] = [
  {
    pilot: "Tower, airborne, initial climb, LV-INQ.",
    atc: "LV-INQ, maintain runway heading, climb and maintain 1000 feet, report downwind.",
  },
];

/*
 * ---------------------------------------------------------------------------
 * Benchmark scenarios
 * ---------------------------------------------------------------------------
 */

export const scenarios: BenchmarkScenario[] = [
  /*
   * ========================================================================
   * BASIC REQUESTS
   * ========================================================================
   */

  {
    name: "Request takeoff clearance",

    aircraftState: holdingShort,

    atcState: {
      situationContext: takeoffContext,
    },

    pilotTransmission:
      "Tower, holding short runway 23, ready for departure,  LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23"],
      forbiddenPatterns: ["cleared to land"],
    },
  },

  {
    name: "Lined up and requesting takeoff clearance",

    aircraftState: linedUp,

    atcState: {
      situationContext: linedUpContext,
    },

    pilotTransmission:
      "Tower, lined up runway 23, ready for departure, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23"],
      forbiddenPatterns: ["taxi to", "hold short"],
    },
  },

  {
    name: "Request traffic pattern entry",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is approaching the airport from the south.
        Aircraft is not yet established in the traffic pattern.
        Standard traffic pattern is left-hand.
        Pattern altitude is 1000 feet.
      `.trim(),
    },

    pilotTransmission:
      "Tower, five miles south, request pattern entry runway 23, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["23"],
      forbiddenPatterns: ["cleared to land"],
    },
  },

  /*
   * ========================================================================
   * READBACKS
   * ========================================================================
   */

  {
    name: "Correct takeoff readback",

    aircraftState: holdingShort,

    atcState: {
      situationContext: takeoffContext,
    },

    initialConversation: takeoffClearanceIssued,

    pilotTransmission: "Cleared for takeoff runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  {
    name: "Paraphrased takeoff readback",

    aircraftState: holdingShort,

    atcState: {
      situationContext: takeoffContext,
    },

    initialConversation: takeoffClearanceIssued,

    pilotTransmission: "Roger, we're cleared for takeoff on runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  {
    name: "Wilco takeoff readback",

    aircraftState: holdingShort,

    atcState: {
      situationContext: takeoffContext,
    },

    initialConversation: takeoffClearanceIssued,

    pilotTransmission: "Wilco, cleared for takeoff runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  {
    name: "Incorrect runway readback",

    aircraftState: holdingShort,

    atcState: {
      situationContext: takeoffContext,
    },

    initialConversation: takeoffClearanceIssued,

    pilotTransmission: "Cleared for takeoff runway 05, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["23"],
      forbiddenPatterns: ["runway 05", "hold short"],
    },
  },

  {
    name: "Correct landing clearance readback",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established in the traffic pattern.
        Aircraft has already received landing clearance for runway 23.
      `.trim(),
    },

    initialConversation: landingClearanceIssued,

    pilotTransmission: "Cleared to land runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  /*
   * ========================================================================
   * POSITION REPORTS
   * ========================================================================
   *
   * These test that the model doesn't treat every pilot transmission as
   * requiring a response.
   */

  {
    name: "Report downwind when no action is required",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established on downwind.
        No additional ATC instruction is currently required.
      `.trim(),
    },

    pilotTransmission: "Tower, downwind, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  /*
   * ========================================================================
   * STATE CONTINUITY
   * ========================================================================
   */

  {
    name: "Already climbing, do not repeat takeoff clearance",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft has already departed runway 23.
        Aircraft is currently climbing through approximately 700 feet.
        Aircraft was previously cleared for takeoff.
        Aircraft is maintaining runway heading.
      `.trim(),
    },

    initialConversation: [
      {
        pilot: "Tower, holding short runway 23, ready for departure, LV-INQ.",
        atc: "LV-INQ, cleared for takeoff runway 23, maintain runway heading, climb and maintain 1000 feet.",
      },
    ],

    pilotTransmission: "Currently climbing through 700 feet, LV-INQ.",

    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff", "takeoff"],
    },
  },

  {
    name: "Completed instruction should not be repeated",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established on downwind at pattern altitude.
        Aircraft has already completed the previously issued climb instruction.
      `.trim(),
    },

    initialConversation: [
      {
        pilot: "Tower, climbing through 700 feet, LV-INQ.",
        atc: "LV-INQ, climb and maintain 1000 feet, report downwind.",
      },
    ],

    pilotTransmission: "Downwind at 1000 feet, LV-INQ.",

    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["climb and maintain", "climb to"],
    },
  },

  /*
   * ========================================================================
   * TRAFFIC PATTERN
   * ========================================================================
   */

  {
    name: "Initial climb instruction",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft has just departed runway 23.
        Aircraft is climbing on runway heading.
        Standard traffic pattern is left-hand.
        Pattern altitude is 1000 feet.
      `.trim(),
    },

    pilotTransmission: "Tower, airborne, initial climb, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["heading"],
      forbiddenPatterns: ["cleared to land"],
    },
  },

  {
    name: "Crosswind position report",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft has departed and is turning from the departure leg toward crosswind.
        Standard traffic pattern is left-hand.
        Pattern altitude is 1000 feet.
      `.trim(),
    },

    pilotTransmission: "Tower, turning crosswind, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["1000"],
      forbiddenPatterns: ["cleared for takeoff", "cleared to land"],
    },
  },

  {
    name: "Downwind position report",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established on left downwind.
        Aircraft is at approximately pattern altitude.
        No additional instruction is currently required.
      `.trim(),
    },

    pilotTransmission: "Tower, downwind, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  /*
   * ========================================================================
   * LANDING
   * ========================================================================
   */

  {
    name: "Final with runway available",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established on final for runway 23.
        Runway is clear.
        Aircraft has not yet received landing clearance.
      `.trim(),
    },

    pilotTransmission: "Tower, final runway 23, full stop, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared to land", "23"],
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },

  {
    name: "Already cleared to land on short final",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is on short final.
        Aircraft has already received landing clearance for runway 23.
        Runway remains clear.
      `.trim(),
    },

    initialConversation: landingClearanceIssued,

    pilotTransmission: "Tower, short final, LV-INQ.",

    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared to land"],
    },
  },

  /*
   * ========================================================================
   * GO-AROUND
   * ========================================================================
   */

  {
    name: "Go-around",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft was previously on approach to runway 23.
        Aircraft is now climbing after initiating a go-around.
      `.trim(),
    },

    pilotTransmission: "Tower, going around, LV-INQ.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["go-around"],
      forbiddenPatterns: ["cleared to land"],
    },
  },

  /*
   * ========================================================================
   * QUESTIONS
   * ========================================================================
   *
   * These are useful because they test whether the model can answer from
   * authoritative telemetry without inventing information.
   */

  {
    name: "Pilot asks current heading",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is currently climbing after departure.
      `.trim(),
    },

    pilotTransmission: "Tower, what is my current heading?",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["223"],
    },
  },

  {
    name: "Pilot asks whether airborne",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft has departed and is currently climbing.
      `.trim(),
    },

    pilotTransmission: "Tower, confirm we're airborne.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["airborne"],
    },
  },

  /*
   * ========================================================================
   * NEGATIVE / ROBUSTNESS TESTS
   * ========================================================================
   */

  {
    name: "Position report should not become a clearance request",

    aircraftState: downwind,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is established on downwind at pattern altitude.
        Aircraft has not requested any additional service.
        No immediate ATC action is required.
      `.trim(),
    },

    pilotTransmission: "Tower, currently downwind runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
    },
  },

  {
    name: "Readback should not trigger duplicate clearance",

    aircraftState: holdingShort,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is holding short.
        The aircraft has already received takeoff clearance.
      `.trim(),
    },

    initialConversation: takeoffClearanceIssued,

    pilotTransmission: "Cleared for takeoff runway 23, LV-INQ.",

    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },

  {
    name: "Emergency declaration takes priority",

    aircraftState: initialClimb,

    atcState: {
      situationContext: `
        Active runway is 23.
        Aircraft is airborne and climbing.
        Treat emergency information as higher priority than routine traffic-pattern instructions.
      `.trim(),
    },

    pilotTransmission:
      "MAYDAY MAYDAY MAYDAY, LV-INQ, engine failure, 700 feet.",

    expectations: {
      responseRequired: true,
      requiredConcepts: ["engine"],

      forbiddenPatterns: [
        "report downwind",
        "report base",
        "report final",
        "traffic pattern",
        "cleared for takeoff",
      ],
    },
  },
];
