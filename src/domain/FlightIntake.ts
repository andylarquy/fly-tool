import { GeoPoint } from "./GeoPoint";

// An airport as the conversation names it: enough to say it aloud and to know
// where it is.
export interface AirportRef {
  id: string;
  name: string;
  position: GeoPoint;
}

export type DestinationJudgement =
  | { kind: "resolved"; airport: AirportRef; saidAs?: string }
  | { kind: "ambiguous"; options: AirportRef[] }
  | { kind: "unknown"; text: string }
  | { kind: "unresolvable"; text: string };

// What the pilot's words made of the questions "where to" and "which rules",
// after the model extracted them and code looked the destination up.
export interface IntakeJudgement {
  destination?: DestinationJudgement;
  rules?: "VFR" | "IFR";
  local: boolean;
}

export interface FlightDestination {
  name: string;
  id?: string;
  position?: GeoPoint;
  local?: boolean;
}

// The flight plan as the controller has gathered it by asking.
export interface FlightIntake {
  destination?: FlightDestination;
  rules?: "VFR";
  unrecognized?: string;
  options?: AirportRef[];
  asked: number;
  abandoned?: boolean;
}
