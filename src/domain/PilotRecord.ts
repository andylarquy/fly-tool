export interface LandingRecord {
  atMs: number;
  runway?: string;
  touchdownVerticalSpeedFeetPerMinute: number;
}

export interface FacilityRelationship {
  facilityId: string;
  visitCount: number;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  landings: LandingRecord[];
  readbackErrorCount: number;
}

export interface PilotRecord {
  pilotId: string;
  displayName: string;
  relationships: Record<string, FacilityRelationship>;
}

export interface PilotRecordStore {
  load(pilotId: string): Promise<PilotRecord | undefined>;
  save(record: PilotRecord): Promise<void>;
}
