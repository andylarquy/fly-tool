import { ReportPoint } from "./AtcIntent";
import { EmergencyState } from "./Emergency";
import { RemarkKind } from "./Remark";
import { Clearance } from "./Clearance";

export interface EngineState {
  runway: string;
  clearances: Clearance[];
  expectedReport?: ReportPoint;
  contacted: boolean;
  remarksMade: RemarkKind[];
  lastRemarkAtMs?: number;
  airspaceEnteredAtMs?: number;
  emergency?: EmergencyState;
}
