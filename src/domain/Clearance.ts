export type ClearanceKind =
  | "line_up_and_wait"
  | "takeoff"
  | "land"
  | "touch_and_go"
  | "pattern_entry"
  | "taxi";

export type ClearanceStatus =
  | "issued"
  | "acknowledged"
  | "completed"
  | "cancelled";

export interface Clearance {
  kind: ClearanceKind;
  runway: string;
  issuedAtMs: number;
  status: ClearanceStatus;
}
