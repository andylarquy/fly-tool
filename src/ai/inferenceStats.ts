import { ChatResponse } from "ollama";

const NANOSECONDS_PER_SECOND = 1e9;

const toSeconds = (nanoseconds: number): string =>
  (nanoseconds / NANOSECONDS_PER_SECOND).toFixed(2);

export const formatInferenceStats = (response: ChatResponse): string => {
  const generationSeconds = response.eval_duration / NANOSECONDS_PER_SECOND;
  const generationRate = response.eval_count / generationSeconds;

  const rows: [string, string][] = [
    ["Total", `${toSeconds(response.total_duration)} s`],
    ["Model load", `${toSeconds(response.load_duration)} s`],
    ["Prompt eval", `${toSeconds(response.prompt_eval_duration)} s`],
    ["Generation", `${toSeconds(response.eval_duration)} s`],
    ["Prompt tokens", response.prompt_eval_count.toLocaleString("en-US")],
    ["Generated tokens", response.eval_count.toLocaleString("en-US")],
    ["Generation rate", `${generationRate.toFixed(1)} tok/s`],
  ];

  const labelWidth = Math.max(...rows.map(([label]) => label.length + 1));

  return rows
    .map(([label, value]) => `${`${label}:`.padEnd(labelWidth)} ${value}`)
    .join("\n");
};
