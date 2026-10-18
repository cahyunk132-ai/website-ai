using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace HyunkAIHub;

public partial class ServerSettingsWindow : Window
{
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    private readonly AppSettings _settings;
    private readonly ServerManager _serverManager;

    public bool HasChanged { get; private set; }

    public ServerSettingsWindow(AppSettings settings, ServerManager serverManager)
    {
        InitializeComponent();
        _settings = settings;
        _serverManager = serverManager;

        UrlTextBox.Text = _settings.ServerUrl;
        AutoStartCheckBox.IsChecked = _settings.AutoStartLocalServer;

        Loaded += (s, e) =>
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            int trueVal = 1;
            DwmSetWindowAttribute(hwnd, 20, ref trueVal, sizeof(int));
        };
    }

    private void PresetLocalhost_Click(object sender, RoutedEventArgs e)
    {
        UrlTextBox.Text = "http://localhost:3000";
        StatusLabel.Text = "";
    }

    private void PresetLan_Click(object sender, RoutedEventArgs e)
    {
        UrlTextBox.Text = "http://172.17.35.34:3000";
        StatusLabel.Text = "";
    }

    private async void TestButton_Click(object sender, RoutedEventArgs e)
    {
        string url = UrlTextBox.Text.Trim();
        if (string.IsNullOrEmpty(url))
        {
            StatusLabel.Text = "Mohon masukkan URL.";
            StatusLabel.Foreground = Brushes.Tomato;
            return;
        }

        StatusLabel.Text = "Menguji koneksi...";
        StatusLabel.Foreground = Brushes.DeepSkyBlue;
        TestButton.IsEnabled = false;

        bool reachable = await _serverManager.IsServerReachableAsync(url);
        TestButton.IsEnabled = true;

        if (reachable)
        {
            StatusLabel.Text = "✓ Koneksi berhasil! Server aktif.";
            StatusLabel.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
        }
        else
        {
            StatusLabel.Text = "✗ Gagal menghubungi server pada alamat tersebut.";
            StatusLabel.Foreground = Brushes.Tomato;
        }
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        string raw = UrlTextBox.Text.Trim();
        if (string.IsNullOrEmpty(raw))
        {
            raw = "http://localhost:3000";
        }

        if (!raw.StartsWith("http://") && !raw.StartsWith("https://"))
        {
            raw = "http://" + raw;
        }

        _settings.ServerUrl = raw;
        _settings.AutoStartLocalServer = AutoStartCheckBox.IsChecked == true;
        _settings.Save();

        HasChanged = true;
        DialogResult = true;
        Close();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
