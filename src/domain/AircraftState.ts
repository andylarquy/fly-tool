export interface AircraftState {
  latitude: number;
  longitude: number;
  altitudeFeet: number;
  trueHeading: number;
  groundSpeed: number;
  pitch: number;
  bank: number;
  verticalSpeedFeetPerMinute: number;
  isOnGround: boolean;
}
