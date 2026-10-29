import { MODEL } from "../../ai/modelConfig";
import { DEFAULT_FLIGHT_PLAN } from "../../domain/defaultFlightPlan";
import {
  createPipelineState,
  PipelineState,
  runPipelineTurn,
} from "../../pipeline/atcPipeline";
import { labAirport } from "../airports";
import { evaluateResponse } from "../benchmark/checks";
import { pipelineScenarios } from "./scenarios";
import { telemetryAt } from "./telemetry";

const ACTIVE_RUNWAY = "23";
const SETTLE_TICKS = 5;
const TICK_MS = 1000;
const NO_RESPONSE = "[NO RESPONSE]";

async function runPipelineLab(): Promise<void> {
  const runway = labAirport.runways.find((r) => r.designator === ACTIVE_RUNWAY);

  if (!runway) {
    throw new Error(`Runway ${ACTIVE_RUNWAY} not found in lab airport`);
  }

  const callsign = DEFAULT_FLIGHT_PLAN.callsign;
  const style = { strictness: "normal" as const };
  const failedScenarios: string[] = [];

  console.log(`Pipeline lab with ${MODEL}\n`);

  for (const scenario of pipelineScenarios) {
    console.log(`=== ${scenario.name} [${scenario.origin}] ===`);

    let state: PipelineState = createPipelineState(ACTIVE_RUNWAY);
    let nowMs = 0;
    const failures: string[] = [];

    for (const step of scenario.steps) {
      const aircraft = telemetryAt(runway, labAirport.elevationFeet, step.position);
      const spoken: string[] = [];

      for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        nowMs += TICK_MS;
        const turn = await runPipelineTurn(
          { aircraft, airport: labAirport, observedAtMs: nowMs, style, callsign },
          state,
        );
        state = turn.state;

        if (turn.transmission) {
          spoken.push(turn.transmission);
        }
      }

      if (step.pilot) {
        nowMs += TICK_MS;
        console.log(`Pilot> ${step.pilot}`);

        const turn = await runPipelineTurn(
          {
            aircraft,
            airport: labAirport,
            observedAtMs: nowMs,
            style,
            callsign,
            pilotTransmission: step.pilot,
          },
          state,
        );
        state = turn.state;

        const { message, intents, situation } = turn.trace;
        console.log(
          `  [${situation.phase}] ${message ? `${message.type}/${message.runway ?? "-"}/${message.subject}` : "unintelligible"} -> ${intents.map((i) => i.type).join(", ") || "silence"}`,
        );

        spoken.length = 0;
        if (turn.transmission) {
          spoken.push(turn.transmission);
        }
      } else if (spoken.length > 0) {
        console.log("  (proactive)");
      }

      const response = spoken.join(" ") || NO_RESPONSE;
      console.log(`ATC> ${response}`);

      if (step.expect) {
        const evaluation = evaluateResponse(response, step.expect);
        console.log(evaluation.passed ? "  PASS" : "  FAIL");
        evaluation.failures.forEach((failure) => {
          console.log(`    ${failure}`);
          failures.push(failure);
        });
      }
    }

    if (failures.length > 0) {
      failedScenarios.push(scenario.name);
    }
  }

  const total = pipelineScenarios.length;
  console.log(`\nScenarios fully passing: ${total - failedScenarios.length}/${total}`);
  failedScenarios.forEach((name) => console.log(`  FAILED: ${name}`));
}

runPipelineLab().catch((error: unknown) => {
  console.error("Pipeline lab failed:", error);
  process.exitCode = 1;
});
