import ollama from "ollama";

export const getAiResponse = async (content: string) => {
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
\`Lat x  Lon y |
Alt 3000ft  GS 100kt |
HDG 180  Pitch 2 |
Bank 20  Ground: no\`

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

