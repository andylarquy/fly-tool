using System;

#if HAS_SIMCONNECT
using System.Runtime.InteropServices;
using Microsoft.FlightSimulator.SimConnect;
#endif

namespace FlyTool.Msfs2024.Telemetry;

public sealed class SimConnectTelemetryClient : IDisposable
{
    public event EventHandler? Connected;
    public event EventHandler? Disconnected;
    public event EventHandler<AircraftTelemetry>? TelemetryReceived;

#if HAS_SIMCONNECT
    private const string ClientName = "Fly Tool Telemetry";
    private readonly IntPtr windowHandle;
    private readonly int messageId;
    private SimConnect? simConnect;

    private enum Definitions
    {
        AircraftTelemetry
    }

    private enum Requests
    {
        AircraftTelemetry
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct SimConnectAircraftTelemetry
    {
        public double LatitudeDegrees;
        public double LongitudeDegrees;
        public double AltitudeFeet;
        public double TrueHeadingDegrees;
        public double GroundSpeedKnots;
        public double PitchDegrees;
        public double BankDegrees;
        public int IsOnGround;
    }

    public SimConnectTelemetryClient(IntPtr windowHandle, int messageId)
    {
        this.windowHandle = windowHandle;
        this.messageId = messageId;
    }

    public void Connect()
    {
        if (simConnect != null)
        {
            return;
        }

        simConnect = new SimConnect(ClientName, windowHandle, (uint)messageId, null, 0);
        simConnect.OnRecvOpen += (_, _) => Connected?.Invoke(this, EventArgs.Empty);
        simConnect.OnRecvQuit += (_, _) => Disconnected?.Invoke(this, EventArgs.Empty);
        simConnect.OnRecvSimobjectData += OnReceiveSimObjectData;

        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE HEADING DEGREES TRUE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE PITCH DEGREES", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "PLANE BANK DEGREES", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.AddToDataDefinition(Definitions.AircraftTelemetry, "SIM ON GROUND", "Bool", SIMCONNECT_DATATYPE.INT32, 0, SimConnect.SIMCONNECT_UNUSED);
        simConnect.RegisterDataDefineStruct<SimConnectAircraftTelemetry>(Definitions.AircraftTelemetry);
        simConnect.RequestDataOnSimObject(
            Requests.AircraftTelemetry,
            Definitions.AircraftTelemetry,
            SimConnect.SIMCONNECT_OBJECT_ID_USER,
            SIMCONNECT_PERIOD.SIM_FRAME,
            SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
            0,
            0,
            0);
    }

    public void ReceiveMessage() => simConnect?.ReceiveMessage();

    private void OnReceiveSimObjectData(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA data)
    {
        if (data.dwRequestID != (uint)Requests.AircraftTelemetry || data.dwData.Length == 0)
        {
            return;
        }

        var values = (SimConnectAircraftTelemetry)data.dwData[0];
        TelemetryReceived?.Invoke(this, new AircraftTelemetry
        {
            LatitudeDegrees = values.LatitudeDegrees,
            LongitudeDegrees = values.LongitudeDegrees,
            AltitudeFeet = values.AltitudeFeet,
            TrueHeadingDegrees = values.TrueHeadingDegrees,
            GroundSpeedKnots = values.GroundSpeedKnots,
            PitchDegrees = values.PitchDegrees,
            BankDegrees = values.BankDegrees,
            IsOnGround = values.IsOnGround != 0
        });
    }

    public void Dispose()
    {
        if (simConnect == null)
        {
            return;
        }

        simConnect.Dispose();
        simConnect = null;
    }
#else
    public SimConnectTelemetryClient(IntPtr windowHandle, int messageId)
    {
    }

    public void Connect() => throw new InvalidOperationException(
        "SimConnect is not configured. Set MSFS_SDK or SimConnectAssemblyPath to the MSFS 2024 SDK managed assembly.");

    public void ReceiveMessage()
    {
    }

    public void Dispose()
    {
    }
#endif
}
