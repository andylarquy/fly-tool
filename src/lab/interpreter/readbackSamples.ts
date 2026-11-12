import { TaxiReadbackJudgement } from "../../domain/PilotMessage";

export interface ReadbackSample {
  transcript: string;
  taxiways: string[];
  holdShort?: string;
  destination?: string;
  expected: TaxiReadbackJudgement;
}

const verdict = (
  readsBack: boolean,
  holdShortRepeated: boolean,
  taxiwaysRepeated: string[],
  mentionsOtherTaxiway = false,
  runwayMismatch = false,
): TaxiReadbackJudgement => ({
  readsBack,
  holdShortRepeated,
  taxiwaysRepeated,
  mentionsOtherTaxiway,
  runwayMismatch,
});

const CAB = ["C", "A", "B"];

export const readbackSamples: ReadbackSample[] = [
  {
    transcript: "Taxi to runway 23 via Charlie, Alpha, Bravo, hold short runway 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Taxi to runway 23 via Charlie, Alpha, Bravo, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, false, CAB),
  },
  {
    transcript: "Taxi via Charlie, Bravo, hold short runway 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, ["C", "B"]),
  },
  {
    transcript: "Taxi via Charlie, Delta, Bravo, hold short runway 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, ["C", "B"], true),
  },
  {
    transcript: "Taxi to runway 23 via Charlie, Alfa, Bravo, hold short 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Via C, A, B, holding short of 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Rodaje a pista 23 por Charlie, Alpha, Bravo, mantengo antes de pista 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Rodaje a pista 23 por Charlie, Alpha, Bravo, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, false, CAB),
  },
  {
    transcript: "Rodaje por Charlie y Delta, mantengo antes de la pista 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, ["C"], true),
  },
  {
    transcript: "Roger, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, false, []),
  },
  {
    transcript: "Wilco, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, false, []),
  },
  {
    transcript: "Taxi to runway 23, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, false, []),
  },
  {
    transcript: "Ground, LV-INQ, request taxi to runway 23.",
    taxiways: CAB, holdShort: "23", expected: verdict(false, false, []),
  },
  {
    transcript: "Say again the taxi route, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(false, false, []),
  },
  {
    transcript: "Taxi via Charlie, Alpha, Bravo, hold short runway 23, Lima Victor India November Quebec.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Taxi to Ramp 1 via Charlie, LV-INQ.",
    taxiways: ["C"], destination: "Ramp 1", expected: verdict(true, false, ["C"]),
  },
  {
    transcript: "Taxi to Ramp 1, LV-INQ.",
    taxiways: ["C"], destination: "Ramp 1", expected: verdict(true, false, []),
  },
  {
    transcript: "Taxi to runway 05 via Alpha one, Bravo, hold short runway 05, LV-INQ.",
    taxiways: ["A1", "B"], holdShort: "05", expected: verdict(true, true, ["A1", "B"]),
  },
  {
    transcript: "Taxi to runway 23, hold short runway 23, LV-INQ.",
    taxiways: [], holdShort: "23", expected: verdict(true, true, []),
  },
  {
    transcript: "Ready for departure, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(false, false, []),
  },
  {
    transcript: "Taxiing to hold short of runway 21 via Charli, Alpha, Bravo, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB, false, true),
  },
  {
    transcript: "Rodaje a pista 21 por Charlie, Alpha, Bravo, mantengo antes de pista 21, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB, false, true),
  },
  {
    transcript: "Taxi to runway two one via Charlie, Alpha, Bravo, hold short runway two one, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB, false, true),
  },
  {
    transcript: "Taxi to runway two three via Charlie, Alpha, Bravo, hold short two three, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB),
  },
  {
    transcript: "Taxi to runway 5 via Alpha one, Bravo, hold short runway 5, LV-INQ.",
    taxiways: ["A1", "B"], holdShort: "05", expected: verdict(true, true, ["A1", "B"]),
  },
  {
    transcript: "Taxi to runway 05 via Charlie, Alpha, Bravo, hold short runway 05, LV-INQ.",
    taxiways: CAB, holdShort: "23", expected: verdict(true, true, CAB, false, true),
  },
];
