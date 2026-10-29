import {
  EMERGENCY_INTENTIONS,
  EMERGENCY_NATURES,
  EMERGENCY_URGENCIES,
} from "../../domain/Emergency";

export const NOT_STATED = "none";

export const EMERGENCY_DETAILS_SYSTEM_PROMPT = `You extract emergency details from a pilot's radio transmission to an air traffic controller.

You receive the PILOT TRANSMISSION.
Fill each field only from what the pilot said. Use "none" (or 0 for numbers) for anything the pilot did not say. Never infer or guess.

- urgency: mayday for MAYDAY or a declared emergency or distress, pan_pan for PAN-PAN.
- nature: engine_failure (including a failed or rough running engine), fire (including smoke), medical, fuel, electrical, other.
- intention: what the pilot says they will do next. land_at_airport ("returning to the field", "back to the airport", "request priority landing"), land_ahead (landing straight ahead or off airport), other. Describing the problem, an altitude, or a position is not an intention: use "none" unless the pilot clearly says what they will do.
- soulsOnBoard: the number of persons on board ("souls", "POB").
- fuelEnduranceMinutes: the remaining fuel endurance in minutes (convert hours to minutes).`;

export const EMERGENCY_DETAILS_SCHEMA = {
  type: "object",
  properties: {
    urgency: { type: "string", enum: [NOT_STATED, ...EMERGENCY_URGENCIES] },
    nature: { type: "string", enum: [NOT_STATED, ...EMERGENCY_NATURES] },
    intention: { type: "string", enum: [NOT_STATED, ...EMERGENCY_INTENTIONS] },
    soulsOnBoard: { type: "integer" },
    fuelEnduranceMinutes: { type: "integer" },
  },
  required: ["urgency", "nature", "intention", "soulsOnBoard", "fuelEnduranceMinutes"],
};
