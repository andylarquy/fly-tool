export const EMERGENCY_URGENCIES = ["mayday", "pan_pan"] as const;
export const EMERGENCY_NATURES = [
  "engine_failure",
  "fire",
  "medical",
  "fuel",
  "electrical",
  "other",
] as const;
export const EMERGENCY_INTENTIONS = [
  "land_at_airport",
  "land_ahead",
  "other",
] as const;

export type EmergencyUrgency = (typeof EMERGENCY_URGENCIES)[number];
export type EmergencyNature = (typeof EMERGENCY_NATURES)[number];
export type EmergencyIntention = (typeof EMERGENCY_INTENTIONS)[number];

export type EmergencyQuestion = "nature" | "intention" | "souls" | "fuel";

export interface EmergencyDetails {
  urgency?: EmergencyUrgency;
  nature?: EmergencyNature;
  intention?: EmergencyIntention;
  soulsOnBoard?: number;
  fuelEnduranceMinutes?: number;
}

export interface EmergencyState {
  declaredAtMs: number;
  details: EmergencyDetails;
  asked: EmergencyQuestion[];
}
