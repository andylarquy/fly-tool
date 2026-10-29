Project: fly tool

Goal:
Build a local-first AI immersion engine for flight simulators.

## What this is right now

An MSFS 2024 telemetry client wired to a local Ollama model acting as air
traffic control, plus a lab/benchmark harness for iterating on that ATC
behavior offline. Everything runs locally against Ollama; no cloud
dependency.

Implemented:
- MSFS 2024 telemetry via SimConnect (`src/adapters/msfs2024/MsfsSimulator.ts`).
- A local Ollama model acting as ATC: given aircraft telemetry + situation
  context + pilot transmission, it returns the next ATC radio transmission
  or `[NO RESPONSE]` (`src/ai/speech/ai.ts`, prompt in `src/ai/speech/aiConfig.ts`).
- A markdown knowledge base (`/knowledge/*.md`, root-level) appended to the
  system prompt.
- Conversation history/memory across turns, with explicit reset/seed hooks
  for testing (`resetConversation`, `seedConversationTurn` in `ai.ts`).
- Two interactive CLIs (`npm run dev`, `npm run lab:chat`) and a behavioral
  benchmark harness (`npm run lab:benchmark`) — see below.

Known gap: `src/index.ts` (the live MSFS path) currently sends an empty
`AtcState.situationContext` and the placeholder `DEFAULT_FLIGHT_PLAN` —
unlike `lab.ts`/the benchmark, which populate the context. The live app
doesn't have real situational grounding yet.

## Architecture principles

- Local-first. No cloud dependency required.
- Simulator-specific functionality lives behind adapters (`SimulatorAdapter`
  interface, `MsfsSimulator` implementation). Add new simulators here, not
  by branching in `ai.ts`/`index.ts`.
- LLMs interpret/generate language; they don't own aviation state.
  `AircraftState` comes from the simulator, `AtcState`/situation context is
  deterministic and caller-supplied, conversation history is explicit and
  resettable — never assume the model tracks state on its own.
- Components should be replaceable (model, simulator, knowledge base).

## Entry points

- `npm run dev` — build + run `src/index.ts`. Connects to MSFS via
  SimConnect, streams live telemetry, reads pilot transmissions from stdin.
- `npm run lab:chat` — build + run `src/lab/lab.ts`. Same interactive loop but
  against fixed `AircraftState`/`AtcState` fixtures in `src/lab/cases.ts` —
  no simulator required, useful for iterating on the prompt/knowledge base
  quickly.
- `npm run lab:benchmark` — build + run `src/lab/benchmark/benchmark.ts`. Runs a
  fixed scenario suite (`src/lab/benchmark/scenarios.ts`, roughly twenty
  scenarios covering readbacks, traffic pattern, takeoff, landing) against
  the model 3x each, evaluates each response with simple string checks
  (`checks.ts`), and writes a markdown report to `/benchmark-results/`
  (gitignored). Requires Ollama running locally with the configured `MODEL`
  pulled; takes a few minutes.
- `npm run lab:classify` — build + run `src/lab/classification/classification.js`.
  Experiment for the planned "language -> structured JSON -> code logic ->
  language" pipeline: runs labeled pilot transmissions
  (`classification/samples.ts`) through `classifyPilotMessage`
  (`src/ai/classifier/pilotMessageClassifier.ts`, prompt/schema in
  `classifier/classifierConfig.ts`, output type in `domain/PilotMessage.ts`) using
  Ollama structured output, and prints type/runway/subject accuracy plus a
  confusion summary. Samples that carry emergency details also run
  `extractEmergencyDetails` and check every field, including ones that must
  stay empty. Not wired into the live app.
- `npm run lab:engine` — build + run `src/lab/engine/engine.js`.
  Deterministic (no Ollama): replays scripted pilot messages/phases/events
  through `decide` and checks the resulting `AtcIntent` labels per step.
  Exits non-zero on any mismatch.
- `npm run lab:render` — build + run `src/lab/render/render.js`. Feeds fixed
  `AtcIntent` lists (`render/cases.ts`) to `renderTransmission` 3x each and
  checks the wording with the benchmark's substring checks (plus "starts with
  the callsign"). Needs Ollama; tests the Render stage in isolation.
