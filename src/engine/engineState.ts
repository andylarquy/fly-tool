import { EngineState } from "../domain/EngineState";

export interface EngineStateOptions {
  askFlightIntake?: boolean;
}

export const createEngineState = (
  runway: string,
  options: EngineStateOptions = {},
): EngineState => ({
  runway,
  clearances: [],
  contacted: false,
  remarksMade: [],
  ...(options.askFlightIntake ? { intake: { asked: 0 } } : {}),
});
