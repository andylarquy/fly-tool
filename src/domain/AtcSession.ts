import { AircraftState } from "./AircraftState";
import { AtcState } from "./AtcState";
import { FlightPlan } from "./FlightPlan";

export interface AtcSession {
  flightPlan: FlightPlan;
  aircraftState: AircraftState;
  atcState: AtcState;
}
