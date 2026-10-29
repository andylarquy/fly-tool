import { EngineState } from "../domain/EngineState";

export const createEngineState = (runway: string): EngineState => ({
  runway,
  clearances: [],
  contacted: false,
  remarksMade: [],
});
