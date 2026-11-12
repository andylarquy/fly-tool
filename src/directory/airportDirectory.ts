import { AirportEntry, AirportEntryType } from "../domain/AirportEntry";
import { GeoPoint } from "../domain/GeoPoint";
import { distanceNauticalMiles } from "../utils/geo";
import { normalize, significantTokens, tokenSimilarity } from "./textMatch";

export interface AirportCandidate {
  airport: AirportEntry;
  score: number;
  nameScore: number;
  matchedOn: string;
  distanceNauticalMiles?: number;
}

export interface ShortlistOptions {
  near?: GeoPoint;
  limit?: number;
  countries?: string[];
  exclude?: string[];
}

export interface Shortlist {
  candidates: AirportCandidate[];
  confident: boolean;
}

// Size decides between airports that share a town: "Bariloche" means the
// international airport, not the aeroclub strip that also carries the name.
const TYPE_WEIGHT: Record<AirportEntryType, number> = {
  large: 1,
  medium: 0.85,
  small: 0.6,
  seaplane: 0.4,
  heliport: 0.3,
  other: 0.6,
};

const PROXIMITY_SCALE_NM = 150;
// An airport far away keeps at least this share of its score, so distance can
// settle a tie between same-named airports but never erases a good match.
const PROXIMITY_FLOOR = 0.5;
// How well the words matched, before size and distance are weighed in: a small
// airstrip that is the only one with its name is still a confident match.
const CONFIDENT_NAME_SCORE = 0.75;
// The runner-up has to score at most this share of the best: a relative test,
// because distance scales every score down and shrinks absolute gaps.
const CONFIDENT_RATIO = 0.8;
const MINIMUM_SCORE = 0.5;
const DEFAULT_LIMIT = 5;

// A same-named airport this much farther away than the best match, and by at
// least this many miles, is not a serious rival: nobody means Santa Fe, New
// Mexico from Buenos Aires.
const FAR_RIVAL_RATIO = 2;
const FAR_RIVAL_EXTRA_NM = 100;

interface IndexedAirport {
  airport: AirportEntry;
  codes: Set<string>;
  aliases: { text: string; tokens: string[] }[];
}

const ICAO_LIKE = /^[a-z]{4}$/;
const IATA_LIKE = /^[a-z]{3}$/;

// How well the words of a query match the words of one name. Every query word
// has to match something, so "buenos aires" does not match "aires".
const nameScore = (queryTokens: string[], nameTokens: string[]): number => {
  let total = 0;

  for (const query of queryTokens) {
    const best = Math.max(...nameTokens.map((token) => tokenSimilarity(query, token)));

    if (best === 0) {
      return 0;
    }

    total += best;
  }

  const similarity = total / queryTokens.length;
  const coverage = Math.min(1, queryTokens.length / nameTokens.length);

  return similarity * (0.75 + 0.25 * coverage);
};

const isFarRival = (best: AirportCandidate, rival: AirportCandidate): boolean =>
  best.distanceNauticalMiles !== undefined &&
  rival.distanceNauticalMiles !== undefined &&
  rival.distanceNauticalMiles >= best.distanceNauticalMiles * FAR_RIVAL_RATIO &&
  rival.distanceNauticalMiles - best.distanceNauticalMiles >= FAR_RIVAL_EXTRA_NM;

export class AirportDirectory {
  private readonly indexed: IndexedAirport[];

  constructor(airports: AirportEntry[]) {
    this.indexed = airports.map((airport) => ({
      airport,
      codes: new Set(airport.codes.map((code) => code.toLowerCase())),
      aliases: [...new Set(airport.aliases)]
        .map((text) => ({ text, tokens: significantTokens(text) }))
        .filter((alias) => alias.tokens.length > 0),
    }));
  }

  get size(): number {
    return this.indexed.length;
  }

  byCode(code: string): AirportEntry | undefined {
    const wanted = code.trim().toLowerCase();

    return this.indexed.find((entry) => entry.codes.has(wanted))?.airport;
  }

  shortlist(spoken: string, options: ShortlistOptions = {}): Shortlist {
    const queryTokens = significantTokens(spoken);
    const query = normalize(spoken);
    const limit = options.limit ?? DEFAULT_LIMIT;

    if (queryTokens.length === 0) {
      return { candidates: [], confident: false };
    }

    const asCode = query.replace(/ /g, "");
    const codeLike = ICAO_LIKE.test(asCode) || IATA_LIKE.test(asCode);
    const candidates: AirportCandidate[] = [];

    for (const entry of this.indexed) {
      if (
        (options.countries && !options.countries.includes(entry.airport.country)) ||
        options.exclude?.includes(entry.airport.id)
      ) {
        continue;
      }

      let score = 0;
      let matchedOn = "";

      if (codeLike && entry.codes.has(asCode)) {
        score = ICAO_LIKE.test(asCode) ? 1 : 0.95;
        matchedOn = asCode.toUpperCase();
      }

      for (const alias of entry.aliases) {
        const aliasScore = nameScore(queryTokens, alias.tokens);

        if (aliasScore > score) {
          score = aliasScore;
          matchedOn = alias.text;
        }
      }

      if (score < MINIMUM_SCORE) {
        continue;
      }

      const distance = options.near
        ? distanceNauticalMiles(options.near, entry.airport.position)
        : undefined;
      const proximity = distance === undefined ? 0 : 1 / (1 + distance / PROXIMITY_SCALE_NM);

      candidates.push({
        airport: entry.airport,
        score:
          score *
          TYPE_WEIGHT[entry.airport.type] *
          (options.near ? PROXIMITY_FLOOR + (1 - PROXIMITY_FLOOR) * proximity : 1),
        nameScore: score,
        matchedOn,
        ...(distance === undefined ? {} : { distanceNauticalMiles: distance }),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, limit);

    const [first, ...rivals] = top;
    const confident =
      first !== undefined &&
      first.nameScore >= CONFIDENT_NAME_SCORE &&
      rivals
        .filter((rival) => !isFarRival(first, rival))
        .every((rival) => rival.score <= first.score * CONFIDENT_RATIO);

    return { candidates: top, confident };
  }
}
