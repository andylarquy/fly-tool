import { AtcIntent } from "../domain/AtcIntent";
import { FlightEvent } from "../domain/FlightEvent";
import {
  FacilityRelationship,
  LandingRecord,
  PilotRecord,
} from "../domain/PilotRecord";
import { RemarkKind } from "../domain/Remark";

const MAX_LANDINGS_KEPT = 20;

export const createPilotRecord = (
  pilotId: string,
  displayName: string,
): PilotRecord => ({ pilotId, displayName, relationships: {} });

export const getRelationship = (
  record: PilotRecord,
  facilityId: string,
): FacilityRelationship | undefined => record.relationships[facilityId];

const blankRelationship = (
  facilityId: string,
  epochMs: number,
): FacilityRelationship => ({
  facilityId,
  visitCount: 0,
  firstSeenAtMs: epochMs,
  lastSeenAtMs: epochMs,
  landings: [],
  readbackErrorCount: 0,
});

const updateRelationship = (
  record: PilotRecord,
  facilityId: string,
  epochMs: number,
  change: (relationship: FacilityRelationship) => FacilityRelationship,
): PilotRecord => ({
  ...record,
  relationships: {
    ...record.relationships,
    [facilityId]: change(
      record.relationships[facilityId] ?? blankRelationship(facilityId, epochMs),
    ),
  },
});

export const startVisit = (
  record: PilotRecord,
  facilityId: string,
  epochMs: number,
): PilotRecord =>
  updateRelationship(record, facilityId, epochMs, (relationship) => ({
    ...relationship,
    visitCount: relationship.visitCount + 1,
    lastSeenAtMs: epochMs,
  }));

export const recordTouchdown = (
  record: PilotRecord,
  facilityId: string,
  landing: LandingRecord,
): PilotRecord =>
  updateRelationship(record, facilityId, landing.atMs, (relationship) => ({
    ...relationship,
    lastSeenAtMs: landing.atMs,
    landings: [...relationship.landings, landing].slice(-MAX_LANDINGS_KEPT),
  }));

export const recordReadbackError = (
  record: PilotRecord,
  facilityId: string,
  epochMs: number,
): PilotRecord =>
  updateRelationship(record, facilityId, epochMs, (relationship) => ({
    ...relationship,
    readbackErrorCount: relationship.readbackErrorCount + 1,
  }));

export const recordRemark = (
  record: PilotRecord,
  facilityId: string,
  kind: RemarkKind,
  epochMs: number,
): PilotRecord =>
  updateRelationship(record, facilityId, epochMs, (relationship) => ({
    ...relationship,
    lastRemarkKind: kind,
    lastRemarkAtMs: epochMs,
  }));

export const recordTurn = (
  record: PilotRecord,
  facilityId: string,
  events: FlightEvent[],
  intents: AtcIntent[],
  epochMs: number,
): PilotRecord => {
  let updated = record;

  for (const event of events) {
    if (event.type === "touchdown") {
      updated = recordTouchdown(updated, facilityId, {
        atMs: epochMs,
        runway: event.runway,
        touchdownVerticalSpeedFeetPerMinute: event.verticalSpeedFeetPerMinute,
      });
    }
  }

  for (const intent of intents) {
    if (intent.type === "correct_readback") {
      updated = recordReadbackError(updated, facilityId, epochMs);
    }

    if (intent.type === "remark") {
      updated = recordRemark(updated, facilityId, intent.remark.kind, epochMs);
    }
  }

  return updated;
};
