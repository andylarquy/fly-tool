export const pickEnum = <T extends string>(
  values: readonly T[],
  value: unknown,
): T | undefined => values.find((candidate) => candidate === value);

export const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
