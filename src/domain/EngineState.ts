import { ReportPoint } from "./AtcIntent";
import { EmergencyState } from "./Emergency";
import { Clearance } from "./Clearance";

export interface EngineState {
  runway: string;
  clearances: Clearance[];
  expectedReport?: ReportPoint;
  contacted: boolean;
  airspaceEnteredAtMs?: number;
  emergency?: EmergencyState;
}
