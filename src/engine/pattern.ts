import { ReportPoint } from "../domain/AtcIntent";
import { FlightPhase } from "../domain/FlightPhase";
import { PilotMessageSubject } from "../domain/PilotMessage";

const REPORT_POINTS: readonly ReportPoint[] = [
  "crosswind",
  "downwind",
  "base",
  "final",
];

const REPORT_AFTER: Record<ReportPoint, ReportPoint | undefined> = {
  crosswind: "downwind",
  downwind: "base",
  base: "final",
  final: undefined,
};

const NEXT_REPORT_FOR_PHASE: Partial<Record<FlightPhase, ReportPoint>> = {
  [FlightPhase.Upwind]: "downwind",
  [FlightPhase.Crosswind]: "downwind",
  [FlightPhase.Downwind]: "base",
  [FlightPhase.Base]: "final",
};

// A pilot already turning onto the next leg may report it before the derived
// phase has committed, so the next leg counts as compatible too.
const COMPATIBLE_CLAIMS: Partial<Record<FlightPhase, ReportPoint[]>> = {
  [FlightPhase.Upwind]: ["crosswind"],
  [FlightPhase.Crosswind]: ["crosswind", "downwind"],
  [FlightPhase.Downwind]: ["downwind", "base"],
  [FlightPhase.Base]: ["base", "final"],
  [FlightPhase.Final]: ["final"],
};

export const asReportPoint = (
  subject: PilotMessageSubject,
): ReportPoint | undefined => REPORT_POINTS.find((point) => point === subject);

export const reportAfter = (point: ReportPoint): ReportPoint | undefined =>
  REPORT_AFTER[point];

export const nextReportForPhase = (
  phase: FlightPhase,
): ReportPoint | undefined => NEXT_REPORT_FOR_PHASE[phase];

export const isClaimCompatible = (
  claimed: ReportPoint,
  phase: FlightPhase,
): boolean => COMPATIBLE_CLAIMS[phase]?.includes(claimed) ?? false;
