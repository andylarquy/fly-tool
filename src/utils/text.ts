export const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Edits needed to turn one word into the other, where swapping two neighboring
// letters (the commonest typing slip) counts as one edit. Gives up, returning
// limit + 1, once it is certain the distance exceeds the limit.
export const editDistance = (a: string, b: string, limit: number): number => {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }

      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > limit) {
      return limit + 1;
    }

    beforePrevious = previous;
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
