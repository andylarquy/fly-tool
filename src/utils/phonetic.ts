export const PHONETIC_WORDS: Record<string, string[]> = {
  A: ["alpha", "alfa"],
  B: ["bravo"],
  C: ["charlie"],
  D: ["delta"],
  E: ["echo"],
  F: ["foxtrot"],
  G: ["golf"],
  H: ["hotel"],
  I: ["india"],
  J: ["juliett", "juliet"],
  K: ["kilo"],
  L: ["lima"],
  M: ["mike"],
  N: ["november"],
  O: ["oscar"],
  P: ["papa"],
  Q: ["quebec"],
  R: ["romeo"],
  S: ["sierra"],
  T: ["tango"],
  U: ["uniform"],
  V: ["victor"],
  W: ["whiskey", "whisky"],
  X: ["xray"],
  Y: ["yankee"],
  Z: ["zulu"],
};

export const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

const capitalized = (word: string): string => word[0].toUpperCase() + word.slice(1);

export const spokenLetter = (letter: string): string | undefined => {
  const word = PHONETIC_WORDS[letter.toUpperCase()]?.[0];

  return word && (word === "xray" ? "X-ray" : capitalized(word));
};
