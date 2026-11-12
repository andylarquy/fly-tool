import ollama from "ollama";
import { TaxiLeg } from "../../domain/Taxi";
import { TaxiReadbackJudgement } from "../../domain/PilotMessage";
import { spokenLetter, spokenTaxiway } from "../../utils/phonetic";
import { MODEL, THINKING } from "../modelConfig";
import { isQuoted } from "./modelOutputParsing";
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
  expectedRunway?: string;
  callsign?: string;
  knownNonTaxiways?: string[];
}

// A mention that is really the destination or a runway, which the engine knows
// from its own data, is not a wrong taxiway.
const namesKnownNonTaxiway = (said: string, known: string[]): boolean =>
  known.some(
    (text) => text.trim().length > 0 && (isQuoted(text, said) || isQuoted(said, text)),
  );

const designator = (text: string): string | undefined => {
  const match = /^\s*0*(\d{1,2})\s*([LRClrc]?)\s*$/.exec(text);

  return match ? `${match[1].padStart(2, "0")}${match[2].toUpperCase()}` : undefined;
};

// A runway number is data, so it is compared as data: only when the model's
// quote really is in the transcript, and only against the runway we issued.
const isWrongRunway = (
  fields: Record<string, unknown>,
  transcript: string,
  expectedRunway?: string,
): boolean => {
  const said = typeof fields.runway === "string" ? designator(fields.runway) : undefined;
  const expected = expectedRunway ? designator(expectedRunway) : undefined;

  return (
    said !== undefined &&
    expected !== undefined &&
    isQuoted(transcript, fields.runwayQuote) &&
    said !== expected
  );
};

const parseJudgement = (
  raw: string,
  transcript: string,
  expected: string[],
  knownNonTaxiways: string[],
  expectedRunway?: string,
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
      runwayMismatch: isWrongRunway(fields, transcript, expectedRunway),
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
  expectedRunway,
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
  ], expectedRunway);
};
