namespace FlyTool.Msfs2024.Telemetry;

public sealed class AircraftTelemetry
{
    public double LatitudeDegrees { get; set; }
    public double LongitudeDegrees { get; set; }
    public double AltitudeFeet { get; set; }
    public double TrueHeadingDegrees { get; set; }
    public double GroundSpeedKnots { get; set; }
    public double PitchDegrees { get; set; }
    public double BankDegrees { get; set; }
    public bool IsOnGround { get; set; }
}
