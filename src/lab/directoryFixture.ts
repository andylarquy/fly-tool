import { AirportEntry } from "../domain/AirportEntry";
import { AirportDirectory } from "../directory/airportDirectory";
import { labAirport } from "./airports";

const entry = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  aliases: string[] = [name],
  type: AirportEntry["type"] = "medium",
): AirportEntry => ({
  id,
  codes: [id],
  name,
  country: "ZZ",
  type,
  position: { latitude, longitude },
  aliases,
  frequencies: [],
});

// Fictional airports around the Lab Field, so the destination dialogue can be
// tested without the real data set. Harbor Field is about 60 nm east.
export const labDirectory = new AirportDirectory([
  entry(labAirport.icao, "Lab Field Airport", labAirport.position.latitude, labAirport.position.longitude, [
    "Lab Field Airport",
    "Lab Field",
  ]),
  entry("SAEZ", "Ezeiza International Airport", -34.7, -58.4, ["Ezeiza International Airport", "Ezeiza"]),
  entry("SZHF", "Harbor Field Airport", -34.45, -57.5, ["Harbor Field Airport", "Harbor Field", "Harbor"]),
  entry("ZZZX", "Hillside Airport", -33.4, -58.9, ["Hillside Airport", "Hillside"], "small"),
  entry("ZZR1", "Rivera Norte Airport", -34.0, -57.9, ["Rivera Norte Airport", "Rivera Norte", "Rivera"]),
  entry("ZZR2", "Rivera Sur Airport", -34.1, -58.0, ["Rivera Sur Airport", "Rivera Sur", "Rivera"]),
]);
