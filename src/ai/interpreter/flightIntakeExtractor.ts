import ollama from "ollama";
import { MODEL, THINKING } from "../modelConfig";
import { isQuoted } from "./modelOutputParsing";
import {
  buildFlightIntakeSchema,
  FLIGHT_INTAKE_SYSTEM_PROMPT,
  NOT_STATED,
  OPTIONS_PROMPT,
} from "./flightIntakePrompt";

export interface FlightIntakeWords {
  destinationText?: string;
  rules?: "VFR" | "IFR";
  local: boolean;
  choice?: number;
}

// "Sierra Alpha Echo Zulu" for SAEZ: consecutive words whose first letters
// spell the code.
const isSpelledOut = (code: string, transcript: string): boolean => {
  if (!/^[A-Za-z]{3,4}$/.test(code)) {
    return false;
  }

  const initials = transcript
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");

  return initials.includes(code.toLowerCase());
};

const isGrounded = (said: string, transcript: string): boolean =>
  said !== "" &&
  said.toLowerCase() !== NOT_STATED &&
  (isQuoted(transcript, said) || isSpelledOut(said, transcript));

const withoutCallsign = (text: string, callsign?: string): string => {
  if (!callsign) {
    return text;
  }

  const escaped = callsign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text.replace(new RegExp(`[,;\\s]*${escaped}[,;.\\s]*`, "gi"), " ").trim();
};

const parse = (
  raw: string,
  transcript: string,
  callsign?: string,
  optionCount = 0,
): FlightIntakeWords | undefined => {
  try {
    const fields = JSON.parse(raw) as Record<string, unknown>;

    if (typeof fields.destination !== "string" || typeof fields.scope !== "string") {
      return undefined;
    }

    const said = withoutCallsign(fields.destination.trim(), callsign);
    // A destination has to be something the pilot actually said: the model
    // invents one when asked about a transmission that has none.
    const grounded = isGrounded(said, transcript);

    return {
      ...(grounded ? { destinationText: said } : {}),
      ...(fields.rules === "vfr" ? { rules: "VFR" as const } : {}),
      ...(fields.rules === "ifr" ? { rules: "IFR" as const } : {}),
      local: fields.scope === "local",
      ...(optionCount > 0 && typeof fields.choice === "string" && /^\d+$/.test(fields.choice) && Number(fields.choice) <= optionCount
        ? { choice: Number(fields.choice) }
        : {}),
    };
  } catch {
    return undefined;
  }
};

export const extractFlightIntake = async (
  transcript: string,
  callsign?: string,
  lastAtcTransmission?: string,
  options: string[] = [],
): Promise<FlightIntakeWords | undefined> => {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: FLIGHT_INTAKE_SYSTEM_PROMPT + (options.length > 0 ? OPTIONS_PROMPT : ""),
      },
      {
        role: "user",
        content: `\naircraft callsign (never part of the destination): ${callsign ?? "none"}\n\nLAST ATC TRANSMISSION\n${lastAtcTransmission ?? "none"}\n${
          options.length > 0
            ? `\nOPTIONS\n${options.map((name, index) => `${index + 1}. ${name}`).join("\n")}\n`
            : ""
        }\nPILOT TRANSMISSION\n${transcript}\n`,
      },
    ],
    format: buildFlightIntakeSchema(options.length),
    think: THINKING,
    options: { temperature: 0 },
  });

  return parse(response.message.content, transcript, callsign, options.length);
};
