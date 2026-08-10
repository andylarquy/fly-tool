import { InferenceMetrics } from "../../ai/inferenceStats"
import { AircraftState } from "../../domain/AircraftState";
import { AtcState } from "../../domain/AtcState";

export interface ConversationTurn {
  pilot: string;
  atc: string;
}

export interface BenchmarkScenario {
  name: string;
  aircraftState: AircraftState;
  atcState: AtcState;
  pilotTransmission: string;
  expectations: BenchmarkExpectations;
  initialConversation?: ConversationTurn[];
}

export interface BenchmarkExpectations {
  responseRequired: boolean;
  requiredConcepts?: string[];
  forbiddenPatterns?: string[];
}

export interface BenchmarkEvaluation {
  passed: boolean;
  failures: string[];
}

export interface BenchmarkRun {
  run: number;
  response: string;
  evaluation: BenchmarkEvaluation;
  elapsedMs: number;
  metrics: InferenceMetrics;
}
