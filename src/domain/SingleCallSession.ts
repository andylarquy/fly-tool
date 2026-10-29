import { AircraftState } from "./AircraftState";
import { SingleCallContext } from "./SingleCallContext";
import { FlightPlan } from "./FlightPlan";

export interface SingleCallSession {
  flightPlan: FlightPlan;
  aircraftState: AircraftState;
  context: SingleCallContext;
}
