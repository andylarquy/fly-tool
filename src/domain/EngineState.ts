import { ReportPoint } from "./AtcIntent";
import { EmergencyState } from "./Emergency";
import { FlightIntake } from "./FlightIntake";
import { PilotMessage } from "./PilotMessage";
import { ControllerPosition } from "./Frequency";
import { TaxiState } from "./Taxi";
import { RemarkKind } from "./Remark";
import { Clearance } from "./Clearance";

export interface EngineState {
  runway: string;
  clearances: Clearance[];
  expectedReport?: ReportPoint;
  contacted: boolean;
  position?: ControllerPosition;
  awaitingGroundHandoff?: boolean;
  awaitingCheckIn?: ControllerPosition;
  taxi?: TaxiState;
  remarksMade: RemarkKind[];
  lastRemarkAtMs?: number;
  airspaceEnteredAtMs?: number;
  emergency?: EmergencyState;
  intake?: FlightIntake;
  deferred?: PilotMessage;
}
