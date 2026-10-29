import { AircraftState } from "../domain/AircraftState";
import { Airport } from "../domain/Airport";
import { AtcIntent } from "../domain/AtcIntent";
import { EngineState } from "../domain/EngineState";
import { ControllerStyle } from "../domain/ControllerStyle";
import { FlightEvent } from "../domain/FlightEvent";
import { PilotMessage } from "../domain/PilotMessage";
import { Situation } from "../domain/Situation";

export type PilotInput =
  | { status: "none" }
  | { status: "heard"; message: PilotMessage }
  | { status: "unintelligible" };

export interface DecisionContext {
  aircraft: AircraftState;
  airport: Airport;
  situation: Situation;
  style: ControllerStyle;
}

export interface DecisionInput extends DecisionContext {
  events: FlightEvent[];
  pilot: PilotInput;
}

export interface Decision {
  intents: AtcIntent[];
  state: EngineState;
}
