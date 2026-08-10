import { AircraftState } from "../../domain/AircraftState";
import { BenchmarkScenario, ConversationTurn } from "./benchmarkTypes";

const ACTIVE_RUNWAY_CONTEXT =
  "Active runway is 23.\nPilot intention is performing a traffic pattern for runway 23.";

// Same telemetry on purpose: the distinction between holding short and
// lined up is carried by situation context, not the numbers alone.
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
  trueHeading: 230,
  groundSpeed: 0,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: true,
};

const initialClimb: AircraftState = {
  latitude: -34.454,
  longitude: -58.589,
  altitudeFeet: 350,
  trueHeading: 230,
  groundSpeed: 75,
  pitch: 8,
  bank: 0,
  verticalSpeedFeetPerMinute: 700,
  isOnGround: false,
};

const crosswindClimb: AircraftState = {
  latitude: -34.459,
  longitude: -58.592,
  altitudeFeet: 800,
  trueHeading: 314,
  groundSpeed: 85,
  pitch: 5,
  bank: 20,
  verticalSpeedFeetPerMinute: 500,
  isOnGround: false,
};

const downwindLevel: AircraftState = {
  latitude: -34.466053600241985,
  longitude: -58.60380201309368,
  altitudeFeet: 1000,
  trueHeading: 44,
  groundSpeed: 90,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: false,
};

const inboundForPatternEntry: AircraftState = {
  latitude: -34.5,
  longitude: -58.55,
  altitudeFeet: 1200,
  trueHeading: 4,
  groundSpeed: 100,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: false,
};

const turningBase: AircraftState = {
  latitude: -34.456,
  longitude: -58.6,
  altitudeFeet: 600,
  trueHeading: 314,
  groundSpeed: 80,
  pitch: -3,
  bank: -18,
  verticalSpeedFeetPerMinute: -400,
  isOnGround: false,
};

const shortFinal: AircraftState = {
  latitude: -34.451,
  longitude: -58.587,
  altitudeFeet: 300,
  trueHeading: 230,
  groundSpeed: 70,
  pitch: -2,
  bank: 0,
  verticalSpeedFeetPerMinute: -450,
  isOnGround: false,
};

const veryShortFinal: AircraftState = {
  latitude: -34.4505,
  longitude: -58.5862,
  altitudeFeet: 50,
  trueHeading: 230,
  groundSpeed: 65,
  pitch: -1,
  bank: 0,
  verticalSpeedFeetPerMinute: -300,
  isOnGround: false,
};

const climbingThrough700: AircraftState = {
  latitude: -34.466053600241985,
  longitude: -58.60380201309368,
  altitudeFeet: 700,
  trueHeading: 223,
  groundSpeed: 80,
  pitch: 6,
  bank: 0,
  verticalSpeedFeetPerMinute: 650,
  isOnGround: false,
};

const inboundForLanding: AircraftState = {
  latitude: -34.55,
  longitude: -58.52,
  altitudeFeet: 1500,
  trueHeading: 220,
  groundSpeed: 100,
  pitch: 0,
  bank: 0,
  verticalSpeedFeetPerMinute: 0,
  isOnGround: false,
};

const goAroundClimb: AircraftState = {
  latitude: -34.4508,
  longitude: -58.5865,
  altitudeFeet: 60,
  trueHeading: 230,
  groundSpeed: 70,
  pitch: 10,
  bank: 0,
  verticalSpeedFeetPerMinute: 600,
  isOnGround: false,
};

const readyForDepartureHoldingShort: ConversationTurn[] = [
  {
    pilot: "Holding short runway 23, ready for departure.",
    atc: "LV-INQ, cleared for takeoff runway 23.",
  },
];

const readyForDepartureLinedUp: ConversationTurn[] = [
  {
    pilot: "Lined up runway 23, ready for departure.",
    atc: "LV-INQ, cleared for takeoff runway 23.",
  },
];

const clearedThenReadBackTurns: ConversationTurn[] = [
  ...readyForDepartureHoldingShort,
  {
    pilot: "Cleared for takeoff runway 23, LV-INQ.",
    atc: "[NO RESPONSE]",
  },
];

