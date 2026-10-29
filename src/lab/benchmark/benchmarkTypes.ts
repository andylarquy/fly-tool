import { PilotRecord } from "../../domain/PilotRecord";
import { StageTimings } from "../../pipeline/atcPipeline";
import { RunwayFrameSpec } from "./telemetry";

export interface BenchmarkExpectations {
  responseRequired: boolean;
  requiredConcepts?: string[];
  forbiddenPatterns?: string[];
}

export interface BenchmarkEvaluation {
  passed: boolean;
  failures: string[];
}

export type ScenarioOrigin = "ported" | "adapted" | "new";

export interface BenchmarkStep {
  position: RunwayFrameSpec;
  pilot?: string;
  expect?: BenchmarkExpectations;
}

export interface BenchmarkScenario {
  name: string;
  section: string;
  origin: ScenarioOrigin;
  record?: PilotRecord;
  trafficCount?: number;
  steps: BenchmarkStep[];
}

export interface StepResult {
  pilot?: string;
  response: string;
  proactive: boolean;
  trace?: string;
  evaluation?: BenchmarkEvaluation;
  elapsedMs?: number;
  timings?: StageTimings;
}

export interface BenchmarkRun {
  run: number;
  steps: StepResult[];
  passed: boolean;
}
