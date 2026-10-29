import { ReportPoint } from "./AtcIntent";
import { Clearance } from "./Clearance";

export interface EngineState {
  runway: string;
  clearances: Clearance[];
  expectedReport?: ReportPoint;
  contacted: boolean;
  airspaceEnteredAtMs?: number;
  emergency: boolean;
}
