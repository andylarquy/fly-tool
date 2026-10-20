# Fly Tool

Local-first flight-simulator immersion engine. It connects to Microsoft Flight Simulator 2024 through SimConnect, reads basic data from the user aircraft, and uses a local [Ollama](https://ollama.com/) model as air traffic control that answers the pilot's typed radio transmissions. Everything runs locally.

## Requirements

- [Node.js 20.17+](https://nodejs.org/)
- Microsoft Flight Simulator 2024 running on the same PC (not needed for `npm run lab` or `npm run benchmark`)
- [Ollama](https://ollama.com/) running locally with the model configured in `src/ai/modelConfig.ts` pulled

This project uses [node-simconnect](https://www.npmjs.com/package/node-simconnect), a TypeScript implementation of SimConnect. It does not require the MSFS SDK or any SimConnect DLLs.

## Run

```powershell
npm install
npm run dev
```

Start MSFS 2024 and load into a flight before running the app, or start the app first and retry after the simulator is available. Press Ctrl+C to disconnect and stop the app.

For a compiled production build:

```powershell
npm run build
npm start
```

## Current telemetry

- Latitude and longitude
- Altitude
- True heading
- Ground speed
- Pitch and bank
- On-ground state

The live app does not yet build real situational context for ATC; it sends an empty situation context and a placeholder callsign.

## Lab and benchmark

Neither needs the simulator.

```powershell
npm run lab        # interactive ATC loop against fixed aircraft states (src/lab/cases.ts)
npm run benchmark  # runs the scenario suite 3x each and writes a report to benchmark-results/
```

The ATC aviation knowledge base lives in `knowledge/*.md` and is appended to the system prompt.