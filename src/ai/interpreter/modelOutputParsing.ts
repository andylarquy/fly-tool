export const pickEnum = <T extends string>(
  values: readonly T[],
  value: unknown,
): T | undefined => values.find((candidate) => candidate === value);

export const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

// A quote the model gives only counts if it really is in what the pilot said.
// A plain substring test, so it holds in any language.
export const isQuoted = (transcript: string, quote: unknown): quote is string =>
  typeof quote === "string" &&
  quote.trim().length > 0 &&
  transcript.toLowerCase().includes(quote.trim().toLowerCase());