export const scenarios: BenchmarkScenario[] = [
  // Readbacks
  {
    name: "Request takeoff clearance",
    aircraftState: holdingShort,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is holding short of runway 23, awaiting takeoff clearance.`,
    },
    pilotTransmission:
      "Tower, LV-INQ, holding short runway 23, ready for departure.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23"],
    },
  },
  {
    name: "Correct takeoff readback",
    aircraftState: holdingShort,
    atcState: { situationContext: ACTIVE_RUNWAY_CONTEXT },
    initialConversation: readyForDepartureHoldingShort,
    pilotTransmission: "Cleared for takeoff runway 23, LV-INQ.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },
  {
    name: "Paraphrased takeoff readback",
    aircraftState: holdingShort,
    atcState: { situationContext: ACTIVE_RUNWAY_CONTEXT },
    initialConversation: readyForDepartureHoldingShort,
    pilotTransmission: "Roger, we're cleared for takeoff on 23, LV-INQ.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },
  {
    name: "Incorrect runway readback",
    aircraftState: holdingShort,
    atcState: { situationContext: ACTIVE_RUNWAY_CONTEXT },
    initialConversation: readyForDepartureHoldingShort,
    pilotTransmission: "Cleared for takeoff runway 05, LV-INQ.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["23"],
      forbiddenPatterns: ["runway 05"],
    },
  },
  {
    name: "Landing-clearance readback",
    aircraftState: shortFinal,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is on final approach for runway 23.`,
    },
    initialConversation: [
      {
        pilot: "Tower, LV-INQ, on final for runway 23.",
        atc: "LV-INQ, cleared to land runway 23.",
      },
    ],
    pilotTransmission: "Cleared to land runway 23, LV-INQ.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared to land"],
    },
  },

  // Traffic pattern
  {
    name: "Report initial climb",
    aircraftState: initialClimb,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft departed runway 23 and is climbing on runway heading.\nNo conflicting traffic is known.`,
    },
    initialConversation: clearedThenReadBackTurns,
    pilotTransmission: "Tower, LV-INQ, airborne, climbing runway heading.",
    expectations: {
      responseRequired: false,
    },
  },
  {
    name: "Report crosswind",
    aircraftState: crosswindClimb,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is climbing and turning onto the crosswind leg.\nNo conflicting traffic is known.`,
    },
    initialConversation: clearedThenReadBackTurns,
    pilotTransmission: "Tower, LV-INQ, turning crosswind.",
    expectations: {
      responseRequired: false,
    },
  },
  {
    name: "Report downwind",
    aircraftState: downwindLevel,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is established on the downwind leg.\nNo new ATC instruction is required.`,
    },
    pilotTransmission: "Tower, LV-INQ, downwind.",
    expectations: {
      responseRequired: false,
    },
  },
  {
    name: "Request pattern entry",
    aircraftState: inboundForPatternEntry,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is inbound to the field requesting to join the traffic pattern.\nTraffic pattern altitude is 1000 feet.`,
    },
    pilotTransmission:
      "Tower, LV-INQ, 5 miles south, request pattern entry runway 23.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["23"],
    },
  },
  {
    name: "Report base",
    aircraftState: turningBase,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft was previously instructed to report base.\nNo additional traffic information is available.`,
    },
    pilotTransmission: "Turning base, LV-INQ.",
    expectations: {
      responseRequired: false,
    },
  },
  {
    name: "Report final",
    aircraftState: shortFinal,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is number one in the traffic pattern.\nRunway 23 is clear.\nNo conflicting traffic is present.`,
    },
    pilotTransmission: "Tower, LV-INQ, final for runway 23, full stop.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared to land", "23"],
    },
  },

  // Takeoff
  {
    name: "Lined up and requesting clearance",
    aircraftState: linedUp,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is lined up on runway 23, no conflicting traffic.`,
    },
    pilotTransmission:
      "Tower, LV-INQ, lined up runway 23, ready for departure.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23"],
    },
  },
  {
    name: "Cleared for takeoff, readback",
    aircraftState: linedUp,
    atcState: { situationContext: ACTIVE_RUNWAY_CONTEXT },
    initialConversation: readyForDepartureLinedUp,
    pilotTransmission: "Wilco, cleared for takeoff runway 23, LV-INQ.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },
  {
    name: "Airborne, initial climb",
    aircraftState: initialClimb,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft just departed runway 23.`,
    },
    initialConversation: clearedThenReadBackTurns,
    pilotTransmission: "Tower, LV-INQ, airborne.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },
  {
    name: "Already climbing, don't reissue takeoff clearance",
    aircraftState: climbingThrough700,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft departed runway 23 and is climbing.`,
    },
    initialConversation: clearedThenReadBackTurns,
    pilotTransmission: "Tower, LV-INQ, currently climbing through 700 feet.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared for takeoff", "line up", "hold short"],
    },
  },

  // Landing
  {
    name: "Request landing",
    aircraftState: inboundForLanding,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft is inbound for landing.`,
    },
    pilotTransmission:
      "Tower, LV-INQ, 10 miles north, request full stop landing runway 23.",
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared to land", "23"],
    },
  },
  {
    name: "Report final, already cleared to land",
    aircraftState: veryShortFinal,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft was already cleared to land runway 23 and is now on short final.\nNo new ATC instruction is required.`,
    },
    pilotTransmission: "Tower, LV-INQ, short final.",
    expectations: {
      responseRequired: false,
    },
  },
  {
    name: "Cleared to land, readback",
    aircraftState: shortFinal,
    atcState: { situationContext: ACTIVE_RUNWAY_CONTEXT },
    pilotTransmission: "Cleared to land runway 23, LV-INQ.",
    expectations: {
      responseRequired: false,
      forbiddenPatterns: ["cleared to land"],
    },
  },
  {
    name: "Go-around",
    aircraftState: goAroundClimb,
    atcState: {
      situationContext: `${ACTIVE_RUNWAY_CONTEXT}\nAircraft was on short final for runway 23 and has initiated a go-around.\nThe aircraft should re-enter the traffic pattern.`,
    },
    pilotTransmission: "Tower, LV-INQ, going around.",
    expectations: {
      responseRequired: true,
      forbiddenPatterns: ["cleared to land"],
    },
  },
];
