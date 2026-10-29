import ollama from "ollama";
import { TaxiLeg } from "../../domain/Taxi";
import { TaxiReadbackJudgement } from "../../domain/PilotMessage";
import { spokenLetter, spokenTaxiway } from "../../utils/phonetic";
import { MODEL, THINKING } from "../modelConfig";
import {
  buildTaxiReadbackSchema,
  OTHER_TAXIWAY,
  TAXI_READBACK_SYSTEM_PROMPT,
} from "./taxiReadbackPrompt";

export interface TaxiReadbackInput {
  transcript: string;
  legs: TaxiLeg[];
  holdShort?: string;
  destination?: string;
  callsign?: string;
  knownNonTaxiways?: string[];
}

// A quote only counts if it really is in what the pilot said. That is a plain
// substring test, so it holds in any language.
const isQuoted = (transcript: string, quote: unknown): quote is string =>
  typeof quote === "string" &&
  quote.trim().length > 0 &&
  transcript.toLowerCase().includes(quote.trim().toLowerCase());

// A mention that is really the destination or a runway, which the engine knows
// from its own data, is not a wrong taxiway.
const namesKnownNonTaxiway = (said: string, known: string[]): boolean => {
  const spoken = said.trim().toLowerCase();

  return known.some((text) => {
    const data = text.trim().toLowerCase();

    return data.length > 0 && (spoken.includes(data) || data.includes(spoken));
  });
};

const parseJudgement = (
  raw: string,
  transcript: string,
  expected: string[],
  knownNonTaxiways: string[],
): TaxiReadbackJudgement | undefined => {
  try {
    const fields = JSON.parse(raw) as Record<string, unknown>;
    const mentions = fields.taxiwayMentions;

    if (typeof fields.readsBack !== "boolean" || !Array.isArray(mentions)) {
      return undefined;
    }

    const quoted = (mentions as Record<string, unknown>[]).filter(
      (mention) =>
        isQuoted(transcript, mention.said) &&
        typeof mention.matches === "string" &&
        (mention.matches === OTHER_TAXIWAY || expected.includes(mention.matches)) &&
        !(mention.matches === OTHER_TAXIWAY && namesKnownNonTaxiway(mention.said as string, knownNonTaxiways)),
    );

    return {
      readsBack: fields.readsBack,
      holdShortRepeated: isQuoted(transcript, fields.holdShortQuote),
      taxiwaysRepeated: [
        ...new Set(
          quoted.map((mention) => mention.matches as string).filter((name) => name !== OTHER_TAXIWAY),
        ),
      ],
      mentionsOtherTaxiway: quoted.some((mention) => mention.matches === OTHER_TAXIWAY),
    };
  } catch {
    return undefined;
  }
};

const spokenCallsign = (callsign: string): string =>
  callsign
    .replace(/[^A-Za-z0-9]/g, "")
    .split("")
    .map((character) => spokenLetter(character) ?? character)
    .join(" ");

export const verifyTaxiReadback = async ({
  transcript,
  legs,
  holdShort,
  destination,
  callsign,
  knownNonTaxiways = [],
}: TaxiReadbackInput): Promise<TaxiReadbackJudgement | undefined> => {
  const expected = legs.flatMap((leg) => (leg.kind === "taxiway" ? [leg.name] : []));
  const route =
    expected.length > 0
      ? expected.map((name) => `${name} (spoken: ${spokenTaxiway(name)})`).join(", ")
      : "none";

  const response = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "system", content: TAXI_READBACK_SYSTEM_PROMPT },
      {
        role: "user",
        content: `
EXPECTED TAXI INSTRUCTION
taxiways: ${route}
hold short of runway: ${holdShort ?? "none"}
destination (not a taxiway): ${destination ?? "none"}
aircraft callsign (not a taxiway): ${callsign ?? "none"}

PILOT TRANSMISSION
${transcript}
`,
      },
    ],
    format: buildTaxiReadbackSchema(expected),
    think: THINKING,
    options: { temperature: 0 },
  });

  return parseJudgement(response.message.content, transcript, expected, [
    ...knownNonTaxiways,
    ...(callsign ? [callsign, spokenCallsign(callsign)] : []),
  ]);
};
