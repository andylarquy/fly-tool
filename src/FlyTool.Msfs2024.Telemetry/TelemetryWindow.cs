using System;
using System.Drawing;
using System.Windows.Forms;

namespace FlyTool.Msfs2024.Telemetry;

internal sealed class TelemetryWindow : Form
{
    private const int WmUserSimConnect = 0x0402;
    private readonly Label statusLabel;
    private readonly Label telemetryLabel;
    private SimConnectTelemetryClient? telemetryClient;

    public TelemetryWindow()
    {
        Text = "Fly Tool — MSFS 2024 Telemetry";
        ClientSize = new Size(1220, 220);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        statusLabel = new Label { AutoSize = true, Location = new Point(16, 16), Text = "Starting…" };
        telemetryLabel = new Label { AutoSize = true, Location = new Point(16, 48), Text = "Waiting for telemetry…" };
        Controls.Add(statusLabel);
        Controls.Add(telemetryLabel);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        try
        {
            telemetryClient = new SimConnectTelemetryClient(Handle, WmUserSimConnect);
            telemetryClient.Connected += (_, _) => statusLabel.Text = "Connected to Microsoft Flight Simulator 2024.";
            telemetryClient.Disconnected += (_, _) => statusLabel.Text = "Simulator connection closed.";
            telemetryClient.TelemetryReceived += (_, telemetry) => telemetryLabel.Text = FormatTelemetry(telemetry);
            telemetryClient.Connect();
        }
        catch (Exception exception)
        {
            statusLabel.Text = exception.Message;
        }
    }

    protected override void DefWndProc(ref Message m)
    {
        if (m.Msg == WmUserSimConnect)
        {
            telemetryClient?.ReceiveMessage();
            return;
        }

        base.DefWndProc(ref m);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            telemetryClient?.Dispose();
        }

        base.Dispose(disposing);
    }

    private static string FormatTelemetry(AircraftTelemetry telemetry) =>
        $"Lat {telemetry.LatitudeDegrees:F5}°   Lon {telemetry.LongitudeDegrees:F5}°\r\n" +
        $"Altitude {telemetry.AltitudeFeet:F0} ft   Ground speed {telemetry.GroundSpeedKnots:F1} kt\r\n" +
        $"Heading {telemetry.TrueHeadingDegrees:F1}°   Pitch {telemetry.PitchDegrees:F1}°   Bank {telemetry.BankDegrees:F1}°\r\n" +
        $"On ground: {(telemetry.IsOnGround ? "yes" : "no")}";
}
