export type PilotIntentKind =
  | "pattern_work"
  | "departure"
  | "arrival"
  | "overflight";

export interface PilotIntent {
  kind: PilotIntentKind;
  runway?: string;
  declaredAtMs: number;
}
