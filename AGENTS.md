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
  `npm run lab:benchmark -- --section ground` (or `--scenario <text>`) runs a
  subset and writes a report with an `_only-<filter>` suffix.
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
  stay empty. It then evaluates the taxi readback verifier on labeled
  replies (`interpreter/readbackSamples.ts`, English and Spanish);
  `npm run lab:interpreter -- --verifier` runs just that part. Not wired into the live app.
- `npm run lab:engine` — build + run `src/lab/engine/engine.js`.
  Deterministic (no Ollama): replays scripted pilot messages/phases/events
  through `decide` and checks the resulting `AtcIntent` labels per step.
  Exits non-zero on any mismatch.
- `npm run lab:renderer` — build + run `src/lab/renderer/run.js`. Feeds fixed
  `AtcIntent` lists (`render/cases.ts`) to `renderTransmission` 3x each and
  checks the wording with the benchmark's substring checks (plus "starts with
  the callsign"). Needs Ollama; tests the Render stage in isolation.
- `npm run lab:taxi` — build + run `src/lab/taxi/run.js`. Deterministic (no
  Ollama): routing and runway matching over the Lab Field taxi network, then
  the real situation derivation + engine over generated ground telemetry
  (request, readback, repeat, wrong turn, wrong hold line, runway entry,
  taxi to parking, crossing the active runway after a hold, crossing another
  runway inside the route, the fallback away from the network, and the
  ground/tower handoffs, redirects and radio-tuning cases). The stage labs run
  on `labAirportSingleController` (no frequencies) so they keep covering the
  single-controller behavior; handoff scenarios use `labAirport`. Exits
  non-zero on any failure.
- `npm run lab:directory` — build + run `src/lab/directory/run.js`.
  Deterministic: CSV parsing, text matching and the shortlist on a small
  fixture; the loader on inline CSV; and, if the CSVs are present, checks
  against the real snapshot (skipped otherwise).
- `npm run lab:intake` — build + run `src/lab/intake/run.js`. Deterministic:
  the intake dialogue state machine with scripted model verdicts (volunteered,
  partial, IFR, ambiguous, unknown, local, abandoned, never held up) and the
  destination lookup over `lab/directoryFixture.ts` (fictional airports around
  the Lab Field). The extractor itself is evaluated by
  `npm run lab:interpreter -- --intake`.
- `npm run lab:play` — build + run `src/lab/play/run.js`. The playable end to
  end: type radio calls as the pilot and step a *simulated* aircraft through
  the standard pattern flight, with the real pipeline (classifier, engine,
  renderer) answering and speaking up on its own. Needs Ollama. Commands start
  with `/` (`/next` start the next stage in real time and say how long it
  takes, `/go` run it to the end, `/advance <s>` fast-forward one tick
  per second, `/jump`, `/speed`, `/tune`, `/where`, `/stages`, `/quit`);
  flags: `--intake` (ask for destination and rules), `--speed <n>`,
  `--lab-airports` (force the small fictional list; the default is the real OurAirports data whenever the CSVs are on disk), `--callsign <x>` (a mistyped option is reported, not ignored), `--records <dir>`
  (where the pilot record lives; default `data/pilot-records`, so memory
  carries over between runs). Each ATC line is followed by a trace line:
  phase, what the classifier heard, and the intents. Input is handled one line
  at a time.
