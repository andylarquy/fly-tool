export type TaxiDestination =
  | { kind: "runway"; runway: string }
  | { kind: "parking"; name: string };

export type TaxiInstructionReason =
  | "request"
  | "repeat"
  | "off_route"
  | "readback_error";

export interface TaxiState {
  destination: TaxiDestination;
  pointIds: number[];
  taxiways: string[];
  offRouteSinceMs?: number;
  lastCorrectionAtMs?: number;
  lastIncursionAtMs?: number;
}
