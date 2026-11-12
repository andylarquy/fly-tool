import { normalize } from "../utils/text";

export { editDistance, normalize, tokenSimilarity } from "../utils/text";

// Words that say "this is an airport" and nothing about which one.
const GENERIC_WORDS = new Set([
  "airport", "airfield", "airpark", "airstrip", "aerodrome", "aerodromo",
  "aeropuerto", "aeroclub", "international", "internacional", "intl",
  "field", "regional", "municipal", "county", "the", "de", "del", "la", "el",
  "los", "las", "of", "and", "y", "at",
]);


// Tokens that identify a place. When a name is nothing but generic words, they
// are kept rather than leaving nothing to match.
export const significantTokens = (text: string): string[] => {
  const tokens = normalize(text).split(" ").filter(Boolean);
  const significant = tokens.filter((token) => !GENERIC_WORDS.has(token));

  return significant.length > 0 ? significant : tokens;
};

// A phrase with at least one word that says something about *which* place.
export const hasSignificantWords = (text: string): boolean =>
  normalize(text)
    .split(" ")
    .some((token) => token !== "" && !GENERIC_WORDS.has(token));


