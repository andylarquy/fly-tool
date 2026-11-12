import { AirportEntry } from "../domain/AirportEntry";
import { AirportRef } from "../domain/FlightIntake";

const GENERIC_ENDS = /\b(international|internacional|airport|airfield|airpark|aerodrome|aerodromo|aeropuerto)\b/gi;
const LONG_NAME = 28;

const tidy = (text: string): string => text.replace(GENERIC_ENDS, " ").replace(/\s+/g, " ").trim();

// How a controller would say the airport: the short part of its name, or its
// town when the official name is a mouthful.
export const spokenName = (airport: AirportEntry): string => {
  const short = tidy(airport.name.split(" - ")[0]);
  const town = airport.municipality ? tidy(airport.municipality.replace(/\([^)]*\)/g, "")) : "";

  if (short && short.length <= LONG_NAME) {
    return short;
  }

  return town || short || airport.name;
};

export const toAirportRef = (airport: AirportEntry): AirportRef => ({
  id: airport.id,
  name: spokenName(airport),
  position: airport.position,
});