- `npm run lab:memory` — build + run `src/lab/memory/memory.js`. Deterministic
  (no Ollama, fixed clock): familiarity/strictness table, the remark rules
  through `decide`, record keeping, and a `JsonPilotRecordStore` round trip in
  a temp directory. Exits non-zero on any failure.
- `npm run lab:pipeline` — build + run `src/lab/pipeline/pipeline.js`. End to end
  (classify -> derive situation -> engine -> render) over multi-step
  scenarios with phase-consistent telemetry (`pipeline/telemetry.ts`). Many
  scenarios are ported from the benchmark with their original expectations;
  scenarios whose expectations were changed to follow the engine are tagged
  `adapted` (a *requested* report gets the next instruction, an unrequested
  one gets silence). Needs Ollama.
- `npm run build` / `npm start` — plain compile + run of `dist/index.js`.

There is no `ts-node`; everything runs compiled through `dist/`. **Top-level
`await` doesn't work** — the project is CommonJS (`package.json` has
`"type": "commonjs"`), so any script-style entry file needs an
`async function main() {...}` wrapped and invoked at the bottom with
`.catch(...)` (see `index.ts`, `lab.ts`, `benchmark.ts` for the pattern).

## Where things live

- `src/domain/` — plain shared types: `AircraftState` (telemetry), `AtcState`
  (situation context string), `FlightPlan` (callsign, type, route, ... all
  optional), and `AtcSession` (the three bundled; this is what
  `getAiResponse` takes). `defaultFlightPlan.ts` holds the placeholder
  `DEFAULT_FLIGHT_PLAN` (callsign `LV-INQ`) used by `index.ts`, `lab.ts` and
  the benchmark until a real flight plan source exists.
  Also the world/memory model: `Airport`/`Runway`/`Facility` (static data),
  `FlightPhase`, `Situation` and `FlightEvent` (derived, see below),
  `Clearance`/`PilotIntent` (session state), `PilotRecord` (long-term memory
  keyed by pilot profile, not callsign, behind `PilotRecordStore`), and
  `Remark`/`RemarkKind` (the small bits of flavor the engine may add).
  `defaultPilot.ts` holds the placeholder `DEFAULT_PILOT_PROFILE`. Not all of
  these are wired into `AtcSession`/`ai.ts` yet.
- `src/situation/` — deterministic derivation, no LLM. `deriveSituation`
  turns `AircraftState` + `Airport` + active runway into a `Situation`
  (flight phase, runway-relative geometry) plus `FlightEvent`s (touchdown,
  lifted off, go-around, airspace entry/exit, phase changes). Stateful across
  ticks via the `previous` argument; a new phase must persist for
  `PHASE_DWELL_MS` before it commits (ground/air flips commit immediately). Touchdown rate is the vertical
  speed of the last airborne sample.
- `src/engine/` — the ATC engine (the Decide layer): deterministic, no LLM. `decide(input,
  state)` takes the classified `PilotMessage` (or none/unintelligible), the
  `Situation`, `FlightEvent`s and a `ControllerStyle`, and returns
  `AtcIntent[]` (empty = stay silent) plus the next `EngineState`
  (clearances issued, `expectedReport`, contact/airspace tracking). ATC only
  answers a position report when it was expected (a prior "report downwind")
  or something is owed; a report contradicting the derived phase is always
  queried. Departures always go line up and wait first; once lined up with an
  active line-up clearance, a tick issues the takeoff clearance proactively.
  Emergencies: `EngineState.emergency` accumulates what the pilot has said
  (urgency, nature, intention, souls, fuel). Nature and intentions are asked
  for right away if missing; souls/fuel only once the pilot is not busy
  (not on takeoff roll, upwind, base, final or landing roll); each question
  is asked at most once. If the pilot intends to land here, a landing
  clearance follows on base/final. Position-style subjects (legs,
  "airborne") are treated as position reports even if the classifier labeled
  the type `other`.
  Remarks (`engine/remarks.ts`) are optional flavor appended to a plain
  reply (`issue_clearance`/`instruct`/`advise`/`acknowledge`) only when:
  not strict, no emergency, past a 120 s gap since the last remark, once per
  kind per session, one history remark per session (never while the pilot is
  busy), and not the same kind the last session ended with. Touchdown
  remarks follow the landing quality. They need `DecisionContext.memory`;
  without it the engine never remarks.
  Readback checks always correct a wrong runway/clearance; a missing runway is
  tolerated unless strictness is "strict". Not wired into `ai.ts`/`index.ts`.
