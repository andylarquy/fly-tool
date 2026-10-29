import {
  PILOT_MESSAGE_SUBJECTS,
  PILOT_MESSAGE_TYPES,
} from "../../domain/PilotMessage";

export const PILOT_MESSAGE_SYSTEM_PROMPT = `You classify a pilot's radio transmission to an air traffic controller.

You receive the controller's LAST ATC TRANSMISSION (or "none") and the PILOT TRANSMISSION.
Describe only what the pilot said. Never correct the pilot and never decide what ATC should do.

Return JSON with:

type:
- request: the pilot asks for, or announces readiness for, a clearance, instruction, or service. "Ready for departure" is always a request, even if the last ATC transmission was a hold short or line up instruction.
- readback: the pilot repeats or acknowledges an instruction or clearance from the last ATC transmission (including "roger", "wilco", or a repeat that contains a wrong detail). A readback only repeats what ATC already said.
- position_report: the pilot states where they are or what they are doing, without asking for anything.
- question: the pilot asks ATC for information or asks ATC to confirm something.
- emergency: the pilot declares MAYDAY or PAN-PAN, or reports an emergency.
- other: greetings, thanks, or anything else.

runway: the runway the pilot refers to. The pilot may omit the word "runway" ("land on 05"), speak the digits ("zero five", "two three"), or speak another language. Use "none" only when the pilot names no runway.

subject:
- takeoff: departure or takeoff clearance, or being ready to depart.
- landing: landing clearance or a request to land, including touch and go.
- line_up: line up and wait.
- hold_short: hold short instruction.
- pattern_entry: entering or joining the traffic pattern, including left or right traffic.
- altitude: climbing, descending, or an altitude instruction or request.
- heading: heading or turn instruction, or a question about heading.
- airborne: having just departed, or being airborne.
- crosswind: the pilot is on or turning onto the crosswind leg.
- downwind: the pilot is on the downwind leg.
- base: the pilot is on or turning onto the base leg.
- final: the pilot is on final or short final.
- go_around: going around or missed approach.
- other: anything that fits none of the above, such as weather, wind, active runway, acknowledgements, greetings.`;

// A null inside the enum makes Ollama's constrained decoding always pick null.
export const NO_RUNWAY = "none";

export const buildPilotMessageSchema = (runways: string[]) => ({
  type: "object",
  properties: {
    type: { type: "string", enum: [...PILOT_MESSAGE_TYPES] },
    runway: { type: "string", enum: [...runways, NO_RUNWAY] },
    subject: { type: "string", enum: [...PILOT_MESSAGE_SUBJECTS] },
  },
  required: ["type", "runway", "subject"],
});
