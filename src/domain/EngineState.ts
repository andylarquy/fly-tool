import { ReportPoint } from "./AtcIntent";
import { EmergencyState } from "./Emergency";
import { TaxiState } from "./Taxi";
import { RemarkKind } from "./Remark";
import { Clearance } from "./Clearance";

export interface EngineState {
  runway: string;
  clearances: Clearance[];
  expectedReport?: ReportPoint;
  contacted: boolean;
  taxi?: TaxiState;
  remarksMade: RemarkKind[];
  lastRemarkAtMs?: number;
  airspaceEnteredAtMs?: number;
  emergency?: EmergencyState;
}
