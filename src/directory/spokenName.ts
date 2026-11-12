import { AirportEntry } from "../domain/AirportEntry";
import { AirportRef } from "../domain/FlightIntake";

const GENERIC_ENDS = /\b(international|internacional|airport|airfield|airpark|aerodrome|aerodromo|aeropuerto)\b/gi;
const LONG_NAME = 28;

const tidy = (text: string): string => text.replace(GENERIC_ENDS, " ").replace(/\s+/g, " ").trim();

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// How a controller would say the airport: the short part of its name. When the
// official name is a mouthful, its town stands in only if the data also lists
// that town as a name for the airport (Córdoba's airport carries "Cordoba" as a
// keyword); otherwise the town may be a different place altogether (Carrasco
// lies in Ciudad de la Costa, but nobody calls it that) and the full name is
// the honest choice.
export const spokenName = (airport: AirportEntry): string => {
  const short = tidy(airport.name.split(" - ")[0]);

  if (short && short.length <= LONG_NAME) {
    return short;
  }

  const town = airport.municipality ? tidy(airport.municipality.replace(/\([^)]*\)/g, "")) : "";
  const townIsAName = town !== "" && airport.aliases.some((alias) => squash(alias) === squash(town)) &&
    airport.aliases.filter((alias) => squash(alias) === squash(town)).length > 1;

  return townIsAName ? town : short || airport.name;
};

export const toAirportRef = (airport: AirportEntry): AirportRef => ({
  id: airport.id,
  name: spokenName(airport),
  position: airport.position,
});
