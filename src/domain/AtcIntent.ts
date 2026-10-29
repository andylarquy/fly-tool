import { PatternSide } from "./Airport";
import { ClearanceKind } from "./Clearance";
import { EmergencyNature, EmergencyQuestion, EmergencyUrgency } from "./Emergency";
import { FlightPhase } from "./FlightPhase";

export type ReportPoint = "crosswind" | "downwind" | "base" | "final";

export type AtcIntent =
  | {
      type: "issue_clearance";
      clearance: ClearanceKind;
      runway: string;
      expectReport?: ReportPoint;
    }
  | {
      type: "instruct";
      instruction: "report" | "enter_pattern" | "go_around" | "vacate_runway";
      runway?: string;
      patternSide?: PatternSide;
      altitudeFeetAgl?: number;
      expectReport?: ReportPoint;
      touchdownFeetPerMinute?: number;
    }
  | { type: "correct_readback"; clearance: ClearanceKind; runway: string }
  | { type: "advise"; topic: "heading" | "airborne"; value: number | boolean }
  | {
      type: "query";
      query: "say_again" | "say_intentions" | "confirm_position" | "full_readback";
      claimed?: ReportPoint;
      observed?: FlightPhase;
    }
  | { type: "acknowledge"; kind: "readback_correct" | "courtesy" }
  | {
      type: "emergency_response";
      urgency: EmergencyUrgency;
      nature?: EmergencyNature;
      ask: EmergencyQuestion[];
    }
  | { type: "unable"; reason: "no_information" | "not_supported" };
