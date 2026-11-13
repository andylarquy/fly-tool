import { GeoPoint } from "./GeoPoint";

export interface ListedAirport {
  icao: string;
  region: string;
  position: GeoPoint;
}
