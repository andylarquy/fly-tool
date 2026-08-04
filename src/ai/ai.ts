import ollama, { Message } from "ollama";
import { AircraftState } from "../domain/AircraftState";
import { AI_SYSTEM_PROMPT } from "./aiConfig"

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

  console.log(content);

  // Sent to the model this turn only: fresh telemetry + the transmission.
  const userMessage: Message = { role: "user", content };

  // Stored in history: the transmission alone, so past telemetry snapshots
  // don't accumulate in the context window.
  const historyUserMessage: Message = {
    role: "user",
    content: transmissionContent,
  };

  const response = await ollama.chat({
    model: "qwen3:8b",
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT },
      ...conversationHistory,
      userMessage,
    ],
    think: false,
  });

  conversationHistory.push(historyUserMessage, response.message);

  return response.message.content;
};
