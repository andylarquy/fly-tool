const PHONETIC_WORD: Record<string, string> = {
  A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
  M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
  S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu",
};

const SPELLED_TAXIWAY = /^[A-Za-z]{1,2}\d{0,2}$/;

export const spokenLetter = (letter: string): string | undefined =>
  PHONETIC_WORD[letter.toUpperCase()];

// "A1" is spelled out ("Alpha 1"); a name such as "Apron" is already a word.
export const spokenTaxiway = (name: string): string =>
  SPELLED_TAXIWAY.test(name)
    ? name
        .split("")
        .map((character) => spokenLetter(character) ?? character)
        .join(" ")
    : name;
