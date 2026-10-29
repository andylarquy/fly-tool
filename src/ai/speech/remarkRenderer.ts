import ollama from "ollama";
import { ControllerStyle } from "../../domain/ControllerStyle";
import { RemarkKind } from "../../domain/Remark";
import { MODEL, THINKING, parseModelContent } from "../modelConfig";
import {
  INVENTED_DETAIL,
  REMARK_FACTS,
  REMARK_FALLBACK,
  REMARK_FORBIDDEN,
  REMARK_MAX_WORDS,
  REMARK_SYSTEM_PROMPT,
  REMARK_TEMPERATURE,
} from "./remarkConfig";

export interface RenderedRemark {
  kind: RemarkKind;
  text: string;
  improvised: boolean;
  rejected?: string;
}

const OPERATIONAL_WORDS =
  /\b(cleared|runway|report|hold|vacate|climb|descend|maintain|contact|squawk|say)\b/i;

export const isUsableRemark = (kind: RemarkKind, text: string): boolean =>
  text.length > 0 &&
  !/\d/.test(text) &&
  !text.includes("\n") &&
  !OPERATIONAL_WORDS.test(text) &&
  !INVENTED_DETAIL.test(text) &&
  !/\p{Extended_Pictographic}/u.test(text) &&
  !(REMARK_FORBIDDEN[kind] ?? []).some((pattern) => pattern.test(text)) &&
  text.split(/\s+/).length <= REMARK_MAX_WORDS;

const tidy = (text: string): string => text.trim().replace(/^["'“”]+|["'“”]+$/g, "");

export const renderRemark = async (
  kind: RemarkKind,
  style: ControllerStyle,
): Promise<RenderedRemark> => {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: REMARK_SYSTEM_PROMPT },
      {
        role: "user",
        content: `
MOOD
${REMARK_FACTS[kind].mood}${style.strictness === "relaxed" ? ", a little playful" : ""}

FACT
${REMARK_FACTS[kind].fact}
`,
      },
    ],
    think: THINKING,
    options: { temperature: REMARK_TEMPERATURE },
  });

  const text = tidy(parseModelContent(response.message.content).content);

  return isUsableRemark(kind, text)
    ? { kind, text, improvised: true }
    : { kind, text: REMARK_FALLBACK[kind], improvised: false, rejected: text };
};
