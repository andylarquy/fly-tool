import { AtcIntent } from "../../domain/AtcIntent";
import { TaxiDestination, TaxiInstructionReason } from "../../domain/Taxi";
import {
  EmergencyNature,
  EmergencyQuestion,
  EmergencyUrgency,
} from "../../domain/Emergency";

const fields = (entries: [string, string | number | boolean | undefined][]): string =>
  entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" | ");

const NATO: Record<string, string> = {
  A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
  M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
  S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu",
};

export const spokenTaxiway = (name: string): string =>
  name
    .split("")
    .map((character) => NATO[character.toUpperCase()] ?? character)
    .join(" ");

const TAXI_LEAD_IN: Partial<Record<TaxiInstructionReason, string>> = {
  readback_error: "Negative.",
  off_route: "You are off the assigned route.",
};

const taxiSentence = (
  destination: TaxiDestination,
  taxiways: string[],
  holdShort?: string,
): string => {
  const where =
    destination.kind === "runway" ? `runway ${destination.runway}` : destination.name;
  const via = taxiways.length > 0 ? ` via ${taxiways.map(spokenTaxiway).join(", ")}` : "";
  const hold = holdShort ? `, hold short runway ${holdShort}` : "";

  return `Taxi to ${where}${via}${hold}.`;
};

const URGENCY_WORDS: Record<EmergencyUrgency, string> = {
  mayday: "MAYDAY",
  pan_pan: "PAN-PAN",
};

const NATURE_WORDS: Record<EmergencyNature, string | undefined> = {
  engine_failure: "engine failure",
  fire: "fire",
  medical: "medical emergency",
  fuel: "fuel emergency",
  electrical: "electrical failure",
  other: undefined,
};

const emergencyQuestions = (ask: EmergencyQuestion[]): string => {
  const sentences: string[] = [];

  if (ask.includes("nature")) sentences.push("Say nature of emergency.");
  if (ask.includes("intention")) sentences.push("Say intentions.");

  if (ask.includes("souls") && ask.includes("fuel")) {
    sentences.push("Say souls on board and fuel remaining.");
  } else if (ask.includes("souls")) {
    sentences.push("Say souls on board.");
  } else if (ask.includes("fuel")) {
    sentences.push("Say fuel remaining.");
  }

  return sentences.join(" ") || "none";
};

const words = (value: string): string => value.replace(/_/g, " ");

// Only speakable values go to the model; internal ones such as the touchdown
// rate stay out so it cannot read them on the radio.
export const describeIntent = (intent: AtcIntent): string => {
  switch (intent.type) {
    case "issue_clearance":
      return fields([
        ["intent", "issue_clearance"],
        ["clearance", intent.clearance],
        ["runway", intent.runway],
        ["then_report", intent.expectReport],
      ]);
    case "instruct":
      return fields([
        ["intent", `instruct_${intent.instruction}`],
        ["runway", intent.runway],
        ["traffic_side", intent.patternSide],
        ["altitude_feet", intent.altitudeFeetAgl],
        ["report", intent.expectReport],
      ]);
    case "correct_readback":
      return fields([
        ["intent", "correct_readback"],
        ["clearance", intent.clearance],
        ["runway", intent.runway],
      ]);
    case "advise":
      return fields([
        ["intent", `advise_${intent.topic}`],
        ["value", intent.value],
      ]);
    case "query":
      return fields([
        ["intent", `query_${intent.query}`],
        ["pilot_said", intent.claimed],
        ["we_observe", intent.observed && words(intent.observed)],
      ]);
    case "taxi_instruction":
      return fields([
        ["intent", "taxi_instruction"],
        ["lead_in", TAXI_LEAD_IN[intent.reason]],
        ["text", taxiSentence(intent.destination, intent.taxiways, intent.holdShort)],
      ]);
    case "remark":
      return fields([["intent", "remark"], ["kind", intent.remark.kind]]);
    case "acknowledge":
      return fields([["intent", `acknowledge_${intent.kind}`]]);
    case "unable":
      return fields([["intent", "unable"]]);
    case "emergency_response":
      return fields([
        ["intent", "emergency_response"],
        ["urgency", URGENCY_WORDS[intent.urgency]],
        ["nature", intent.nature && NATURE_WORDS[intent.nature]],
        ["questions", emergencyQuestions(intent.ask)],
      ]);
  }
};
