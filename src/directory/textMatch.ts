// Words that say "this is an airport" and nothing about which one.
const GENERIC_WORDS = new Set([
  "airport", "airfield", "airpark", "airstrip", "aerodrome", "aerodromo",
  "aeropuerto", "aeroclub", "international", "internacional", "intl",
  "field", "regional", "municipal", "county", "the", "de", "del", "la", "el",
  "los", "las", "of", "and", "y", "at",
]);

export const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

export const editDistance = (a: string, b: string, limit: number): number => {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);

      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > limit) {
      return limit + 1;
    }

    previous = current;
  }

  return previous[b.length];
};

// 1 for equal tokens, less for a near miss ("eseiza" for "ezeiza"), 0 otherwise.
export const tokenSimilarity = (query: string, candidate: string): number => {
  if (query === candidate) {
    return 1;
  }

  const longest = Math.max(query.length, candidate.length);
  const limit = longest >= 8 ? 2 : longest >= 4 ? 1 : 0;

  if (limit === 0) {
    return 0;
  }

  const distance = editDistance(query, candidate, limit);

  return distance <= limit ? 1 - distance / longest : 0;
};
