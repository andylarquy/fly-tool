import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PilotRecord, PilotRecordStore } from "../domain/PilotRecord";

export const DEFAULT_PILOT_RECORD_DIR = join(
  process.cwd(),
  "data",
  "pilot-records",
);

const sanitizeForFilename = (pilotId: string): string =>
  pilotId.replace(/[^a-zA-Z0-9_-]/g, "_");

export class JsonPilotRecordStore implements PilotRecordStore {
  constructor(private readonly directory = DEFAULT_PILOT_RECORD_DIR) {}

  async load(pilotId: string): Promise<PilotRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.fileFor(pilotId), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }

      throw error;
    }
  }

  async save(record: PilotRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });

    const target = this.fileFor(record.pilotId);
    const temporary = `${target}.tmp`;

    await writeFile(temporary, JSON.stringify(record, null, 2));
    await rename(temporary, target);
  }

  private fileFor(pilotId: string): string {
    return join(this.directory, `${sanitizeForFilename(pilotId)}.json`);
  }
}
