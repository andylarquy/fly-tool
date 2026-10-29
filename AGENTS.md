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
  or `[NO RESPONSE]` (`src/ai/singleCall/singleCallAtc.ts`, prompt in `src/ai/singleCall/singleCallPrompt.ts`).
- A markdown knowledge base (`/knowledge/*.md`, root-level) appended to the
  system prompt.
- Conversation history/memory across turns, with explicit reset/seed hooks
  for testing (`resetConversation`, `seedConversationTurn` in `singleCallAtc.ts`).
- Two interactive CLIs (`npm run dev`, `npm run lab:chat`) and a behavioral
  benchmark harness (`npm run lab:benchmark`) — see below.

Known gap: `src/index.ts` (the live MSFS path) currently sends an empty
`SingleCallContext.situationContext` and the placeholder `DEFAULT_FLIGHT_PLAN` —
unlike `lab:chat`, which populates the context. The live app
doesn't have real situational grounding yet.

## Architecture principles

- Local-first. No cloud dependency required.
- Simulator-specific functionality lives behind adapters (`SimulatorAdapter`
  interface, `MsfsSimulator` implementation). Add new simulators here, not
  by branching in `singleCallAtc.ts`/`index.ts`.
- LLMs interpret/generate language; they don't own aviation state.
  `AircraftState` comes from the simulator, `SingleCallContext`/situation context is
  deterministic and caller-supplied, conversation history is explicit and
  resettable — never assume the model tracks state on its own.
- Components should be replaceable (model, simulator, knowledge base).

## Entry points

- `npm run dev` — build + run `src/index.ts`. Connects to MSFS via
  SimConnect, streams live telemetry, reads pilot transmissions from stdin.
- `npm run lab:chat` — build + run `src/lab/chat/run.ts`. Same interactive loop but
  against fixed `AircraftState`/`SingleCallContext` fixtures in `src/lab/chat/cases.ts` —
  no simulator required, useful for iterating on the prompt/knowledge base
  quickly.
- `npm run lab:benchmark` — build + run `src/lab/benchmark/run.ts`. The
  end-to-end behavioral benchmark: each scenario in `scenarios.ts` (multi-step,
  ~35 of them) runs 3x from a fresh state through the real pipeline
  (classifier -> situation derivation -> engine -> speech), with telemetry
  generated from runway-relative positions (`telemetry.ts`) so it is
  geometrically consistent. Each step's response is checked with simple string
  checks (`checks.ts`), and a markdown report with per-scenario pass rates and
  per-stage latency is written to `/benchmark-results/` (gitignored). Needs
  Ollama running with the configured `MODEL` pulled; takes several minutes.
  Scenarios are tagged `ported` (original expectation kept), `adapted`
  (original intent, but following the engine: a *requested* report gets the
  next instruction, an unrequested one gets silence) or `new`.
- `npm run lab:interpreter` — build + run `src/lab/interpreter/run.js`.
  Experiment for the planned "language -> structured JSON -> code logic ->
  language" pipeline: runs labeled pilot transmissions
  (`interpreter/samples.ts`) through `classifyPilotMessage`
  (`src/ai/interpreter/pilotMessageClassifier.ts`, prompt/schema in
  `interpreter/pilotMessagePrompt.ts`, output type in `domain/PilotMessage.ts`) using
  Ollama structured output, and prints type/runway/subject accuracy plus a
  confusion summary. Samples that carry emergency details also run
  `extractEmergencyDetails` and check every field, including ones that must
  stay empty. Not wired into the live app.
- `npm run lab:engine` — build + run `src/lab/engine/engine.js`.
  Deterministic (no Ollama): replays scripted pilot messages/phases/events
  through `decide` and checks the resulting `AtcIntent` labels per step.
  Exits non-zero on any mismatch.
- `npm run lab:renderer` — build + run `src/lab/renderer/run.js`. Feeds fixed
  `AtcIntent` lists (`render/cases.ts`) to `renderTransmission` 3x each and
  checks the wording with the benchmark's substring checks (plus "starts with
  the callsign"). Needs Ollama; tests the Render stage in isolation.
- `npm run lab:memory` — build + run `src/lab/memory/memory.js`. Deterministic
  (no Ollama, fixed clock): familiarity/strictness table, the remark rules
  through `decide`, record keeping, and a `JsonPilotRecordStore` round trip in
  a temp directory. Exits non-zero on any failure.
- `npm run build` / `npm start` — plain compile + run of `dist/index.js`.

There is no `ts-node`; everything runs compiled through `dist/`. **Top-level
`await` doesn't work** — the project is CommonJS (`package.json` has
`"type": "commonjs"`), so any script-style entry file needs an
`async function main() {...}` wrapped and invoked at the bottom with
`.catch(...)` (see `index.ts` and the `run.ts` files under `src/lab/` for the pattern).

## Where things live

