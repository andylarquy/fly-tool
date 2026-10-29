import { TaxiLeg } from "../domain/Taxi";
import { DIGIT_WORDS, PHONETIC_WORDS } from "../utils/phonetic";

/*
 * Checks a spoken taxi readback against the route the engine itself issued.
 * Knowing the answer makes this a lookup, not an extraction: it needs no model.
 * English only; other languages would add their own terms here.
 */
export interface TaxiReadbackCheck {
  holdShortHeard: boolean;
  missing: string[];
  unexpected: string[];
}

const HOLD_SHORT = /\bhold(ing)?\s+short\b/;
const SPELLED_NAME = /^[A-Za-z]{1,2}\d{0,2}$/;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/x-ray/g, "xray")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

type Alternatives = string[];

const wordsFor = (character: string): Alternatives => {
  if (/\d/.test(character)) {
    return [character, DIGIT_WORDS[Number(character)]];
  }

  return PHONETIC_WORDS[character.toUpperCase()] ?? [character.toLowerCase()];
};

// Each way a taxiway name may be spoken, as a sequence of tokens.
const spokenForms = (name: string): string[][] => {
  if (!SPELLED_NAME.test(name)) {
    return [tokenize(name)];
  }

  let forms: string[][] = [[]];

  for (const character of name) {
    forms = forms.flatMap((form) => wordsFor(character).map((word) => [...form, word]));
  }

  // A lone letter is also read as the letter itself ("taxi via C").
  return name.length === 1 ? [...forms, [name.toLowerCase()]] : forms;
};

const indexOfSequence = (tokens: string[], sequence: string[], from: number): number => {
  for (let i = from; i + sequence.length <= tokens.length; i++) {
    if (sequence.every((word, offset) => tokens[i + offset] === word)) {
      return i;
    }
  }

  return -1;
};

const withoutCallsign = (tokens: string[], callsign?: string): string[] => {
  const spelled = callsign?.replace(/[^A-Za-z0-9]/g, "").split("") ?? [];

  if (spelled.length === 0) {
    return tokens;
  }

  const sequence = spelled.map((character) => wordsFor(character)[0]);
  const at = indexOfSequence(tokens, sequence, 0);

  return at === -1 ? tokens : [...tokens.slice(0, at), ...tokens.slice(at + sequence.length)];
};

const ALL_PHONETIC_WORDS = new Set(Object.values(PHONETIC_WORDS).flat());

export const checkTaxiReadback = (
  transcript: string,
  legs: TaxiLeg[],
  holdShort: string | undefined,
  callsign?: string,
): TaxiReadbackCheck => {
  const tokens = withoutCallsign(tokenize(transcript), callsign);
  const expected = legs.flatMap((leg) => (leg.kind === "taxiway" ? [leg.name] : []));

  const missing: string[] = [];
  const expectedWords = new Set<string>();
  let cursor = 0;

  for (const name of expected) {
    const forms = spokenForms(name);
    forms.flat().forEach((word) => expectedWords.add(word));

    const found = forms
      .map((form) => ({ form, at: indexOfSequence(tokens, form, cursor) }))
      .filter(({ at }) => at !== -1)
      .sort((a, b) => a.at - b.at)[0];

    if (found) {
      cursor = found.at + found.form.length;
    } else {
      missing.push(name);
    }
  }

  return {
    holdShortHeard: holdShort === undefined || HOLD_SHORT.test(tokens.join(" ")),
    missing,
    unexpected: [
      ...new Set(
        tokens.filter((word) => ALL_PHONETIC_WORDS.has(word) && !expectedWords.has(word)),
      ),
    ],
  };
};
