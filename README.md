# Fly Tool

Local-first flight-simulator immersion engine. The current scope is a Microsoft Flight Simulator 2024 telemetry client: it connects through SimConnect and reads basic data from the user aircraft.

## Requirements

- [Node.js 20.17+](https://nodejs.org/)
- Microsoft Flight Simulator 2024 running on the same PC

This project uses [node-simconnect](https://www.npmjs.com/package/node-simconnect), a TypeScript implementation of SimConnect. It does not require the MSFS SDK or any SimConnect DLLs.

## Run

\`\`\`powershell
npm install
npm run dev
\`\`\`

Start MSFS 2024 and load into a flight before running the app, or start the app first and retry after the simulator is available. Press Ctrl+C to disconnect and stop the app.

For a compiled production build:

\`\`\`powershell
npm run build
npm start
\`\`\`

## Current telemetry

- Latitude and longitude
- Altitude
- True heading
- Ground speed
- Pitch and bank
- On-ground state

The application reads telemetry only. It deliberately contains no ATC, careers, missions, multiplayer, or simulator abstraction yet.