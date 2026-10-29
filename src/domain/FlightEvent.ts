import { FlightPhase } from "./FlightPhase";

export type FlightEvent =
  | { type: "phase_changed"; atMs: number; from: FlightPhase; to: FlightPhase }
  | { type: "lifted_off"; atMs: number; runway?: string }
  | {
      type: "touchdown";
      atMs: number;
      runway?: string;
      verticalSpeedFeetPerMinute: number;
    }
  | { type: "go_around"; atMs: number }
  | { type: "entered_airspace"; atMs: number }
  | { type: "left_airspace"; atMs: number };
