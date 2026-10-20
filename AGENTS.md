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
  or `[NO RESPONSE]` (`src/ai/ai.ts`, prompt in `src/ai/aiConfig.ts`).
- A markdown knowledge base (`/knowledge/*.md`, root-level) appended to the
  system prompt.
- Conversation history/memory across turns, with explicit reset/seed hooks
  for testing (`resetConversation`, `seedConversationTurn` in `ai.ts`).
- Two interactive CLIs (`npm run dev`, `npm run lab`) and a behavioral
  benchmark harness (`npm run benchmark`) — see below.

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
- `npm run lab` — build + run `src/lab/lab.ts`. Same interactive loop but
  against fixed `AircraftState`/`AtcState` fixtures in `src/lab/cases.ts` —
  no simulator required, useful for iterating on the prompt/knowledge base
  quickly.
- `npm run benchmark` — build + run `src/lab/benchmark/benchmark.ts`. Runs a
  fixed scenario suite (`src/lab/benchmark/scenarios.ts`, roughly twenty
  scenarios covering readbacks, traffic pattern, takeoff, landing) against
  the model 3x each, evaluates each response with simple string checks
  (`checks.ts`), and writes a markdown report to `/benchmark-results/`
  (gitignored). Requires Ollama running locally with the configured `MODEL`
  pulled; takes a few minutes.
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
- `src/adapters/` — simulator integration behind `SimulatorAdapter`.
- `src/ai/`
  - `ai.ts` — orchestrates one ATC turn: builds the prompt, calls Ollama,
    returns `{ content, thinking, response }`. Owns the module-level
    `conversationHistory`.
  - `aiConfig.ts` — the system prompt (`AI_SYSTEM_PROMPT`). Edited by hand;
    don't rewrite it as a side effect of other changes.
  - `modelConfig.ts` — single source of truth for `MODEL` and `THINKING`.
    Also has the per-model workaround for models that ignore `think: false`
    and inline reasoning into `content` instead of the dedicated `thinking`
    field (`MODELS_WITH_INLINE_THINKING`).
  - `inferenceStats.ts` — turns Ollama's raw nanosecond durations into
    `InferenceMetrics` (seconds, tokens, tok/s). Takes the raw `ChatResponse`
    — i.e. `getAiResponse(...).response`, not the `AiResponse` wrapper
    itself.
  - `knowledgeBase.ts` — loads every `.md` file from root-level `/knowledge/`
    (sorted by filename, hence the `01-`, `02-` prefixes), concatenates them
    under a `## filename` heading each, appended to the system prompt in
    `ai.ts`. Deliberately **not** under `src/` — `tsc` only emits `.ts`
    output to `dist/`, so any asset a compiled script reads at runtime needs
    to live outside `src/` and be resolved via `process.cwd()`. The same
    applies to `/benchmark-results/`.
- `src/lab/`
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
- **New concern → new file**, following the existing `src/ai/*.ts` split
  (prompt vs. model config vs. stats vs. knowledge loading). Don't let
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
  `npm run build && node dist/path/to/file.js` in `package.json`.

## Sanity-checking changes

There's no test framework. `npx tsc --noEmit` is the baseline check after
any edit. For behavior changes to the ATC prompt or knowledge base,
`npm run lab` (single interaction, fast) or `npm run benchmark` (full suite)
are how to validate against the model — reading the printed responses
matters as much as the PASS/FAIL count.
