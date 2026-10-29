import ollama from "ollama";
import {
  EMERGENCY_INTENTIONS,
  EMERGENCY_NATURES,
  EMERGENCY_URGENCIES,
  EmergencyDetails,
} from "../../domain/Emergency";
import { MODEL, THINKING } from "../modelConfig";
import {
  EMERGENCY_DETAILS_SCHEMA,
  EMERGENCY_DETAILS_SYSTEM_PROMPT,
} from "./emergencyDetailsConfig";
import { pickEnum, positiveInteger } from "./parsing";

const parseEmergencyDetails = (raw: string): EmergencyDetails | undefined => {
  try {
    const fields = JSON.parse(raw) as Record<string, unknown>;

    const stated = Object.fromEntries(
      Object.entries({
        urgency: pickEnum(EMERGENCY_URGENCIES, fields.urgency),
        nature: pickEnum(EMERGENCY_NATURES, fields.nature),
        intention: pickEnum(EMERGENCY_INTENTIONS, fields.intention),
        soulsOnBoard: positiveInteger(fields.soulsOnBoard),
        fuelEnduranceMinutes: positiveInteger(fields.fuelEnduranceMinutes),
      }).filter(([, value]) => value !== undefined),
    );

    return Object.keys(stated).length > 0 ? stated : undefined;
  } catch {
    return undefined;
  }
};

export const extractEmergencyDetails = async (
  pilotTransmission: string,
): Promise<EmergencyDetails | undefined> => {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: EMERGENCY_DETAILS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `
PILOT TRANSMISSION
${pilotTransmission}
`,
      },
    ],
    format: EMERGENCY_DETAILS_SCHEMA,
    think: THINKING,
    options: { temperature: 0 },
  });

  return parseEmergencyDetails(response.message.content);
};
