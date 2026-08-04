import ollama from "ollama";
import { AircraftState } from "../domain/AircraftState";

export const getAiResponse = async (state: AircraftState) => {
  const content = `
Aircraft state:
Latitude: ${state.latitude}
Longitude: ${state.longitude}
Altitude: ${state.altitudeFeet} ft
Ground speed: ${state.groundSpeed} kt
Heading: ${state.trueHeading} degrees
Pitch: ${state.pitch} degrees
Bank: ${state.bank} degrees
Vertical Speed: ${state.verticalSpeedFeetPerMinute} ft/m
On ground: ${state.isOnGround}
`;

  console.log(content);

  const response = await ollama.chat({
    model: "qwen3:8b",
    messages: [
      {
        role: "system",
        content: `
You are an assistant which has to help understand the context of the telemetry data of an airplane.
You will receive all the raw data, and you will respond the heading, the altitude, and some short summary of what the airplane is doing.
For example:
You recieve as an input: 

\`Aircraft state:
Latitude: x
Longitude: y
Altitude: 3000 ft
Ground speed: 100 kt
Heading: 180 degrees
Pitch: 2 degrees
Bank: 20 degrees
Vertical Speed: -100 ft/m
On ground: no\`

Then your answer is: "You're flying at 3000ft heading 180, the airplane is turning to the right"

Do not explain your reasoning.
      `,
      },
      {
        role: "user",
        content,
      },
    ],
    think: false,
  });

  return response.message.content;
};
