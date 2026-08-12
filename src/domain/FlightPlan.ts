export enum FlightRules {
  VFR = "VFR",
  IFR = "IFR",
}

export interface FlightPlan {
  callsign?: string;
  aircraftType?: string;
  departure?: string;
  destination?: string;
  flightRules?: FlightRules;
  requestedAltitude?: number;
  route?: string;
}
