import { ChatResponse } from "ollama";

const NANOSECONDS_PER_SECOND = 1e9;

const toSeconds = (nanoseconds: number): string =>
  (nanoseconds / NANOSECONDS_PER_SECOND).toFixed(2);

export interface InferenceMetrics {
  totalSeconds: number;
  loadSeconds: number;
  promptEvalSeconds: number;
  generationSeconds: number;
  promptTokens: number;
  generatedTokens: number;
  generationRate: number;
}

export const getInferenceMetrics = (response: ChatResponse): InferenceMetrics => {
  const generationSeconds = response.eval_duration / NANOSECONDS_PER_SECOND;

  return {
    totalSeconds: response.total_duration / NANOSECONDS_PER_SECOND,
    loadSeconds: response.load_duration / NANOSECONDS_PER_SECOND,
    promptEvalSeconds: response.prompt_eval_duration / NANOSECONDS_PER_SECOND,
    generationSeconds,
    promptTokens: response.prompt_eval_count,
    generatedTokens: response.eval_count,
    generationRate: response.eval_count / generationSeconds,
  };
};

export const formatInferenceStats = (response: ChatResponse): string => {
  const metrics = getInferenceMetrics(response);

  const rows: [string, string][] = [
    ["Total", `${toSeconds(response.total_duration)} s`],
    ["Model load", `${toSeconds(response.load_duration)} s`],
    ["Prompt eval", `${toSeconds(response.prompt_eval_duration)} s`],
    ["Generation", `${toSeconds(response.eval_duration)} s`],
    ["Prompt tokens", metrics.promptTokens.toLocaleString("en-US")],
    ["Generated tokens", metrics.generatedTokens.toLocaleString("en-US")],
    ["Generation rate", `${metrics.generationRate.toFixed(1)} tok/s`],
  ];

  const labelWidth = Math.max(...rows.map(([label]) => label.length + 1));

  return rows
    .map(([label, value]) => `${`${label}:`.padEnd(labelWidth)} ${value}`)
    .join("\n");
};
