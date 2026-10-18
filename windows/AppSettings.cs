using System;
using System.IO;
using System.Text.Json;

namespace HyunkAIHub;

public class AppSettings
{
    public string ServerUrl { get; set; } = "http://localhost:3000";
    public string FallbackServerUrl { get; set; } = "http://172.17.35.34:3000";
    public bool AutoStartLocalServer { get; set; } = true;
    public double WindowWidth { get; set; } = 1280;
    public double WindowHeight { get; set; } = 820;
    public bool IsMaximized { get; set; } = false;
    public double ZoomFactor { get; set; } = 1.0;

    private static readonly string SettingsFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HyunkAIHub"
    );

    private static readonly string SettingsFile = Path.Combine(SettingsFolder, "config.json");

    public static string GetDataDirectory()
    {
        string dir = Path.Combine(SettingsFolder, "WebViewData");
        if (!Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }
        return dir;
    }

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsFile))
            {
                string json = File.ReadAllText(SettingsFile);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                if (settings != null) return settings;
            }
        }
        catch
        {
            // Fallback to default
        }

        return new AppSettings();
    }

    public void Save()
    {
        try
        {
            if (!Directory.Exists(SettingsFolder))
            {
                Directory.CreateDirectory(SettingsFolder);
            }

            string json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
        catch
        {
            // Ignore error on save
        }
    }
}
