import { AircraftState } from "../domain/AircraftState";

export interface SimulatorAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  onAircraftStateUpdate(callback: (state: AircraftState) => void): void;
}
