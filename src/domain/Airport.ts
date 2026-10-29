import { GeoPoint } from "./GeoPoint";
import { TaxiNetwork } from "./TaxiNetwork";

export type PatternSide = "left" | "right";

export interface Runway {
  designator: string;
  trueHeading: number;
  threshold: GeoPoint;
  lengthFeet: number;
  widthFeet: number;
  patternSide: PatternSide;
}

export interface Airspace {
  radiusNauticalMiles: number;
  ceilingFeetAgl: number;
}

export interface Airport {
  icao: string;
  name: string;
  position: GeoPoint;
  elevationFeet: number;
  patternAltitudeFeetAgl: number;
  airspace: Airspace;
  runways: Runway[];
  taxi?: TaxiNetwork;
}