- `src/domain/` — plain shared types: `AircraftState` (telemetry), `SingleCallContext`
  (situation context string), `FlightPlan` (callsign, type, route, ... all
  optional), and `SingleCallSession` (the three bundled; this is what
  `getSingleCallResponse` takes). `defaultFlightPlan.ts` holds the placeholder
  `DEFAULT_FLIGHT_PLAN` (callsign `LV-INQ`) used by `index.ts`, `lab/chat` and
  the benchmark until a real flight plan source exists.
  Also the world/memory model: `Airport`/`Runway`/`Facility` (static data),
  `FlightPhase`, `Situation` and `FlightEvent` (derived, see below),
  `Clearance` (session state), `PilotRecord` (long-term memory
  keyed by pilot profile, not callsign, behind `PilotRecordStore`), and
  `Remark`/`RemarkKind` (the small bits of flavor the engine may add).
  `defaultPilot.ts` holds the placeholder `DEFAULT_PILOT_PROFILE`. Not all of
  these are wired into the live app yet.
- `src/situation/` — deterministic derivation, no LLM (`deriveSituation.ts`,
  with `classifyPhase.ts` doing the phase rules). `deriveSituation`
  turns `AircraftState` + `Airport` + active runway into a `Situation`
  (flight phase, runway-relative geometry) plus `FlightEvent`s (touchdown,
  lifted off, go-around, airspace entry/exit, phase changes). Stateful across
  ticks via the `previous` argument; a new phase must persist for
  `PHASE_DWELL_MS` before it commits (ground/air flips commit immediately). Touchdown rate is the vertical
  speed of the last airborne sample.
- `src/engine/` — the ATC engine (the Decide layer): deterministic, no LLM.
  Files: `decide.ts` (entry point), `decidePilotMessage.ts` (what to do with a
  classified pilot message), `decideEvents.ts` and `decideTick.ts` (what to do
  about events and about time passing), `decideEmergency.ts`, `remarks.ts`,
  `pattern.ts` (traffic-pattern leg helpers), `clearances.ts` (clearance
  helpers on `EngineState`), `engineState.ts` (`createEngineState`),
  `intentBuilders.ts` (`silent`/`say`/`ask`/`clear`), `decisionTypes.ts`.
  `decide(input,
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
  tolerated unless strictness is "strict". Not wired into `index.ts`.
- `src/pipeline/` — `runPipelineTurn`: one tick/turn through classify ->
  `deriveSituation` -> `decide` -> `renderTransmission`, returning the
  transmission plus a trace. Owns no hidden state; the caller passes and
  receives `PipelineState`. Not wired into `index.ts` yet.
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
- `src/ai/` — everything that talks to Ollama, one folder per pipeline stage:
  - Shared at the root:
    - `modelConfig.ts` — single source of truth for `MODEL` and `THINKING`.
      Also has the per-model workaround for models that ignore `think: false`
      and inline reasoning into `content` instead of the dedicated `thinking`
      field (`MODELS_WITH_INLINE_THINKING`).
    - `inferenceStats.ts` — turns Ollama's raw nanosecond durations into
      `InferenceMetrics` (seconds, tokens, tok/s). Takes the raw
      `ChatResponse` — i.e. `getSingleCallResponse(...).response`, not the
      `SingleCallResponse` wrapper itself.
  - `interpreter/` — language -> structured JSON (pilot side). Files named
    `*Prompt.ts` hold a stage's system prompt and JSON schema.
    - `pilotMessageClassifier.ts` — `classifyPilotMessage`, Ollama structured
      output, stateless. Prompt/schema in `pilotMessagePrompt.ts`.
    - `emergencyDetailsExtractor.ts` / `emergencyDetailsPrompt.ts` — a second,
      separate call (`extractEmergencyDetails`) that the pipeline only makes
      when the message is an emergency or one is already active. Kept out of
      the main classifier because folding these fields in raised its median
      latency from ~0.65 s to ~1.8 s and lowered type accuracy.
    - `modelOutputParsing.ts` — small shared helpers for validating model
      output.
  - `renderer/` — `AtcIntent[]` -> the controller's words (ATC side).
    - `intentRenderer.ts` / `intentRendererPrompt.ts` / `describeIntent.ts` —
      turns intents into one transmission using a small phrasebook prompt.
      Empty intents means no model call (silence). `describeIntent`
      deliberately leaves out internal values such as the touchdown rate so
      the model can't read them out, and hands the model the exact wording for
      emergency urgency, nature and questions (the 4B model added questions of
      its own when asked to choose them).
    - `remarkRenderer.ts` / `remarkConfig.ts` — remarks are improvised, in a
      separate call at a higher temperature, from a plain-language fact plus a
      mood (`REMARK_FACTS`). The operational part of the transmission never
      depends on it. The improvised line is validated in code (no digits,
      <= 10 words, no operational words, no emoji, a short list of details
      the model likes to invent, and mood/time checks per kind so a firm
      landing is not praised and an earlier visit is not "just now"); if it
      fails, `REMARK_FALLBACK` (a fixed sentence) is spoken instead. Reading
      the output is still necessary: the guards stop contradictions, not
      every embellishment.
  - `singleCall/` — the original one-model-does-everything ATC turn. It is
    **still what the live app (`index.ts`) and `lab:chat` run**, so it is not
    dead; it goes away, together with `lab/chat/`, once the live app uses the
    pipeline.
    - `singleCallAtc.ts` — `getSingleCallResponse`: builds the prompt, calls
      Ollama, returns `{ content, thinking, response }`. Owns the module-level
      `conversationHistory`; `resetConversation`/`seedConversationTurn` are
      test hooks that nothing currently calls.
    - `singleCallPrompt.ts` — the system prompt (`SINGLE_CALL_SYSTEM_PROMPT`).
      Edited by hand; don't rewrite it as a side effect of other changes.
    - `knowledgeBase.ts` — loads every `.md` file from root-level
      `/knowledge/` (sorted by filename, hence the `01-`, `02-` prefixes),
      concatenates them under a `## filename` heading each, appended to the
      system prompt. Only this path uses the knowledge base; the renderer has
      its own phrasebook. Deliberately **not** under `src/` — `tsc` only emits
      `.ts` output to `dist/`, so any asset a compiled script reads at runtime
      needs to live outside `src/` and be resolved via `process.cwd()`. The
      same applies to `/benchmark-results/`.
