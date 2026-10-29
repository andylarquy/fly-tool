export type FacilityRole = "ground" | "tower" | "approach" | "center";

export interface Facility {
  id: string;
  airportIcao: string;
  role: FacilityRole;
  frequencyMhz: number;
}
