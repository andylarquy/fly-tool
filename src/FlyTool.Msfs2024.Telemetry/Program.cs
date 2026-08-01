using System;
using System.Windows.Forms;

namespace FlyTool.Msfs2024.Telemetry;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new TelemetryWindow());
    }
}
