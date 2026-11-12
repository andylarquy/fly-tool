export interface IntakeSample {
  transcript: string;
  lastAtc?: string;
  options?: string[];
  choice?: number;
  destination?: string;
  rules?: "VFR" | "IFR";
  local?: boolean;
}

export const intakeSamples: IntakeSample[] = [
  { transcript: "Ground, LV-INQ, request taxi, VFR to Ezeiza.", destination: "Ezeiza", rules: "VFR" },
  { transcript: "VFR to Aeroparque, LV-INQ.", destination: "Aeroparque", rules: "VFR" },
  { transcript: "We are going to Córdoba, VFR, LV-INQ.", destination: "Córdoba", rules: "VFR" },
  { transcript: "IFR to Mendoza, LV-INQ.", destination: "Mendoza", rules: "IFR" },
  { transcript: "Destination San Fernando, VFR.", destination: "San Fernando", rules: "VFR" },
  { transcript: "Sierra Alpha Echo Zulu, VFR, LV-INQ.", destination: "Sierra Alpha Echo Zulu", rules: "VFR" },
  { transcript: "Destination Sierra Alpha Bravo Echo, visual flight rules.", destination: "Sierra Alpha Bravo Echo", rules: "VFR" },
  { transcript: "Request taxi, we are VFR to Santa Fe, LV-INQ.", destination: "Santa Fe", rules: "VFR" },
  { transcript: "Departing Morón, VFR to San Fernando, LV-INQ.", destination: "San Fernando", rules: "VFR" },
  { transcript: "Voy a Rosario, VFR, LV-INQ.", destination: "Rosario", rules: "VFR" },
  { transcript: "Destino Mendoza, reglas visuales, LV-INQ.", destination: "Mendoza", rules: "VFR" },
  { transcript: "Vuelo IFR a Córdoba, LV-INQ.", destination: "Córdoba", rules: "IFR" },
  { transcript: "VFR, LV-INQ.", rules: "VFR" },
  { transcript: "IFR, LV-INQ.", rules: "IFR" },
  { transcript: "Staying in the pattern, VFR, LV-INQ.", rules: "VFR", local: true },
  { transcript: "Local flight, circuits, LV-INQ.", local: true },
  { transcript: "Vuelo local, VFR, LV-INQ.", rules: "VFR", local: true },
  {
    transcript: "Rivera Norte, LV-INQ.",
    lastAtc: "LV-INQ, confirm destination, Rivera Sur or Rivera Norte.",
    destination: "Rivera Norte",
  },
  { transcript: "Harbor Field, LV-INQ.", lastAtc: "LV-INQ, say destination and flight rules.", destination: "Harbor Field" },
  { transcript: "Rosario, LV-INQ.", lastAtc: "LV-INQ, say destination.", destination: "Rosario" },
  { transcript: "Request taxi to runway 23, LV-INQ." },
  { transcript: "Holding short runway 23, ready for departure, LV-INQ." },
  { transcript: "Taxi to Ramp 1 via Charlie, LV-INQ." },
  { transcript: "Wilco, LV-INQ." },
  { transcript: "Good morning, ground, LV-INQ." },
  { transcript: "Say again the taxi route, LV-INQ." },
  { transcript: "Request pattern entry runway 23, LV-INQ." },
  { transcript: "Adami", lastAtc: "LV-INQ, confirm destination, Carrasco General Cesáreo L. Berisso or Ángel S. Adami.", options: ["Carrasco General Cesáreo L. Berisso", "Ángel S. Adami"], choice: 2 },
  { transcript: "Carrasco, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Carrasco General Cesáreo L. Berisso or Ángel S. Adami.", options: ["Carrasco General Cesáreo L. Berisso", "Ángel S. Adami"], choice: 1 },
  { transcript: "The first one, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], choice: 1 },
  { transcript: "Sur, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], choice: 2 },
  { transcript: "Rivera Sur, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], choice: 2 },
  { transcript: "El segundo, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], choice: 2 },
  { transcript: "Hillside, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], destination: "Hillside" },
  { transcript: "VFR, LV-INQ.", lastAtc: "LV-INQ, confirm destination, Rivera Norte or Rivera Sur.", options: ["Rivera Norte", "Rivera Sur"], rules: "VFR" },
];
