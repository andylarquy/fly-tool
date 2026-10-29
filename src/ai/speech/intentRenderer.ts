import ollama, { ChatResponse } from "ollama";
import { AtcIntent } from "../../domain/AtcIntent";
import { ControllerStyle } from "../../domain/ControllerStyle";
import { MODEL, THINKING, parseModelContent } from "../modelConfig";
import { describeIntent } from "./describeIntent";
import { RENDER_SYSTEM_PROMPT, RENDER_TEMPERATURE } from "./rendererConfig";

export interface RenderInput {
  callsign?: string;
  intents: AtcIntent[];
  style: ControllerStyle;
}

export interface RenderResult {
  text: string;
  response: ChatResponse;
}

export const renderTransmission = async ({
  callsign,
  intents,
  style,
}: RenderInput): Promise<RenderResult | undefined> => {
  if (intents.length === 0) {
    return undefined;
  }

  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: RENDER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `
CALLSIGN
${callsign ?? "unknown"}

STYLE
${style.strictness}

INTENTS
${intents.map((intent, index) => `${index + 1}. ${describeIntent(intent)}`).join("\n")}
`,
      },
    ],
    think: THINKING,
    options: { temperature: RENDER_TEMPERATURE },
  });

  const { content } = parseModelContent(response.message.content);

  return { text: content.trim(), response };
};
