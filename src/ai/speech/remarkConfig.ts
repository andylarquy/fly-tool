import { RemarkKind } from "../../domain/Remark";

export const REMARK_TEMPERATURE = 0.7;
export const REMARK_MAX_WORDS = 10;

// What the remark is about. The time reference is spelled out because the
// model once turned a previous visit's landing into one that just happened.
export const REMARK_FACTS: Record<RemarkKind, { fact: string; mood: string }> = {
  welcome_back: {
    fact: "The pilot has flown here before and is back at this airport.",
    mood: "friendly and welcoming",
  },
  you_again: {
    fact: "The pilot is a regular at this airport and the controller sees them all the time.",
    mood: "friendly and teasing, like greeting an old friend",
  },
  previous_firm_landing: {
    fact: "On an EARLIER visit, the pilot's landing at this airport was firm. This flight has NOT landed yet.",
    mood: "a light, good-humoured caution to land gently; not praise",
  },
  smooth_landing: {
    fact: "The pilot's landing a moment ago was very smooth.",
    mood: "praising",
  },
  firm_landing: {
    fact: "The pilot's landing a moment ago was firm.",
    mood: "gently teasing about a bump; NOT praise",
  },
};

// Used only when the improvised line fails validation.
export const REMARK_FALLBACK: Record<RemarkKind, string> = {
  welcome_back: "Welcome back.",
  you_again: "You again, welcome back.",
  previous_firm_landing: "Go easy on the landing gear this time.",
  smooth_landing: "Nice landing.",
  firm_landing: "That was a firm one.",
};

const PRAISE = /\b(nice|smooth|perfect|pro|great|beautiful|butter|graceful|flawless|silk\w*)\b/i;
const BUMP = /\b(firm|hard|rough|bump\w*|thump\w*|stomp\w*|slam\w*|crash\w*|bounce|bounc\w*)\b/i;
const TIME_NOW = /\b(just now|that was|that landing|a moment ago|moments ago)\b/i;
const TIME_PAST = /\b(last time|previous|next time|earlier)\b/i;

// Details the model likes to invent; none of them is in any fact.
export const INVENTED_DETAIL = /\b(pro|wing|hangar|promis\w*|coffee|weather|engine|fuel)\b/i;

// Checks that stop a remark from contradicting its fact: the wrong mood, or
// the wrong time reference.
export const REMARK_FORBIDDEN: Partial<Record<RemarkKind, RegExp[]>> = {
  previous_firm_landing: [TIME_NOW, PRAISE],
  smooth_landing: [TIME_PAST, BUMP],
  firm_landing: [TIME_PAST, PRAISE],
};

export const REMARK_SYSTEM_PROMPT = `You are an air traffic controller who knows this pilot. Say ONE short, natural remark over the radio about the FACT you are given, in your own words.

RULES

- One sentence, at most ${REMARK_MAX_WORDS} words.
- Match the MOOD exactly. Never praise when the mood says not to.
- Say only what the FACT says. Do not add any detail of your own (no hangars, promises, weather, aircraft, skill, or style).
- Keep the time right: an earlier visit is in the past, "a moment ago" is just now.
- Vary your wording; do not repeat stock phrases.
- Never use numbers, rates, dates, or distances.
- It is small talk: no instructions, clearances, or questions.
- Do not start with the callsign.
- Output only the sentence.`;
