import { DEFAULT_PILOT_PROFILE } from "../../domain/defaultPilot";
import { PilotRecord } from "../../domain/PilotRecord";
import {
  createPilotRecord,
  recordTouchdown,
  startVisit,
} from "../../memory/recordKeeping";
import { labTower } from "../airports";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.UTC(2026, 9, 29, 12);

export const knownPilot = ({
  visits,
  lastLandingFpm = -150,
}: {
  visits: number;
  lastLandingFpm?: number;
}): PilotRecord => {
  let record = createPilotRecord(
    DEFAULT_PILOT_PROFILE.pilotId,
    DEFAULT_PILOT_PROFILE.displayName,
  );

  for (let visit = 0; visit < visits; visit++) {
    record = startVisit(record, labTower.id, NOW_MS - (visits - visit + 1) * DAY_MS);
  }

  return recordTouchdown(record, labTower.id, {
    atMs: NOW_MS - 2 * DAY_MS,
    runway: "23",
    touchdownVerticalSpeedFeetPerMinute: lastLandingFpm,
  });
};
