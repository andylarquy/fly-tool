import { BenchmarkEvaluation, BenchmarkExpectations } from "./benchmarkTypes";

export function evaluateResponse(
  response: string,
  expectations: BenchmarkExpectations,
): BenchmarkEvaluation {
  const failures: string[] = [];

  const normalized = response.trim().toLowerCase();

  if (expectations.responseRequired && !normalized) {
    failures.push("Expected an ATC response, but received an empty response.");
  }

  if (!expectations.responseRequired && normalized !== "[no response]") {
    failures.push(`Expected [NO RESPONSE], but received: "${response.trim()}"`);
  }

  for (const concept of expectations.requiredConcepts ?? []) {
    if (!normalized.includes(concept.toLowerCase())) {
      failures.push(`Missing required concept: "${concept}"`);
    }
  }

  for (const pattern of expectations.forbiddenPatterns ?? []) {
    if (normalized.includes(pattern.toLowerCase())) {
      failures.push(`Contains forbidden pattern: "${pattern}"`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
