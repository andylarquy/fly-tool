import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AirportEntry, AirportEntryType } from "../domain/AirportEntry";
import { AirportFrequency, FrequencyType } from "../domain/Frequency";
import { parseCsv } from "../utils/csv";

export const OUR_AIRPORTS_DIR = join(process.cwd(), "datasets", "ourairports");

const TYPE_BY_NAME: Record<string, AirportEntryType> = {
  large_airport: "large",
  medium_airport: "medium",
  small_airport: "small",
  heliport: "heliport",
  seaplane_base: "seaplane",
};

const FREQUENCY_BY_NAME: Record<string, FrequencyType> = {
  TWR: "tower",
  GND: "ground",
  APP: "approach",
  DEP: "departure",
  ATIS: "atis",
  CTAF: "ctaf",
  UNICOM: "unicom",
  CLD: "clearance",
};

const splitList = (text: string): string[] =>
  text.split(",").map((part) => part.trim()).filter(Boolean);

// "Buenos Aires (Ezeiza)" is both "Buenos Aires" and "Ezeiza".
const placeNames = (municipality: string): string[] => {
  const inside = [...municipality.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const outside = municipality.replace(/\([^)]*\)/g, "").trim();

  return [outside, ...inside].filter(Boolean);
};

export const directoryFilesExist = (dir = OUR_AIRPORTS_DIR): boolean =>
  existsSync(join(dir, "airports.csv")) &&
  existsSync(join(dir, "airport-frequencies.csv"));

export const buildEntries = (
  airportsCsv: string,
  frequenciesCsv: string,
): AirportEntry[] => {
  const frequencies = new Map<string, AirportFrequency[]>();

  for (const row of parseCsv(frequenciesCsv)) {
    const mhz = row.frequency_mhz === "" ? NaN : Number(row.frequency_mhz);

    if (!(mhz > 0)) {
      continue;
    }

    const list = frequencies.get(row.airport_ident) ?? [];
    list.push({
      type: FREQUENCY_BY_NAME[row.type] ?? "other",
      frequencyMhz: mhz,
      ...(row.description ? { name: row.description } : {}),
    });
    frequencies.set(row.airport_ident, list);
  }

  const entries: AirportEntry[] = [];

  for (const row of parseCsv(airportsCsv)) {
    // Closed airports and balloon ports are never a destination.
    if (row.type === "closed" || row.type === "balloonport") {
      continue;
    }

    // Number("") is 0, which would put an airport with no position at 0,0.
    const latitude = row.latitude_deg === "" ? NaN : Number(row.latitude_deg);
    const longitude = row.longitude_deg === "" ? NaN : Number(row.longitude_deg);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const codes = [row.ident, row.icao_code, row.iata_code, row.gps_code, row.local_code]
      .filter(Boolean)
      .map((code) => code.toUpperCase());

    entries.push({
      id: row.ident,
      ...(row.icao_code ? { icao: row.icao_code } : {}),
      ...(row.iata_code ? { iata: row.iata_code } : {}),
      codes: [...new Set(codes)],
      name: row.name,
      ...(row.municipality ? { municipality: row.municipality } : {}),
      country: row.iso_country,
      type: TYPE_BY_NAME[row.type] ?? "other",
      position: { latitude, longitude },
      ...(row.elevation_ft ? { elevationFeet: Number(row.elevation_ft) } : {}),
      aliases: [
        row.name,
        ...placeNames(row.municipality),
        ...splitList(row.keywords),
      ],
      frequencies: frequencies.get(row.ident) ?? [],
    });
  }

  return entries;
};

export const loadOurAirports = (dir = OUR_AIRPORTS_DIR): AirportEntry[] =>
  buildEntries(
    readFileSync(join(dir, "airports.csv"), "utf8"),
    readFileSync(join(dir, "airport-frequencies.csv"), "utf8"),
  );
