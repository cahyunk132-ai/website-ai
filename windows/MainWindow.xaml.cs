using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace HyunkAIHub;

public partial class MainWindow : Window
{
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    private readonly AppSettings _settings;
    private readonly ServerManager _serverManager;
    private bool _isWebViewInitialized;
    private bool _isFullscreen;
    private WindowState _previousWindowState = WindowState.Normal;

    public MainWindow()
    {
        InitializeComponent();

        _settings = AppSettings.Load();
        _serverManager = new ServerManager();

        // Restore window preferences
        if (_settings.WindowWidth >= 800) Width = _settings.WindowWidth;
        if (_settings.WindowHeight >= 600) Height = _settings.WindowHeight;
        if (_settings.IsMaximized) WindowState = WindowState.Maximized;

        ServerUrlText.Text = _settings.ServerUrl;
        OverlayTargetUrl.Text = _settings.ServerUrl;

        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        KeyDown += MainWindow_KeyDown;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        // Set immersive dark title bar on Windows 10/11
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            int darkMode = 1;
            // 20 is DWMWA_USE_IMMERSIVE_DARK_MODE on modern Windows 11/10
            DwmSetWindowAttribute(hwnd, 20, ref darkMode, sizeof(int));
        }
        catch
        {
            // Ignore on older Windows versions
        }