- `src/pipeline/` — `runPipelineTurn`: one tick/turn through classify ->
  `deriveSituation` -> `decide` -> `renderTransmission`, returning the
  transmission plus a trace. Owns no hidden state; the caller passes and
  receives `PipelineState`. Not wired into `index.ts`/`ai.ts` yet.
- `src/memory/` — long-term memory, no LLM. `recordKeeping.ts` (immutable
  updates to a `PilotRecord`: visits, landings with touchdown rate, readback
  errors, last remark; `recordTurn` applies a turn's events/intents),
  `familiarity.ts` (stranger/acquaintance/regular from the *prior* visit
  history, then `strictnessFor(familiarity, trafficCount)`; strict only for
  strangers/acquaintances at a busy field, relaxed only for regulars at a
  quiet one), `landingQuality.ts` (smooth/normal/firm/hard by touchdown
  rate), and `jsonPilotRecordStore.ts` (one file per pilot under the
  gitignored root-level `/data/pilot-records/`, atomic write). The pipeline
  keeps the live record in `PipelineState`; the *caller* decides when to
  `save` it. Sanitized pilot ids can collide (`a/b` and `a_b` share a file).
- `src/utils/geo.ts` — flat-earth runway-frame math used by the above.
- `src/adapters/` — simulator integration behind `SimulatorAdapter`.
- `src/ai/` — everything that talks to Ollama, split by job:
  - Shared at the root:
    - `modelConfig.ts` — single source of truth for `MODEL` and `THINKING`.
      Also has the per-model workaround for models that ignore `think: false`
      and inline reasoning into `content` instead of the dedicated `thinking`
      field (`MODELS_WITH_INLINE_THINKING`).
    - `inferenceStats.ts` — turns Ollama's raw nanosecond durations into
      `InferenceMetrics` (seconds, tokens, tok/s). Takes the raw
      `ChatResponse` — i.e. `getAiResponse(...).response`, not the
      `AiResponse` wrapper itself.
  - `classifier/` — language -> structured JSON (pilot side).
    - `pilotMessageClassifier.ts` — `classifyPilotMessage`, Ollama structured
      output, stateless.
    - `classifierConfig.ts` — its system prompt and JSON schema builder.
    - `emergencyDetailsExtractor.ts` / `emergencyDetailsConfig.ts` — a second,
      separate call (`extractEmergencyDetails`) that the pipeline only makes
      when the message is an emergency or one is already active. Kept out of
      the main classifier because folding these fields in raised its median
      latency from ~0.65 s to ~1.8 s and lowered type accuracy.
    - `parsing.ts` — small shared helpers for validating model output.
  - `speech/` — the controller's spoken side (currently the whole legacy
    single-call ATC turn; will become intent -> wording).
    - `ai.ts` — orchestrates one ATC turn: builds the prompt, calls Ollama,
      returns `{ content, thinking, response }`. Owns the module-level
      `conversationHistory`.
    - `aiConfig.ts` — the system prompt (`AI_SYSTEM_PROMPT`). Edited by hand;
      don't rewrite it as a side effect of other changes.
    - `intentRenderer.ts` / `rendererConfig.ts` / `describeIntent.ts` — the
      Render stage: turns `AtcIntent[]` into one transmission using a small
      phrasebook prompt. Empty intents means no model call (silence).
      `describeIntent` deliberately leaves out internal values such as the
      touchdown rate so the model can't read them out, and hands the model
      the exact wording for emergency urgency, nature and questions and for
      remarks (the 4B model added questions of its own, and swapped
      `previous_firm_landing` for `firm_landing`, when asked to choose).
    - `knowledgeBase.ts` — loads every `.md` file from root-level
      `/knowledge/` (sorted by filename, hence the `01-`, `02-` prefixes),
      concatenates them under a `## filename` heading each, appended to the
      system prompt in `ai.ts`. Deliberately **not** under `src/` — `tsc`
      only emits `.ts` output to `dist/`, so any asset a compiled script
      reads at runtime needs to live outside `src/` and be resolved via
      `process.cwd()`. The same applies to `/benchmark-results/`.
