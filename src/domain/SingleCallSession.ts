import { AircraftState } from "./AircraftState";
import { AtcState } from "./SingleCallContext";
import { FlightPlan } from "./FlightPlan";

export interface AtcSession {
  flightPlan: FlightPlan;
  aircraftState: AircraftState;
  atcState: AtcState;
}
