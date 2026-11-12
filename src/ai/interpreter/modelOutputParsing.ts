import { normalize, tokenSimilarity } from "../../utils/text";

export const pickEnum = <T extends string>(
  values: readonly T[],
  value: unknown,
): T | undefined => values.find((candidate) => candidate === value);

export const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

// A quote the model gives only counts if it really is in what the pilot said.
// "Really" allows for what speech and typing do to words: the model repairs a
// typo when it quotes ("runnway" comes back "runway"), and a transcript has no
// punctuation. So the words are compared one by one in order, each allowed a
// small slip by the same tolerance the airport lookup uses (long words may be
// one or two letters off, short words and numbers must match exactly). There
// is no vocabulary in it: it works the same in any language and script.
export const isQuoted = (transcript: string, quote: unknown): quote is string => {
  if (typeof quote !== "string") {
    return false;
  }

  const wanted = normalize(quote).split(" ").filter(Boolean);
  const spoken = normalize(transcript).split(" ").filter(Boolean);

  if (wanted.length === 0 || wanted.length > spoken.length) {
    return false;
  }

  for (let start = 0; start + wanted.length <= spoken.length; start++) {
    if (wanted.every((word, offset) => tokenSimilarity(word, spoken[start + offset]) > 0)) {
      return true;
    }
  }

  return false;
};
