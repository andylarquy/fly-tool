export type TaxiDestination =
  | { kind: "runway"; runway: string }
  | { kind: "parking"; name: string };

export type TaxiLeg =
  | { kind: "taxiway"; name: string }
  | { kind: "cross"; runway: string };

export type TaxiInstructionReason =
  | "request"
  | "repeat"
  | "off_route"
  | "readback_error"
  | "continue";

export interface TaxiState {
  destination: TaxiDestination;
  pointIds: number[];
  legs: TaxiLeg[];
  holdShort?: string;
  holdAtIndex?: number;
  crossingCleared?: { runway: string; sawRunway: boolean };
  offRouteSinceMs?: number;
  lastCorrectionAtMs?: number;
  lastIncursionAtMs?: number;
}
