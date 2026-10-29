export const PILOT_MESSAGE_TYPES = [
  "request",
  "readback",
  "position_report",
  "question",
  "emergency",
  "other",
] as const;

export const PILOT_MESSAGE_SUBJECTS = [
  "takeoff",
  "landing",
  "line_up",
  "taxi",
  "parking",
  "hold_short",
  "pattern_entry",
  "altitude",
  "heading",
  "airborne",
  "crosswind",
  "downwind",
  "base",
  "final",
  "go_around",
  "weather",
  "other",
] as const;

import { EmergencyDetails } from "./Emergency";

export type PilotMessageType = (typeof PILOT_MESSAGE_TYPES)[number];
export type PilotMessageSubject = (typeof PILOT_MESSAGE_SUBJECTS)[number];

// What the model made of a pilot's reply to a taxi instruction, compared with
// the instruction itself. Only present while such an instruction is waiting
// for its readback.
export interface TaxiReadbackJudgement {
  readsBack: boolean;
  holdShortRepeated: boolean;
  taxiwaysRepeated: string[];
  mentionsOtherTaxiway: boolean;
}

export interface PilotMessage {
  type: PilotMessageType;
  runway: string | null;
  subject: PilotMessageSubject;
  emergency?: EmergencyDetails;
  taxiReadback?: TaxiReadbackJudgement;
}
