// TAXI_PARKING NAME and SUFFIX are enums. 1 (plain "Parking") and a suffix of 0
// were confirmed against a real airport; the compass, gate and dock values are
// from the documentation and still unconfirmed.
const NAMES = [
  "",
  "Parking",
  "North Parking",
  "Northeast Parking",
  "East Parking",
  "Southeast Parking",
  "South Parking",
  "Southwest Parking",
  "West Parking",
  "Northwest Parking",
  "Gate",
  "Dock",
];

const FIRST_GATE_LETTER_CODE = 12;
const LAST_GATE_LETTER_CODE = 37;

export const parkingNameFromCode = (code: number): string => {
  if (code >= FIRST_GATE_LETTER_CODE && code <= LAST_GATE_LETTER_CODE) {
    return `Gate ${String.fromCharCode("A".charCodeAt(0) + code - FIRST_GATE_LETTER_CODE)}`;
  }

  return NAMES[code] ?? "Parking";
};

export const parkingSuffixFromCode = (code: number): string =>
  code >= 1 && code <= 26 ? String.fromCharCode("A".charCodeAt(0) + code - 1) : "";
