export type FrequencyType =
  | "atis"
  | "clearance"
  | "ground"
  | "tower"
  | "approach"
  | "departure"
  | "center"
  | "ctaf"
  | "unicom"
  | "multicom"
  | "other";

export interface AirportFrequency {
  type: FrequencyType;
  frequencyMhz: number;
  name?: string;
}

// Who the pilot is talking to. Only the two positions that matter on the
// airport surface and in the pattern.
export type ControllerPosition = "ground" | "tower";
