import { GeoPoint } from "./GeoPoint";

export interface TaxiPoint {
  id: number;
  position: GeoPoint;
  holdShortRunway?: string;
}

// Undirected: a segment can be taxied in either direction.
export interface TaxiSegment {
  from: number;
  to: number;
  taxiway?: string;
  crossesRunway?: string;
}

export interface ParkingSpot {
  id: number;
  name: string;
  position: GeoPoint;
  pointId: number;
}

export interface TaxiNetwork {
  points: TaxiPoint[];
  segments: TaxiSegment[];
  parking: ParkingSpot[];
}
