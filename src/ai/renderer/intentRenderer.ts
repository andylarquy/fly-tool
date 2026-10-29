import ollama, { ChatResponse } from "ollama";
import { AtcIntent } from "../../domain/AtcIntent";
import { ControllerStyle } from "../../domain/ControllerStyle";
import { MODEL, THINKING, parseModelContent } from "../modelConfig";
import { describeIntent } from "./describeIntent";
import { RenderedRemark, renderRemark } from "./remarkRenderer";
import { RENDER_SYSTEM_PROMPT, RENDER_TEMPERATURE } from "./intentRendererPrompt";

export interface RenderInput {
  callsign?: string;
  intents: AtcIntent[];
  style: ControllerStyle;
}

export interface RenderResult {
  text: string;
  response: ChatResponse;
  remarks: RenderedRemark[];
}

export const renderTransmission = async ({
  callsign,
  intents,
  style,
}: RenderInput): Promise<RenderResult | undefined> => {
  const operational = intents.filter((intent) => intent.type !== "remark");

  if (operational.length === 0) {
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
${operational.map((intent, index) => `${index + 1}. ${describeIntent(intent)}`).join("\n")}
`,
      },
    ],
    think: THINKING,
    options: { temperature: RENDER_TEMPERATURE },
  });

  const { content } = parseModelContent(response.message.content);

  const remarks = await Promise.all(
    intents.flatMap((intent) =>
      intent.type === "remark" ? [renderRemark(intent.remark.kind, style)] : [],
    ),
  );

  return {
    text: [content.trim(), ...remarks.map((remark) => remark.text)].join(" "),
    response,
    remarks,
  };
};
