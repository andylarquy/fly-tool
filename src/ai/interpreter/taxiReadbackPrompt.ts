export const TAXI_READBACK_SYSTEM_PROMPT = `You compare a pilot's radio transmission with a taxi instruction that air traffic control just gave.

You receive the EXPECTED TAXI INSTRUCTION (the taxiways to follow, written as a name and how it is spoken, and the runway to hold short of, if any) and the PILOT TRANSMISSION.
Judge only what the pilot said. The language may be English or another language, and taxiway names may be spoken phonetically ("Alpha", "Alfa"), as letters, or with digits ("Alpha one").

Return JSON with:

- readsBack: the PILOT TRANSMISSION is the pilot's reply to this instruction. It reads back if it repeats or acknowledges any part of the instruction: a bare "roger" or "wilco" counts, and so does repeating only the destination or part of the route. It does not read back if the pilot is asking for something (a request or a question) or says something unrelated.
- holdShortQuote: the exact words from the PILOT TRANSMISSION in which the pilot says to hold, stop, or wait before the runway. The runway number or the word "runway" alone is NOT enough: the words must express holding or stopping short of it. Use an empty string if the pilot did not say that. Never invent words.
- taxiwayMentions: one entry for each taxiway name the pilot actually said, in order.
  - said: the exact words the pilot used for that taxiway.
  - matches: which expected taxiway it is, using the name exactly as written in the expected instruction, or "other" if it is not one of the expected taxiways.
  Runway numbers, parking names, and the aircraft callsign are not taxiways. If the pilot named no taxiway, return an empty list. Never list a taxiway the pilot did not say.`;

export const OTHER_TAXIWAY = "other";

export const buildTaxiReadbackSchema = (expectedNames: string[]) => ({
  type: "object",
  properties: {
    readsBack: { type: "boolean" },
    holdShortQuote: { type: "string" },
    taxiwayMentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          said: { type: "string" },
          matches: { type: "string", enum: [...expectedNames, OTHER_TAXIWAY] },
        },
        required: ["said", "matches"],
      },
    },
  },
  required: ["readsBack", "holdShortQuote", "taxiwayMentions"],
});
