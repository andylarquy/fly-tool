import ollama, { Message } from "ollama";
import { AircraftState } from "../domain/AircraftState";
import { AI_SYSTEM_PROMPT } from "./aiConfig"
import { formatTimestamp } from "../utils/timeFormatting"
import { MODEL, parseModelContent } from "./modelConfig"

const conversationHistory: Message[] = [];

export const getAiResponse = async (
  state: AircraftState,
  pilotTransmission: string,
) => {
  const transmissionContent = `
PILOT TRANSMISSION
${pilotTransmission}
`;

  const content = `
CURRENT AIRCRAFT STATE
This information comes directly from the simulator and is authoritative.

Callsign: LV-INQ
Latitude: ${state.latitude}
Longitude: ${state.longitude}
Altitude: ${Math.round(state.altitudeFeet)} ft
Ground speed: ${Math.round(state.groundSpeed)} kt
Heading: ${Math.round(state.trueHeading)} degrees
Pitch: ${state.pitch} degrees
Bank: ${state.bank} degrees
Vertical Speed: ${Math.round(state.verticalSpeedFeetPerMinute)} ft/min
On ground: ${state.isOnGround}
${transmissionContent}`;

  console.log(`${content}\n[${formatTimestamp(new Date())}]`);

  const userMessage: Message = { role: "user", content };

  const historyUserMessage: Message = {
    role: "user",
    content: transmissionContent,
  };

  const start = performance.now();

  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT },
      ...conversationHistory,
      userMessage,
    ],
    think: "low",
  });

  const end = performance.now();

  const answer = parseModelContent(response.message.content);

  console.log(`Inference took ${(end - start).toFixed(0)} ms`);
  console.log({
    total: response.total_duration,
    load: response.load_duration,
    promptEval: response.prompt_eval_duration,
    eval: response.eval_duration,
    promptTokens: response.prompt_eval_count,
    generatedTokens: response.eval_count,
    thinkingChars: response.message.thinking?.length ?? 0,
    contentChars: answer.length,
  });

  const historyAssistantMessage: Message = {
    role: "assistant",
    content: answer,
  };

  conversationHistory.push(historyUserMessage, historyAssistantMessage);

  return answer;
};
