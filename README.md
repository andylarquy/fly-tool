# Fly Tool

Local-first flight-simulator immersion engine. The current project connects to Microsoft Flight Simulator 2024 through SimConnect and reads basic user-aircraft telemetry only.

## Prerequisites

- Microsoft Flight Simulator 2024 and its SDK, including the SimConnect SDK.
- .NET Framework 4.8 runtime (the MSFS managed SimConnect wrapper requires .NET Framework 4.7 or later). The build restores its reference assemblies automatically.
- .NET SDK 8+ or Visual Studio 2022 to build the solution.

## Configure SimConnect

The managed SimConnect wrapper and its native `SimConnect.dll` dependency are not committed to this repository. They are supplied by the MSFS SDK and copied beside the executable at build time so the app can load them reliably.

### Recommended: repository-local setup

Copy `SimConnect.Local.props.example` to `SimConnect.Local.props`, then replace its placeholder value with the full path to `Microsoft.FlightSimulator.SimConnect.dll` in your MSFS 2024 SDK. This file is ignored by Git, so your local installation path stays local and works from every terminal.

```powershell
Copy-Item SimConnect.Local.props.example SimConnect.Local.props
notepad SimConnect.Local.props
dotnet build FlyTool.sln
```

The expected SDK-relative location is `SimConnect SDK\lib\managed\Microsoft.FlightSimulator.SimConnect.dll`.

### Alternative: current PowerShell session

Set `MSFS_SDK` to the SDK root before building, for example:

```powershell
$env:MSFS_SDK = 'C:\MSFS SDK'
dotnet build FlyTool.sln
dotnet run --project src\FlyTool.Msfs2024.Telemetry
```

If your SDK is elsewhere, provide the assembly explicitly:

```powershell
dotnet build FlyTool.sln -p:SimConnectAssemblyPath='D:\path\to\Microsoft.FlightSimulator.SimConnect.dll'
```

Until that assembly is configured, the project still builds but reports a clear configuration error on launch.

## Current telemetry

- Latitude and longitude
- Altitude
- True heading
- Ground speed
- Pitch and bank
- On-ground state

The Windows telemetry window owns SimConnect's message handle and subscribes at `SIM_FRAME`. It deliberately contains no ATC, careers, missions, multiplayer, or simulator abstraction yet.
