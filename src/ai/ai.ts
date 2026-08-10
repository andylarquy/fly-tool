import ollama, { ChatResponse, Message } from "ollama";
import { AircraftState } from "../domain/AircraftState";
import { AI_SYSTEM_PROMPT } from "./aiConfig";
import { MODEL, THINKING, parseModelContent } from "./modelConfig";
import { AtcState } from "../domain/AtcState";
import { KNOWLEDGE_BASE } from "./knowledgeBase";

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
  aircraftSate: AircraftState,
  atcState: AtcState,
  pilotTransmission: string,
): Promise<AiResponse> => {
  const transmissionContent = formatPilotTransmission(pilotTransmission);

  const content = `
CURRENT AIRCRAFT STATE
This information comes directly from the simulator and is authoritative.

Callsign: LV-INQ
Latitude: ${aircraftSate.latitude}
Longitude: ${aircraftSate.longitude}
Altitude: ${Math.round(aircraftSate.altitudeFeet)} ft
Ground speed: ${Math.round(aircraftSate.groundSpeed)} kt
Heading: ${Math.round(aircraftSate.trueHeading)} degrees
Pitch: ${aircraftSate.pitch} degrees
Bank: ${aircraftSate.bank} degrees
Vertical Speed: ${Math.round(aircraftSate.verticalSpeedFeetPerMinute)} ft/min
On ground: ${aircraftSate.isOnGround}
${transmissionContent}

SITUATION CONTEXT
${atcState.situationContext}`;

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
