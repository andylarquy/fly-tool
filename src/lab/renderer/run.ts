import { renderTransmission } from "../../ai/renderer/intentRenderer";
import { MODEL } from "../../ai/modelConfig";
import { DEFAULT_FLIGHT_PLAN } from "../../domain/defaultFlightPlan";
import { evaluateResponse } from "../benchmark/checks";
import { renderCases } from "./cases";

const RUNS_PER_CASE = 3;

async function runRender(): Promise<void> {
  const callsign = DEFAULT_FLIGHT_PLAN.callsign;
  let passedRuns = 0;
  let totalRuns = 0;

  console.log(`Rendering ${renderCases.length} cases x${RUNS_PER_CASE} with ${MODEL}\n`);

  for (const renderCase of renderCases) {
    console.log(`=== ${renderCase.name} ===`);

    for (let run = 1; run <= RUNS_PER_CASE; run++) {
      const result = await renderTransmission({
        callsign,
        intents: renderCase.intents,
        style: { strictness: renderCase.strictness ?? "normal" },
      });

      const text = result?.text ?? "";
      const evaluation = evaluateResponse(text, renderCase.expectations);
      const failures = [...evaluation.failures];

      if (callsign && !text.startsWith(callsign)) {
        failures.push(`Does not start with callsign "${callsign}"`);
      }

      totalRuns++;
      passedRuns += failures.length === 0 ? 1 : 0;

      const fallbacks = result?.remarks.filter((remark) => !remark.improvised) ?? [];
      const note = fallbacks.length > 0 ? "  [remark fell back to fixed text]" : "";

      console.log(`${failures.length === 0 ? "PASS" : "FAIL"} ${text}${note}`);
      failures.forEach((failure) => console.log(`     ${failure}`));
    }
  }

  console.log(`\nPassed ${passedRuns}/${totalRuns} runs`);
}

runRender().catch((error: unknown) => {
  console.error("Render lab failed:", error);
  process.exitCode = 1;
});
