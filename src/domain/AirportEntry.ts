import { AirportFrequency } from "./Frequency";
import { GeoPoint } from "./GeoPoint";

export type AirportEntryType =
  | "large"
  | "medium"
  | "small"
  | "heliport"
  | "seaplane"
  | "other";

// A known airport, as listed in a data set: enough to recognise it by name and
// to know where it is. Not the runway/taxi model the engine uses at an airport.
export interface AirportEntry {
  id: string;
  icao?: string;
  iata?: string;
  codes: string[];
  name: string;
  municipality?: string;
  country: string;
  type: AirportEntryType;
  position: GeoPoint;
  elevationFeet?: number;
  aliases: string[];
  frequencies: AirportFrequency[];
}
