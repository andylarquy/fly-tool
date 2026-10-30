import { AirportFrequency, FrequencyType } from "../../domain/Frequency";

/*
 * An airport's FREQUENCY entries, decoded to plain values by the code that
 * reads SimConnect's buffers. TYPE and the frequency in Hz are documented.
 */
export interface RawFrequency {
  type: number;
  frequencyHz: number;
  name: string;
}

const TYPE_BY_CODE: Record<number, FrequencyType> = {
  1: "atis",
  2: "multicom",
  3: "unicom",
  4: "ctaf",
  5: "ground",
  6: "tower",
  7: "clearance",
  8: "approach",
  9: "departure",
  10: "center",
};

const HERTZ_PER_MEGAHERTZ = 1_000_000;

// Types the engine has no use for (FSS, weather, and so on) are kept as "other"
// so nothing is lost, and unusable entries are dropped.
export const buildFrequencies = (raw: RawFrequency[]): AirportFrequency[] => {
  const seen = new Set<string>();
  const frequencies: AirportFrequency[] = [];

  for (const entry of raw) {
    if (entry.type <= 0 || !(entry.frequencyHz > 0)) {
      continue;
    }

    const type = TYPE_BY_CODE[entry.type] ?? "other";
    const frequencyMhz = Math.round((entry.frequencyHz / HERTZ_PER_MEGAHERTZ) * 1000) / 1000;
    const key = `${type}:${frequencyMhz}`;

    if (!seen.has(key)) {
      seen.add(key);
      frequencies.push({
        type,
        frequencyMhz,
        ...(entry.name.trim() ? { name: entry.name.trim() } : {}),
      });
    }
  }

  return frequencies;
};