- `src/lab/`
  - `airports.ts` — fictional "Lab Field" (`ZZZZ`) with runways 23/05 and a
    tower, used to exercise the situation derivation. Not real data.
  - `cases.ts` — fixed `AircraftState`/`AtcState` fixtures for the
    interactive `lab.ts` CLI.
  - `lab.ts` — interactive loop, same shape as `index.ts` but sourcing state
    from `cases.ts` instead of SimConnect.
  - `benchmark/` — the behavioral benchmark harness:
    - `benchmarkTypes.ts` — shared types (`BenchmarkScenario`,
      `ConversationTurn`, `BenchmarkExpectations`, `BenchmarkRun`, ...).
    - `scenarios.ts` — the test data. Pure data, no logic. Each scenario is
      a specific, narrow behavior claim, not a general aviation-competence
      test.
    - `checks.ts` — the evaluator (`evaluateResponse`). Deliberately simple:
      `responseRequired` (must/must-not be `[NO RESPONSE]`),
      `requiredConcepts`/`forbiddenPatterns` (case-insensitive substrings).
      See Conventions below before changing this.
    - `report.ts` — console + markdown output, and the report filename
      convention (`<sanitized model>_thinking_<level>.md`, with `_1`, `_2`
      suffixes on collision).
    - `benchmark.ts` — the runner.

## Conventions worth preserving

- **The benchmark evaluator stays deliberately dumb.** This was a explicit,
  deliberated decision, not an oversight: no `expectedResponseType` enums,
  no "did it invent an altitude" checkers, no LLM-as-judge. Each scenario
  tests one narrow, well-grounded behavior via simple substring checks; a
  human is expected to read the printed/markdown response for anything
  subtler (that's why every run's response is shown, not just failures). If
  asked to make a scenario "catch" some new failure mode, prefer grounding
  the scenario (add a fact to `situationContext` or `initialConversation`)
  over adding a new kind of automated check.
- **Scenarios must be self-contained and grounded.** If an expectation
  depends on a fact (e.g. "the aircraft is number one, so it should be
  cleared to land"), that fact belongs in `situationContext`, not assumed.
  If a scenario is a readback test, the instruction being read back needs to
  actually be in `initialConversation` — a pilot line that merely *sounds*
  like a readback with no prior ATC instruction in history doesn't test what
  it claims to.
- **New concern → new file**, following the existing `src/ai/` split
  (per-job folders; within them prompt vs. model config vs. stats vs.
  knowledge loading). Don't let
  `ai.ts` or `benchmark.ts` grow into catch-alls.
- **No comments unless the WHY is genuinely non-obvious.** This codebase is
  otherwise comment-free by convention.
- **Extend `modelConfig.ts`'s `Model` union** rather than using a bare
  string when trying a new Ollama model. Note some model identifiers contain
  `/` and `:` (e.g. `maternion/lfm2.5:8b`) — anything that turns a model name
  into a filename needs to sanitize `:`, `/`, `\`, and `_`
  (`report.ts`'s `sanitizeForFilename`).
- **`npm run build` compiles the whole project**, not just one entry point —
  there's no per-file build. A new script entry is just
  `npm run build && node dist/path/to/file.js` in `package.json`. Anything
  under `src/lab/` is exposed as `lab:<name>`.

## Sanity-checking changes

There's no test framework. `npx tsc --noEmit` is the baseline check after
any edit. For behavior changes to the ATC prompt or knowledge base,
`npm run lab:chat` (single interaction, fast) or `npm run lab:benchmark` (full suite)
are how to validate against the model — reading the printed responses
matters as much as the PASS/FAIL count.