        await InitializeAppAsync();
    }

    private async Task InitializeAppAsync()
    {
        SetStatus(false, "Memeriksa koneksi server...");

        string targetUrl = _settings.ServerUrl;
        OverlayTargetUrl.Text = targetUrl;
        OverlaySubtitle.Text = "Menghubungkan ke server backend...";
        LoadingProgressBar.Visibility = Visibility.Visible;
        ErrorActionButtons.Visibility = Visibility.Collapsed;
        OverlayContainer.Visibility = Visibility.Visible;

        // Check if server is reachable
        bool reachable = await _serverManager.IsServerReachableAsync(targetUrl);

        if (!reachable)
        {
            // If it's localhost and auto-start is enabled, attempt background server launch
            if (_settings.AutoStartLocalServer && (targetUrl.Contains("localhost") || targetUrl.Contains("127.0.0.1")))
            {
                OverlaySubtitle.Text = "Server lokal terdeteksi belum aktif. Menjalankan Next.js di background...";
                reachable = await _serverManager.StartLocalServerAsync(msg =>
                {
                    Dispatcher.Invoke(() => OverlaySubtitle.Text = msg);
                });
            }
        }

        if (!reachable)
        {
            // Check fallback Wi-Fi LAN address if localhost failed
            if (targetUrl.Contains("localhost") && !string.IsNullOrEmpty(_settings.FallbackServerUrl))
            {
                OverlaySubtitle.Text = "Mencoba fallback alamat Wi-Fi / LAN...";
                bool lanReachable = await _serverManager.IsServerReachableAsync(_settings.FallbackServerUrl);
                if (lanReachable)
                {
                    targetUrl = _settings.FallbackServerUrl;
                    _settings.ServerUrl = targetUrl;
                    _settings.Save();
                    ServerUrlText.Text = targetUrl;
                    OverlayTargetUrl.Text = targetUrl;
                    reachable = true;
                }
            }
        }

        if (!reachable)
        {
            ShowConnectionError(targetUrl);
            return;
        }

        // Initialize WebView2
        await EnsureWebViewInitializedAsync();

        if (AppWebView.CoreWebView2 != null)
        {
            AppWebView.CoreWebView2.Navigate(targetUrl);
        }
    }

    private async Task EnsureWebViewInitializedAsync()
    {
        if (_isWebViewInitialized) return;

        try
        {
            string dataDir = AppSettings.GetDataDirectory();
            var environment = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await AppWebView.EnsureCoreWebView2Async(environment);

            _isWebViewInitialized = true;

            // Configure WebView2 settings
            var settings = AppWebView.CoreWebView2.Settings;
            settings.IsScriptEnabled = true;
            settings.AreDefaultContextMenusEnabled = true;
            settings.IsStatusBarEnabled = false;
            settings.AreDevToolsEnabled = true;

            // Append custom User Agent
            string originalUa = settings.UserAgent;
            settings.UserAgent = originalUa + " HyunkNativeWindows/1.0 (WPF+.NET8; x64)";

            // Wire event handlers
            AppWebView.NavigationStarting += AppWebView_NavigationStarting;
            AppWebView.NavigationCompleted += AppWebView_NavigationCompleted;

            // Apply saved zoom
            if (_settings.ZoomFactor > 0.4 && _settings.ZoomFactor < 3.0)
            {
                AppWebView.ZoomFactor = _settings.ZoomFactor;
                ZoomText.Text = $"{(int)(_settings.ZoomFactor * 100)}%";
            }
        }
        catch (Exception ex)
        {
            OverlaySubtitle.Text = $"Gagal inisialisasi WebView2: {ex.Message}";
            ShowConnectionError(_settings.ServerUrl);
        }
    }

    private void AppWebView_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        SetStatus(null, "Memuat halaman...");
    }

    private void AppWebView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            SetStatus(true, "Terhubung");
            OverlayContainer.Visibility = Visibility.Collapsed;
        }
        else
        {
            SetStatus(false, "Gagal memuat");
            OverlaySubtitle.Text = $"Gagal memuat halaman: {e.WebErrorStatus}";
            ShowConnectionError(_settings.ServerUrl);
        }
    }

    private void ShowConnectionError(string url)
    {
        SetStatus(false, "Server Terputus");
        OverlayContainer.Visibility = Visibility.Visible;
        LoadingProgressBar.Visibility = Visibility.Collapsed;
        ErrorActionButtons.Visibility = Visibility.Visible;
        OverlaySubtitle.Text = $"Tidak dapat menyambung ke server pada alamat {url}.\nPastikan server aktif atau ganti alamat server.";
    }

    private void SetStatus(bool? isConnected, string tooltip)
    {
        if (isConnected == true)
        {
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(16, 185, 129)); // Green
            ServerUrlText.Foreground = new SolidColorBrush(Color.FromRgb(226, 232, 240));
        }
        else if (isConnected == false)
        {
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(239, 68, 68)); // Red
            ServerUrlText.Foreground = new SolidColorBrush(Color.FromRgb(248, 113, 113));
        }
        else
        {
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(245, 158, 11)); // Amber
            ServerUrlText.Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36));
        }

        StatusPill.ToolTip = tooltip;
    }

    private async void RetryConnection_Click(object sender, RoutedEventArgs e)
    {
        await InitializeAppAsync();
    }

    private async void StartServerButton_Click(object sender, RoutedEventArgs e)
    {
        StartServerBtn.IsEnabled = false;
        OverlaySubtitle.Text = "Memulai server lokal di background...";
        LoadingProgressBar.Visibility = Visibility.Visible;

        bool started = await _serverManager.StartLocalServerAsync(msg =>
        {
            Dispatcher.Invoke(() => OverlaySubtitle.Text = msg);
        });

        StartServerBtn.IsEnabled = true;

        if (started)
        {
            await InitializeAppAsync();
        }
        else
        {
            ShowConnectionError(_settings.ServerUrl);
        }
    }

    private void StatusPill_Click(object sender, MouseButtonEventArgs e)
    {
        OpenSettings_Click(sender, e);
    }

    private void OpenSettings_Click(object sender, RoutedEventArgs e)
    {
        var settingsWin = new ServerSettingsWindow(_settings, _serverManager)
        {
            Owner = this
        };

        if (settingsWin.ShowDialog() == true && settingsWin.HasChanged)
        {
            ServerUrlText.Text = _settings.ServerUrl;
            OverlayTargetUrl.Text = _settings.ServerUrl;
            _ = InitializeAppAsync();
        }
    }

    private void Reload_Click(object sender, RoutedEventArgs e)
    {
        if (AppWebView.CoreWebView2 != null)
        {
            AppWebView.Reload();
        }
    }

    private void ToggleDevTools_Click(object sender, RoutedEventArgs e)
    {
        if (AppWebView.CoreWebView2 != null)
        {
            AppWebView.CoreWebView2.OpenDevToolsWindow();
        }
    }

    private void ZoomIn_Click(object sender, RoutedEventArgs e)
    {
        if (AppWebView.CoreWebView2 != null && AppWebView.ZoomFactor < 2.5)
        {
            AppWebView.ZoomFactor += 0.1;
            UpdateZoomDisplay();
        }
    }

    private void ZoomOut_Click(object sender, RoutedEventArgs e)
    {
        if (AppWebView.CoreWebView2 != null && AppWebView.ZoomFactor > 0.5)
        {
            AppWebView.ZoomFactor -= 0.1;
            UpdateZoomDisplay();
        }
    }

    private void UpdateZoomDisplay()
    {
        int pct = (int)Math.Round(AppWebView.ZoomFactor * 100);
        ZoomText.Text = $"{pct}%";
        _settings.ZoomFactor = AppWebView.ZoomFactor;
    }

    private void ToggleFullscreen_Click(object sender, RoutedEventArgs e)
    {
        if (!_isFullscreen)
        {
            _previousWindowState = WindowState;
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
            TopNavBorder.Visibility = Visibility.Collapsed;
            _isFullscreen = true;
        }
        else
        {
            WindowStyle = WindowStyle.SingleBorderWindow;
            WindowState = _previousWindowState;
            TopNavBorder.Visibility = Visibility.Visible;
            _isFullscreen = false;
        }
    }

    private void MainWindow_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F5)
        {
            Reload_Click(sender, e);
            e.Handled = true;
        }
        else if (e.Key == Key.F11)
        {
            ToggleFullscreen_Click(sender, e);
            e.Handled = true;
        }
        else if (e.Key == Key.F12)
        {
            ToggleDevTools_Click(sender, e);
            e.Handled = true;
        }
        else if (Keyboard.Modifiers == ModifierKeys.Control && (e.Key == Key.OemPlus || e.Key == Key.Add))
        {
            ZoomIn_Click(sender, e);
            e.Handled = true;
        }
        else if (Keyboard.Modifiers == ModifierKeys.Control && (e.Key == Key.OemMinus || e.Key == Key.Subtract))
        {
            ZoomOut_Click(sender, e);
            e.Handled = true;
        }
        else if (Keyboard.Modifiers == ModifierKeys.Control && (e.Key == Key.D0 || e.Key == Key.NumPad0))
        {
            if (AppWebView.CoreWebView2 != null)
            {
                AppWebView.ZoomFactor = 1.0;
                UpdateZoomDisplay();
            }
            e.Handled = true;
        }
        else if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.S)
        {
            OpenSettings_Click(sender, e);
            e.Handled = true;
        }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        _settings.IsMaximized = WindowState == WindowState.Maximized;
        _settings.Save();

        // Shut down background server if it was launched by this desktop app
        if (_serverManager.IsServerStartedByApp)
        {
            _serverManager.StopServer();
        }
    }
}