- `src/lab/`
  - `airports.ts` — fictional "Lab Field" (`ZZZZ`) with runways 23/05 and a
    tower, used to exercise the situation derivation. Not real data.
  - `chat/` — `lab:chat`: `run.ts` is the interactive loop (same shape as
    `index.ts` but sourcing state from `cases.ts`'s fixed
    `AircraftState`/`SingleCallContext` fixtures instead of SimConnect). Runs
    the single-call path.
  - `interpreter/`, `engine/`, `memory/`, `renderer/` — one lab per pipeline
    stage, each with its entry point in `run.ts` (`engine/helpers.ts` holds
    the shared situation/label builders). `interpreter` and `renderer` need
    Ollama; `engine` and `memory` don't.
  - `benchmark/` — the end-to-end behavioral benchmark harness:
    - `benchmarkTypes.ts` — shared types (`BenchmarkScenario`,
      `BenchmarkStep`, `BenchmarkExpectations`, `BenchmarkRun`, ...).
    - `scenarios.ts` — the test data. Pure data, no logic. Each scenario is
      a specific, narrow behavior claim, not a general aviation-competence
      test. Facts an expectation depends on (a clearance already issued, a
      report already requested) are established by earlier steps.
    - `telemetry.ts` — `telemetryAt` and the named `positions` (holding short,
      lined up, downwind, final, ...) turned into consistent `AircraftState`.
    - `records.ts` — `knownPilot`, a pilot record with prior visits/landings
      for the memory scenarios.
    - `checks.ts` — the evaluator (`evaluateResponse`). Deliberately simple:
      `responseRequired` (must/must-not be `[NO RESPONSE]`),
      `requiredConcepts`/`forbiddenPatterns` (case-insensitive substrings).
      See Conventions below before changing this.
    - `report.ts` — console + markdown output, and the report filename
      convention (`<sanitized model>_thinking_<level>.md`, with `_1`, `_2`
      suffixes on collision).
    - `run.ts` — the runner.

## Conventions worth preserving

- **The benchmark evaluator stays deliberately dumb.** This was a explicit,
  deliberated decision, not an oversight: no `expectedResponseType` enums,
  no "did it invent an altitude" checkers, no LLM-as-judge. Each scenario
  tests one narrow, well-grounded behavior via simple substring checks; a
  human is expected to read the printed/markdown response for anything
  subtler (that's why every run's response is shown, not just failures). If
  asked to make a scenario "catch" some new failure mode, prefer grounding
  the scenario (add an earlier step or a pilot record that establishes the
  fact) over adding a new kind of automated check.
- **Scenarios must be self-contained and grounded.** If an expectation
  depends on a fact (e.g. "the aircraft was already cleared to land"), an
  earlier step of the scenario has to establish it, not assume it. If a
  scenario is a readback test, the clearance being read back has to actually
  have been issued by the pipeline in a previous step — a pilot line that
  merely *sounds* like a readback with nothing pending doesn't test what it
  claims to.
- **New concern → new file**, following the existing `src/ai/` split
  (per-job folders; within them prompt vs. model config vs. stats vs.
  knowledge loading). Don't let
  `singleCallAtc.ts` or the benchmark runner grow into catch-alls.
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
`npm run lab:chat` (single interaction on the legacy single-call path), the stage labs
(`lab:engine`, `lab:memory` need no model; `lab:interpreter`, `lab:renderer` do) or
`npm run lab:benchmark` (full end-to-end suite) are how to validate against the model — reading the printed responses
matters as much as the PASS/FAIL count.
