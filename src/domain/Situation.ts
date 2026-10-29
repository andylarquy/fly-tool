import { FlightPhase } from "./FlightPhase";

export interface RunwayRelativePosition {
  alongFeet: number;
  crossFeet: number;
  headingOffsetDegrees: number;
  aglFeet: number;
  distanceToAirportNauticalMiles: number;
}

export interface PendingPhase {
  phase: FlightPhase;
  sinceMs: number;
}

export interface Situation {
  observedAtMs: number;
  runway: string;
  phase: FlightPhase;
  pendingPhase?: PendingPhase;
  geometry: RunwayRelativePosition;
  onGround: boolean;
  onRunway: boolean;
  holdingShortRunway?: string;
  inAirspace: boolean;
  lastVerticalSpeedFeetPerMinute: number;
}
