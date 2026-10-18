using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace HyunkAIHub;

public class ServerManager
{
    private static readonly HttpClient HttpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
    private Process? _serverProcess;

    public bool IsServerStartedByApp => _serverProcess != null && !_serverProcess.HasExited;

    public async Task<bool> IsServerReachableAsync(string url)
    {
        try
        {
            var uri = new Uri(url);
            var testUri = new Uri(uri, "/api/status");
            var response = await HttpClient.GetAsync(testUri);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            try
            {
                var response = await HttpClient.GetAsync(url);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }
    }

    public static string? FindWebsiteAiDirectory()
    {
        // 1. Check relative to executing assembly
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string candidate1 = Path.GetFullPath(Path.Combine(baseDir, "..", "website-ai"));
        if (Directory.Exists(candidate1) && File.Exists(Path.Combine(candidate1, "package.json")))
        {
            return candidate1;
        }

        string candidate2 = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "website-ai"));
        if (Directory.Exists(candidate2) && File.Exists(Path.Combine(candidate2, "package.json")))
        {
            return candidate2;
        }

        // 2. Known default path
        string knownPath = @"C:\Users\AXIOO\.gemini\antigravity\scratch\website-ai";
        if (Directory.Exists(knownPath) && File.Exists(Path.Combine(knownPath, "package.json")))
        {
            return knownPath;
        }

        return null;
    }

    public async Task<bool> StartLocalServerAsync(Action<string>? statusCallback = null)
    {
        string? projectDir = FindWebsiteAiDirectory();
        if (projectDir == null)
        {
            statusCallback?.Invoke("Direktori website-ai tidak ditemukan.");
            return false;
        }

        statusCallback?.Invoke("Memulai server lokal Next.js di background...");

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c \"set PATH=C:\\Program Files\\nodejs;%PATH% && npm start\"",
                WorkingDirectory = projectDir,
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            _serverProcess = Process.Start(psi);
            if (_serverProcess == null)
            {
                statusCallback?.Invoke("Gagal meluncurkan proses server.");
                return false;
            }

            // Wait for server to become reachable (up to 15 seconds)
            for (int i = 0; i < 30; i++)
            {
                await Task.Delay(500);
                if (await IsServerReachableAsync("http://localhost:3000"))
                {
                    statusCallback?.Invoke("Server lokal aktif dan siap digunakan!");
                    return true;
                }
            }

            statusCallback?.Invoke("Server sedang booting, mencoba menyambung...");
            return true;
        }
        catch (Exception ex)
        {
            statusCallback?.Invoke($"Error saat menjalankan server: {ex.Message}");
            return false;
        }
    }

    public void StopServer()
    {
        if (_serverProcess != null && !_serverProcess.HasExited)
        {
            try
            {
                // Kill process tree
                Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill",
                    Arguments = $"/F /T /PID {_serverProcess.Id}",
                    CreateNoWindow = true,
                    UseShellExecute = false
                })?.WaitForExit(3000);
            }
            catch
            {
                // Ignore cleanup errors
            }
        }
    }
}
