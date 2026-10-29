import { AtcIntent } from "../../domain/AtcIntent";
import { Strictness } from "../../domain/ControllerStyle";
import { FlightPhase } from "../../domain/FlightPhase";
import { BenchmarkExpectations } from "../benchmark/benchmarkTypes";

export interface RenderCase {
  name: string;
  intents: AtcIntent[];
  strictness?: Strictness;
  expectations: BenchmarkExpectations;
}

export const renderCases: RenderCase[] = [
  {
    name: "Line up and wait",
    intents: [{ type: "issue_clearance", clearance: "line_up_and_wait", runway: "23" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["line up and wait", "23"],
      forbiddenPatterns: ["cleared for takeoff"],
    },
  },
  {
    name: "Takeoff clearance",
    intents: [{ type: "issue_clearance", clearance: "takeoff", runway: "23" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23"],
      forbiddenPatterns: ["line up", "cleared to land"],
    },
  },
  {
    name: "Takeoff clearance with report point",
    intents: [
      { type: "issue_clearance", clearance: "takeoff", runway: "23", expectReport: "downwind" },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared for takeoff", "23", "report downwind"],
    },
  },
  {
    name: "Landing clearance",
    intents: [{ type: "issue_clearance", clearance: "land", runway: "23" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared to land", "23"],
      forbiddenPatterns: ["takeoff"],
    },
  },
  {
    name: "Pattern entry",
    intents: [
      {
        type: "instruct",
        instruction: "enter_pattern",
        runway: "23",
        patternSide: "left",
        altitudeFeetAgl: 1000,
        expectReport: "downwind",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["left", "23", "1000", "report downwind"],
      forbiddenPatterns: ["cleared"],
    },
  },
  {
    name: "Report base",
    intents: [{ type: "instruct", instruction: "report", expectReport: "base" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["report base"],
      forbiddenPatterns: ["cleared", "runway"],
    },
  },
  {
    name: "Go-around",
    intents: [
      { type: "instruct", instruction: "go_around", runway: "23", expectReport: "downwind" },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["go around", "report downwind"],
    },
  },
  {
    name: "Vacate runway without reading the touchdown rate",
    intents: [
      {
        type: "instruct",
        instruction: "vacate_runway",
        runway: "23",
        touchdownFeetPerMinute: -730,
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["vacate", "23"],
      forbiddenPatterns: ["730", "feet per minute"],
    },
  },
  {
    name: "Wrong runway readback correction",
    intents: [{ type: "correct_readback", clearance: "takeoff", runway: "23" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["negative", "cleared for takeoff", "23"],
      forbiddenPatterns: ["05"],
    },
  },
  {
    name: "Confirm position",
    intents: [
      { type: "query", query: "confirm_position", claimed: "downwind", observed: FlightPhase.Base },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["confirm downwind", "base"],
    },
  },
  {
    name: "Say intentions",
    intents: [{ type: "query", query: "say_intentions" }],
    expectations: { responseRequired: true, requiredConcepts: ["say intentions"] },
  },
  {
    name: "Say again",
    intents: [{ type: "query", query: "say_again" }],
    expectations: { responseRequired: true, requiredConcepts: ["say again"] },
  },
  {
    name: "Full readback",
    intents: [{ type: "query", query: "full_readback" }],
    expectations: { responseRequired: true, requiredConcepts: ["readback"] },
  },
  {
    name: "Heading advisory",
    intents: [{ type: "advise", topic: "heading", value: 224 }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["224"],
      forbiddenPatterns: ["cleared"],
    },
  },
  {
    name: "Airborne advisory",
    intents: [{ type: "advise", topic: "airborne", value: true }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["airborne"],
      forbiddenPatterns: ["not airborne", "on the ground"],
    },
  },
  {
    name: "Unable",
    intents: [{ type: "unable", reason: "no_information" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["unable"],
      forbiddenPatterns: ["wind", "knots", "runway"],
    },
  },
  {
    name: "Mayday with nature already given asks only for intentions",
    intents: [
      { type: "emergency_response", urgency: "mayday", nature: "engine_failure", ask: ["intention"] },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["mayday", "engine failure", "intentions"],
      forbiddenPatterns: ["nature of", "cleared", "report downwind"],
    },
  },
  {
    name: "Mayday with no details asks for nature and intentions",
    intents: [
      { type: "emergency_response", urgency: "mayday", ask: ["nature", "intention"] },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["mayday", "nature of emergency", "intentions"],
    },
  },
  {
    name: "Pan-pan is not answered as a mayday",
    intents: [
      { type: "emergency_response", urgency: "pan_pan", nature: "fire", ask: [] },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["pan-pan", "fire"],
      forbiddenPatterns: ["mayday", "say"],
    },
  },
  {
    name: "Secondary emergency questions",
    intents: [
      { type: "emergency_response", urgency: "mayday", nature: "medical", ask: ["souls", "fuel"] },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["souls on board", "fuel"],
      forbiddenPatterns: ["nature of", "intentions"],
    },
  },
  {
    name: "Welcome back after a clearance",
    intents: [
      {
        type: "instruct",
        instruction: "enter_pattern",
        runway: "23",
        patternSide: "left",
        altitudeFeetAgl: 1000,
        expectReport: "downwind",
      },
      { type: "remark", remark: { kind: "welcome_back" } },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["left traffic", "23", "report downwind"],
    },
  },
  {
    name: "You again for a regular",
    strictness: "relaxed",
    intents: [
      { type: "issue_clearance", clearance: "land", runway: "23" },
      { type: "remark", remark: { kind: "you_again" } },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["cleared to land", "23"],
    },
  },
  {
    name: "Caution after a firm previous landing",
    strictness: "relaxed",
    intents: [
      { type: "instruct", instruction: "report", expectReport: "downwind" },
      { type: "remark", remark: { kind: "previous_firm_landing" } },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["report downwind"],
      forbiddenPatterns: ["feet per minute", "fpm"],
    },
  },
  {
    name: "Smooth landing remark",
    intents: [
      { type: "instruct", instruction: "vacate_runway", runway: "23", touchdownFeetPerMinute: -90 },
      { type: "remark", remark: { kind: "smooth_landing" } },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["vacate", "23"],
      forbiddenPatterns: ["90", "feet per minute"],
    },
  },
  {
    name: "Firm landing remark",
    intents: [
      { type: "instruct", instruction: "vacate_runway", runway: "23", touchdownFeetPerMinute: -650 },
      { type: "remark", remark: { kind: "firm_landing" } },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["vacate", "23"],
      forbiddenPatterns: ["650", "feet per minute"],
    },
  },
  {
    name: "Taxi instruction to a runway",
    intents: [
      {
        type: "taxi_instruction",
        reason: "request",
        destination: { kind: "runway", runway: "23" },
        taxiways: ["C", "A", "B"],
        holdShort: "23",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["taxi to runway 23", "charlie, alpha, bravo", "hold short runway 23"],
      forbiddenPatterns: ["cleared"],
    },
  },
  {
    name: "Taxi instruction with a numbered taxiway",
    intents: [
      {
        type: "taxi_instruction",
        reason: "request",
        destination: { kind: "runway", runway: "05" },
        taxiways: ["A1", "B"],
        holdShort: "05",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["taxi to runway 05", "alpha 1, bravo", "hold short runway 05"],
    },
  },
  {
    name: "Taxi instruction to parking has no hold short",
    intents: [
      {
        type: "taxi_instruction",
        reason: "request",
        destination: { kind: "parking", name: "Ramp 1" },
        taxiways: ["C"],
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["taxi to ramp 1", "charlie"],
      forbiddenPatterns: ["hold short", "runway"],
    },
  },
  {
    name: "Taxi instruction with no named taxiway",
    intents: [
      {
        type: "taxi_instruction",
        reason: "request",
        destination: { kind: "runway", runway: "23" },
        taxiways: [],
        holdShort: "23",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["taxi to runway 23", "hold short runway 23"],
      forbiddenPatterns: ["via"],
    },
  },
  {
    name: "Wrong turn correction",
    intents: [
      {
        type: "taxi_instruction",
        reason: "off_route",
        destination: { kind: "runway", runway: "23" },
        taxiways: ["A", "B"],
        holdShort: "23",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["off", "taxi to runway 23", "alpha, bravo"],
    },
  },
  {
    name: "Taxi readback correction",
    intents: [
      {
        type: "taxi_instruction",
        reason: "readback_error",
        destination: { kind: "runway", runway: "23" },
        taxiways: ["C", "A", "B"],
        holdShort: "23",
      },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["negative", "taxi to runway 23", "charlie, alpha, bravo"],
    },
  },
  {
    name: "Hold short instruction",
    intents: [{ type: "instruct", instruction: "hold_short", runway: "23" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["hold short runway 23"],
      forbiddenPatterns: ["cleared", "taxi"],
    },
  },
  {
    name: "Hold position",
    intents: [{ type: "instruct", instruction: "hold_position" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["hold position"],
      forbiddenPatterns: ["cleared", "runway"],
    },
  },
  {
    name: "Readback confirmed in strict mode",
    strictness: "strict",
    intents: [{ type: "acknowledge", kind: "readback_correct" }],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["readback correct"],
    },
  },
  {
    name: "Courtesy reply stays short",
    strictness: "relaxed",
    intents: [{ type: "acknowledge", kind: "courtesy" }],
    expectations: {
      responseRequired: true,
      forbiddenPatterns: ["cleared", "runway", "report"],
    },
  },
  {
    name: "Two intents in one transmission",
    intents: [
      { type: "correct_readback", clearance: "land", runway: "23" },
      { type: "instruct", instruction: "report", expectReport: "final" },
    ],
    expectations: {
      responseRequired: true,
      requiredConcepts: ["negative", "cleared to land", "23", "report final"],
    },
  },
];
