import ollama, { ChatResponse, Message } from "ollama";
import { AI_SYSTEM_PROMPT } from "./singleCallPrompt";
import { MODEL, THINKING, parseModelContent } from "../modelConfig";
import { KNOWLEDGE_BASE } from "./knowledgeBase";
import { AtcSession } from "../../domain/SingleCallSession";

const SYSTEM_PROMPT = [
  AI_SYSTEM_PROMPT,
  "AVIATION KNOWLEDGE BASE",
  KNOWLEDGE_BASE,
].join("\n\n");

const conversationHistory: Message[] = [];

const formatPilotTransmission = (pilotTransmission: string): string => `
PILOT TRANSMISSION
${pilotTransmission}
`;

export const resetConversation = (): void => {
  conversationHistory.length = 0;
};

export const seedConversationTurn = (pilot: string, atc: string): void => {
  conversationHistory.push(
    { role: "user", content: formatPilotTransmission(pilot) },
    { role: "assistant", content: atc },
  );
};

export interface AiResponse {
  content: string;
  thinking: string;
  response: ChatResponse;
}

export const getAiResponse = async (
  atcSession: AtcSession,
  pilotTransmission: string,
): Promise<AiResponse> => {
  const { aircraftState, flightPlan } = atcSession;

  const transmissionContent = formatPilotTransmission(pilotTransmission);
  const callsignLine = flightPlan.callsign
    ? `Callsign: ${flightPlan.callsign}\n`
    : "";

  const content = `
CURRENT AIRCRAFT STATE
This information comes directly from the simulator and is authoritative.

${callsignLine}Latitude: ${aircraftState.latitude}
Longitude: ${aircraftState.longitude}
Altitude: ${aircraftState.altitudeFeet} ft
Ground speed: ${aircraftState.groundSpeed} kt
Heading: ${aircraftState.trueHeading} degrees
Pitch: ${aircraftState.pitch} degrees
Bank: ${aircraftState.bank} degrees
Vertical speed: ${aircraftState.verticalSpeedFeetPerMinute} ft/min
On ground: ${aircraftState.isOnGround}

${transmissionContent}

SITUATION CONTEXT
${atcSession.atcState.situationContext}
`;

  const userMessage: Message = { role: "user", content };

  const historyUserMessage: Message = {
    role: "user",
    content: transmissionContent,
  };

  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory,
      userMessage,
    ],
    think: THINKING,
  });

  const { content: answer, thinking } = parseModelContent(
    response.message.content,
  );

  const historyAssistantMessage: Message = {
    role: "assistant",
    content: answer,
  };

  conversationHistory.push(historyUserMessage, historyAssistantMessage);

  return {
    content: answer,
    thinking: thinking || response.message.thinking || "",
    response,
  };
};