- `npm run lab:sim` — build + run `src/lab/sim/run.js`. Deterministic: flies
  the simulated aircraft through the whole standard flight with the real
  situation derivation (the phases arrive in order with no flicker, lift-off
  and touchdown once, a gentle touchdown rate), and tests `FlightSession` with
  a slow fake pipeline (ticks dropped while a turn runs, pilot lines in order,
  telemetry read when the turn runs, failures survived, stop saves once).
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
- `src/taxi/routing.ts` — pure taxi-graph functions (no LLM, no sim). The
  aircraft is located by its nearest *segment* (`LOCATE_RADIUS_FEET`; farther
  than that it is "not on the network"), not its nearest vertex, because
  vertices on a straight taxiway can be far apart. `planRouteFrom` starts from
  both ends of that segment and keeps the segment itself in the route. Routes
  are Dijkstra with a penalty for crossing a runway, and are spoken as `legs`
  (taxiway names without repeats, unnamed apron paths dropped, and a "cross
  runway X" for each `crossesRunway` segment). `holdShortPointFor` picks, of
  all hold lines labeled with a runway, the one nearest that runway's own
  threshold (a full-length departure). `sameRunway` knows 23/05 and 05L/23R
  are the same runway. Also nearest parking and distance from a route. A `TaxiNetwork` (`domain/TaxiNetwork.ts`: points,
  undirected named segments, parking spots, hold-short points) hangs off
  `Airport.taxi` and is optional; the SimConnect adapter will build it from
  `TAXI_POINT`/`TAXI_PATH`/`TAXI_NAME`/`TAXI_PARKING`. `lab/airports.ts` has a
  fictional one for the Lab Field, including taxiway E, which crosses runway
  23 at its midpoint to a far-side Ramp 3. The airport's center sits on that
  crossing, so stage-lab helpers place their generic ground aircraft off the
  network.
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
  `intentBuilders.ts` (`silent`/`say`/`ask`/`clear`), `decisionTypes.ts`,
  `decideTaxi.ts` (ground guidance, below), `positions.ts` (who the pilot is
  talking to, below), `decideIntake.ts` (the flight plan dialogue, below).
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
  Ground guidance (`decideTaxi.ts`, only when `Airport.taxi` exists and the
  aircraft is within `LOCATE_RADIUS_FEET` of the network; otherwise the old
  behavior stays): a taxi/parking request, or "ready for departure" while not
  holding short of the *active* runway, plans a route to the active runway's
  hold line (or the nearest parking) and issues a `taxi_instruction`
  (`TaxiState` in `EngineState` keeps the route and the legs of the current
  instruction). A readback is checked
  against the runway; a wrong one re-issues the route as `readback_error`; a
  question or repeated request re-issues it as `repeat`. Each tick checks
  progress: arriving at the destination completes it silently (the pilot then
  asks for departure and gets line up and wait — the future ground-to-tower
  handoff belongs there); moving >120 ft off the route for 4 s re-plans from
  the current point and issues `off_route` (30 s cooldown); being on a runway
  in the `Taxiing` phase with no runway clearance gives `hold_position`
  (20 s cooldown). Taxi readback fidelity: while a taxi instruction waits for its readback,
  the pipeline makes one extra model call (`verifyTaxiReadback`, see
  `ai/interpreter/`) that compares the pilot's words with the instruction and
  attaches a `TaxiReadbackJudgement` to the message. The engine applies the
  strictness tier to it and contains no words of any language. A wrong runway
  is corrected at every strictness; beyond that: strict wants the hold-short
  and the whole route ("say again, full readback" when incomplete), normal
  wants the hold-short and no wrong names, relaxed accepts anything (a wrong
  turn is caught later by the progress check). One instruction is rejected at
  most `MAX_READBACK_REJECTIONS` (2) times: the judgement can be wrong and the
  same words would be rejected again at temperature 0. A reply the model
  judges to be repeating the instruction is treated as its readback even if
  the classifier labeled it a request. Runway crossings:Runway crossings: a runway other than the active one is
  crossed as part of the route ("via Golf, cross runway 13, Golf"). The
  *active* runway never is: the first instruction ends with "hold short
  runway 23", and when the pilot is stationary at that point with no runway
  clearance active, a `continue` instruction ("Cross runway 23. Taxi to ...")
  follows on its own. While that crossing clearance is in force, being on the
  runway does not trigger `hold_position`; it ends once the aircraft has been
  on the runway and left it. A hold line is the new `FlightPhase.HoldingShort`.
  Ground and tower (`positions.ts`): an airport has *separate* controllers
  only when `Airport.frequencies` has both a ground and a tower frequency;
  otherwise one controller does everything (legacy behavior, also what an
  airport with no frequency data gets). With both, `EngineState.position`
  records who the pilot is with: set once from where the aircraft is (ramp or
  taxiway: ground; hold line, runway or air: tower), and afterwards from the
  radio when the telemetry carries `com1FrequencyMhz` and it matches one of
  them (a frequency that matches neither is ignored, never silence). A request
  that belongs to the other controller is answered with a `handoff` ("Contact
  tower 118.1.") and the position changes; the pilot repeats it to the new
  one. Taxi and parking belong to ground; a departure call (takeoff, line up,
  hold short) belongs to tower only at the hold line of the *active* runway or
  on it, and is a taxi matter anywhere else (so a pilot at the wrong hold line
  is sent to ground, not bounced back); pattern and landing calls belong to
  tower; emergencies, readbacks and questions are never redirected. Proactive
  handoffs: arriving at a runway hold line after a taxi goes ground -> tower;
  after a landing, once the aircraft is off the runway, tower -> ground
  (`awaitingGroundHandoff`, set by the touchdown event).
  Flight intake (`decideIntake.ts`, opt-in via
  `createEngineState(runway, { askFlightIntake: true })`; off by default so the
  older scenarios are unchanged): the first departure call (taxi, takeoff, line
  up, hold short) with no flight plan is answered with "Say destination and
  flight rules" and *held back*; once the plan is complete the held-back
  request is answered. Pilots who give the plan up front, or only part of it,
  are asked only for the rest. VFR is accepted; IFR is refused ("IFR is not
  available") and the rules asked again. A destination the pilot named always
  wins over a "local" guess, and a "local" guess on a departure request that
  gives no rules is ignored (the model over-reports it). Naming this airport,
  or "local flight / pattern work", makes the destination this airport.
  A name the directory cannot place is asked for once more; said the same way again it is taken as spoken (a real place missing from the data, or a speech-to-text habit), so the pilot is never stuck. Several airports with the name get "Confirm destination, A or B" (full names
  when the short ones would sound the same). The pilot is asked at most three
  times, then left alone (`abandoned`): the experience stays slack. Arrivals,
  emergencies, readbacks and questions are never held up.
  Position claims and check-ins: a pilot saying "holding short runway 23"
  (not a request, nothing pending a readback) is making a report, so the
  telemetry decides what it means. "At the active runway's hold line" is
  judged from the aircraft's live position and speed (not the committed phase,
  which needs a few seconds of standing still and would call a pilot who has
  just stopped "still taxiing"). At the line it is a call for the departure
  clearance (to a ground controller it first hands over to tower); elsewhere
  on the ground it is queried ("Confirm holding short, I show you taxiing").
  After a handoff (`awaitingCheckIn`), the first call that asks nothing is
  answered ("Tower, hold short runway 23" / "Ground, go ahead"); a request
  just proceeds and clears the flag.
  Remarks (`engine/remarks.ts`) are optional flavor appended to a plain
  reply (`issue_clearance`/`instruct`/`advise`/`acknowledge`) only when:
  not strict, no emergency, past a 120 s gap since the last remark, once per
  kind per session, one history remark per session (never while the pilot is
  busy), and not the same kind the last session ended with. Touchdown
  remarks follow the landing quality. They need `DecisionContext.memory`;
  without it the engine never remarks.
  Readback checks always correct a wrong runway/clearance; a missing runway is
  tolerated unless strictness is "strict". A leg call ("downwind", "airborne")
  that the classifier labeled a readback is a position report when the
  aircraft really is on that leg (the model takes "downwind" after "report
  downwind" for an echo); a readback of "report base" while on downwind names a
  different leg and stays a readback. Not wired into `index.ts`.
- `src/sim/` — a stand-in simulator. `pathFollower.ts` moves a point along
  legs of runway-frame specs (headings take the short way round, lift-off and
  touch-down happen halfway through the leg that crosses), `standardFlight.ts`
  is a left-hand pattern flight in nine stages (taxi, line up, take off,
  crosswind, downwind, base, final, land, taxi in), `simulatedSimulator.ts`
  wraps it in the `SimulatorAdapter` interface so the application cannot tell
  it from MSFS, and `runwayFrame.ts` turns a runway-frame spec into
  `AircraftState`.
- `src/app/` — `FlightSession`, the live loop, independent of any simulator:
  the simulator pushes telemetry, a timer calls `tick()`, the pilot calls
  `say()`. The pipeline is stateful, so turns run strictly one at a time:
  pilot lines queue in order, a tick that finds a turn in flight is dropped
  (the next one has fresher telemetry), each turn reads the latest telemetry
  when it *runs*, a failing turn is reported and the loop carries on, and
  `stop()` waits for the turn in flight and saves the pilot record. Not yet
  used by `index.ts` (still the single-call path); wiring MSFS means giving it
  `MsfsSimulator` and a nearest-airport source.
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
- `src/directory/` — knowing which airport a pilot means (no LLM, no sim).
  `ourAirports.ts` parses the OurAirports CSVs in `datasets/ourairports/`
  (gitignored, see its README; ~0.4 s to parse 72k airports) into
  `AirportEntry` (`domain/AirportEntry.ts`: codes, names, aliases from the
  name + municipality + keywords, position, type, joined frequencies); closed
  airports and rows with no position are dropped. `airportDirectory.ts`
  `shortlist(spoken, {near})` returns ranked candidates and whether the best is
  `confident` (the best name match is good, and the runner-up scores at most
  80% of it: a relative test, since distance scales every score down): exact
  codes, then word matching
  that ignores accents, case and generic words ("airport", "aeropuerto de"),
  tolerates a typo in long words, needs every query word to match something,
  and weighs airport size (strongly: "Bariloche" is the international airport,
  not the aeroclub strip that carries the town's name as a keyword) and
  distance from `near` (a multiplier that can halve a far airport's score) (so "Moron" near Buenos
  Aires is the Argentine one). An ambiguous result is meant to make the
  controller confirm, not guess. Index build is ~0.2 s and shortlist ~50-90 ms
  over the full set. Distance is a strong signal: a same-named airport at least
  2x and 100 nm farther than the best match is not counted as a rival (nobody
  means Santa Fe, New Mexico from Buenos Aires), but at similar distances the
  bigger airport wins and a close call stays ambiguous. `exclude` lets the
  caller leave out the airport the pilot is on. Aliases such as "Aeroparque"
  are only as good as the data's keywords; a local alias file is still to
  come.
- `src/utils/csv.ts` — RFC 4180 parser (quoted commas, doubled quotes, line
  breaks); an empty number field must not become 0.
- `src/utils/geo.ts` — flat-earth runway-frame math used by the above.
- `src/utils/frequency.ts` — how a frequency is written (118.1, 118.125).
- `src/utils/phonetic.ts` — the phonetic alphabet, used only to *speak* taxiways
  (and callsigns). Understanding what the pilot said is the model's job, not a
  word list's.
- `src/adapters/` — simulator integration behind `SimulatorAdapter`.
  `msfs2024/taxiFacility.ts` is the pure half of reading an airport's taxi
  data: `buildTaxiNetwork` turns decoded `TAXI_POINT`/`TAXI_PATH`/`TAXI_NAME`/
  `TAXI_PARKING` values (`RawAirportTaxiData`) into a `TaxiNetwork`. It keeps
  taxi and path types, turns runway-type paths into crossings, drops closed,
  vehicle, road and painted-line paths, treats a parking path's END as a
  *parking index* (not a taxi point), turns the parking spots a path reaches
  into points, and labels hold lines with the runway end they serve by
  geometry. `frequencyFacility.ts` does the same for `FREQUENCY` entries
  (`buildFrequencies`: type codes, Hz to MHz, deduplicated; types the engine
  has no use for are kept as "other"). `lab/taxi/facilityFixture.ts` is a fixture with each of those
  traps in it. The still-missing half is reading the raw SimConnect buffers
  into `RawAirportTaxiData`.
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
      output, stateless. Prompt/schema in `pilotMessagePrompt.ts`. The runway
      is an enum of the airport's runways plus `other` (a runway the airport
      does not have: without it "runway 21" was erased to "none", which reads
      as "no runway named", so a wrong-runway readback went unnoticed) and
      `none`; it must come with `runwayQuote`, and the runway is kept only if
      that quote really occurs in the transmission (`isQuoted`), because the
      model otherwise reports runways on transmissions that name none. The
      quote is the *last* schema field and prompt paragraph: placed first it
      dragged message-type accuracy down 10 points.
    - `emergencyDetailsExtractor.ts` / `emergencyDetailsPrompt.ts` — a second,
      separate call (`extractEmergencyDetails`) that the pipeline only makes
      when the message is an emergency or one is already active. Kept out of
      the main classifier because folding these fields in raised its median
      latency from ~0.65 s to ~1.8 s and lowered type accuracy.
    - `taxiReadbackVerifier.ts` / `taxiReadbackPrompt.ts` — compares a pilot's
      reply with the pending taxi instruction (any language). It asks for
      evidence, not just verdicts: a quote for the hold-short and, per taxiway
      the pilot said, the words used plus which expected taxiway (or "other")
      they match; code keeps a quote only if it really occurs in the transcript
      (a plain substring test), and drops "other" mentions that are really the
      destination, a runway, or the callsign (known from our own data). Yes/no
      judgements alone were loose enough to give false "wrong taxiway" alarms.
      It also returns the runway the pilot said (with a quote, "two one" read
      as 21) and code compares it, as data, with the runway ATC issued
      (`runwayMismatch`): a wrong runway is corrected at every strictness. It
      runs for *any* reply (not an emergency) while a taxi instruction awaits
      its readback, because the classifier labels a readback a request, other
      or position report; a reply the model judges to be a readback is treated
      as one whatever the label. Only during a pending taxi readback, ~2.5 s.
    - `flightIntakeExtractor.ts` / `flightIntakePrompt.ts` — pulls the
      destination (in the pilot's own words), the flight rules and a
      local-flight flag out of a reply, with the callsign and the last ATC line
      as context (a bare name only means a destination because the controller
      just asked). Every field is an enum with an explicit "none" (a boolean
      for "local" was over-asserted on any transmission without a destination).
      A destination is kept only if the pilot actually said it, or if it is a
      code whose letters are the initials of consecutive spoken words. The
      pipeline then resolves it in `src/directory/` (`resolveDestination`:
      confident match, or two options, or "unknown"; a spelled code
      ("Sierra Alpha Echo Zulu") is tried through its initials only when the
      words did not already name an airport; cue words such as "destino" in
      front of the name are dropped on a retry). It runs only while the plan is
      incomplete.
    - `modelOutputParsing.ts` — small shared helpers for validating model
      output.
  - `renderer/` — `AtcIntent[]` -> the controller's words (ATC side).
    - `intentRenderer.ts` / `intentRendererPrompt.ts` / `describeIntent.ts` —
      turns intents into one transmission using a small phrasebook prompt.
      Empty intents means no model call (silence). `describeIntent`
      deliberately leaves out internal values such as the touchdown rate so
      the model can't read them out, and hands the model the exact wording for
      taxi routes (taxiways spoken phonetically, composed in code),
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

## Unverified against a real simulator

Nothing has run against MSFS yet. These assumptions are built in and need
checking on a sim machine (a wrong one fails quietly, not loudly):

- Runway `HEADING` from facility data is true or magnetic (the geometry
  assumes true).
- `TAXI_POINT` `BIAS_X` is east and `BIAS_Z` is north, from the airport
  reference point (`positionOf` in `taxiFacility.ts`).
- `TAXI_PATH` type values: 1 taxi, 3 parking, 4 path are community-confirmed;
  2 for runway is inferred (`PATH_TYPE`). Closed (5), vehicle (6), road (7)
  and painted line (8) are excluded.
- Parking paths: START is a taxi point and END is a parking index.
- Hold lines have no runway in the data; the label comes from geometry
  (nearest runway end within 400 ft of a centerline).
- Parking names (`TAXI_PARKING` `NAME` enum) still need decoding to strings.
- `FREQUENCY` entries: the type codes (5 ground, 6 tower, ...) are documented,
  but some airports have no ground or tower entry, and some towers are marked
  as CTAF (a known navdata problem). With either missing the engine falls back
  to one controller. Approach/departure/center/ATIS frequencies are decoded but
  not used yet.
- The tuned COM1 frequency SimVar (`COM ACTIVE FREQUENCY:1`, in MHz) is not
  read yet; `AircraftState.com1FrequencyMhz` is optional and the engine only
  uses it when present.
- `ATC ID` returning the user aircraft's tail number; AI traffic fields;
  `PLANE TOUCHDOWN NORMAL VELOCITY`; wind and pressure SimVars.

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
