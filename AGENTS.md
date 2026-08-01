Project: fly tool

Goal:
Build a local-first AI immersion engine for flight simulators.

Initial target:
Microsoft Flight Simulator 2024.

Long-term goals:
- Local AI ATC
- Persistent pilot/world memory
- Career and mission system
- Simulator-agnostic API
- Community extensibility

Architecture principles:
- Local-first. No cloud dependency required.
- Simulator-specific functionality should eventually live behind adapters.
- LLMs should not contain game or aviation state.
- Deterministic systems own world state and aviation logic.
- LLMs primarily interpret/generate natural language.
- Components should eventually be replaceable.

CURRENT SCOPE:
Connect to MSFS 2024 through SimConnect and read basic aircraft telemetry.

DO NOT IMPLEMENT YET:
- ATC
- Career system
- Missions
- Multiplayer
- Plugin system
- Other simulators
- Fine tuning