import ollama, { ChatResponse } from "ollama";
import {
  buildPilotMessageSchema,
  NO_RUNWAY,
  PILOT_MESSAGE_SYSTEM_PROMPT,
} from "./classifierConfig";
import { MODEL, THINKING } from "../modelConfig";
import {
  PILOT_MESSAGE_SUBJECTS,
  PILOT_MESSAGE_TYPES,
  PilotMessage,
} from "../../domain/PilotMessage";

export interface ClassificationResult {
  message: PilotMessage | undefined;
  raw: string;
  response: ChatResponse;
}

const parsePilotMessage = (raw: string): PilotMessage | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }

    const { type, runway, subject } = parsed as Record<string, unknown>;

    const validType = PILOT_MESSAGE_TYPES.find((t) => t === type);
    const validSubject = PILOT_MESSAGE_SUBJECTS.find((s) => s === subject);

    return validType && validSubject && typeof runway === "string"
      ? {
          type: validType,
          runway: runway === NO_RUNWAY ? null : runway,
          subject: validSubject,
        }
      : undefined;
  } catch {
    return undefined;
  }
};

export interface ClassificationInput {
  pilotTransmission: string;
  lastAtcTransmission?: string;
  runways: string[];
}

export const classifyPilotMessage = async ({
  pilotTransmission,
  lastAtcTransmission,
  runways,
}: ClassificationInput): Promise<ClassificationResult> => {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `${PILOT_MESSAGE_SYSTEM_PROMPT}\n\nRunways at this airport: ${runways.join(", ")}.`,
      },
      {
        role: "user",
        content: `
LAST ATC TRANSMISSION
${lastAtcTransmission ?? "none"}

PILOT TRANSMISSION
${pilotTransmission}
`,
      },
    ],
    format: buildPilotMessageSchema(runways),
    think: THINKING,
    options: { temperature: 0 },
  });

  const raw = response.message.content;

  return { message: parsePilotMessage(raw), raw, response };
};
