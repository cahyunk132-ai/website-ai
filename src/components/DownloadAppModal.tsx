'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Download,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Globe,
  Share2,
  Info,
  Layers,
  FileArchive,
  Cpu,
} from 'lucide-react';

interface DownloadAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadAppModal: React.FC<DownloadAppModalProps> = ({ isOpen, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<'windows' | 'apk' | 'pwa'>('windows');

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsPwaInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert('Untuk memasang PWA, buka website ini di Chrome atau Edge lalu klik ikon "Install" di address bar.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[92dvh] flex flex-col pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5 sm:gap-2">
                <span>Download Hyunk AI Hub</span>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 font-normal">
                  Windows & Android
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Aplikasi Desktop Windows (.exe) dan Android Native (.apk)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Option Tabs */}
        <div className="flex border-b border-slate-800 px-4 sm:px-6 pt-2 gap-2 text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('windows')}
            className={`pb-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'windows'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Windows App (.exe)</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`pb-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'apk'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android APK (.apk)</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`pb-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'pwa'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web App (PWA)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {activeTab === 'windows' && (
            <div className="space-y-4">
              {/* Windows App Card Preview */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/icon-192.png"
                    alt="Hyunk AI Hub"
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-xl shadow-md shrink-0"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">Hyunk AI Hub for Windows</h3>
                    <p className="text-[11px] text-slate-400">Native .NET 8 + WebView2 • Standalone Single-File</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                        Windows 10 / 11 (64-bit)
                      </span>
                      <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" />
                        Self-Contained .EXE
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href="/downloads/HyunkAIHub.exe"
                  download="HyunkAIHub.exe"
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .EXE (Direct)</span>
                </a>
                <a
                  href="/downloads/HyunkAIHub-Windows-v1.0.0.zip"
                  download="HyunkAIHub-Windows-v1.0.0.zip"
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <FileArchive className="w-4 h-4 text-cyan-400" />
                  <span>Download .ZIP Portable</span>
                </a>
              </div>

              {/* Windows Features Highlight */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-slate-300">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Keunggulan Aplikasi Windows:</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pl-1 leading-relaxed">
                  <li><strong>Standalone &amp; Ringan</strong>: Tidak perlu install runtime .NET tambahan, langsung klik jalan.</li>
                  <li><strong>Auto-Server Launcher</strong>: Otomatis mendeteksi dan dapat menjalankan server Next.js lokal di background.</li>
                  <li><strong>Immersive Dark Titlebar</strong>: Tampilan serasi dengan Windows 10 &amp; 11 Dark Mode.</li>
                  <li><strong>Pengaturan Server Fleksibel</strong>: Mudah beralih antara Localhost (3000), Wi-Fi LAN (172.17.35.34), atau Cloud Vercel via shortcut <code>Ctrl+Shift+S</code>.</li>
                  <li><strong>Shortcut Desktop</strong>: Mendukung <code>F5</code> (Reload), <code>F11</code> (Fullscreen), <code>F12</code> (DevTools), dan <code>Ctrl + +/-</code> (Zoom).</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'apk' && (
            <div className="space-y-4">
              {/* APK Card Preview */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0">
                    H
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">Hyunk AI Hub for Android</h3>
                    <p className="text-[11px] text-slate-400">Package: com.hyunk.aihub • Native Kotlin + Java</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                        Android 7.0+ (API 24+)
                      </span>
                      <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" />
                        Signed v1+v2+v3
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Direct APK Download Button */}
              <a
                href="/downloads/hyunk-ai-hub.apk"
                download="hyunk-ai-hub.apk"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-600/20 transition flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Download className="w-4 h-4" />
                <span>Download .APK File (Direct)</span>
              </a>

              {/* How to Install Guide */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-slate-300">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cara Install di HP Android:</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400 pl-1 leading-relaxed">
                  <li>Klik tombol <strong>Download .APK File</strong> di atas.</li>
                  <li>Setelah selesai mengunduh, buka file <strong>hyunk-ai-hub.apk</strong>.</li>
                  <li>Jika muncul peringatan keamanan Android, pilih <strong>Pengaturan (Settings)</strong> ➜ aktifkan <strong>Izinkan dari sumber ini (Allow from this source)</strong>.</li>
                  <li>Tekan <strong>Install</strong>. Aplikasi akan langsung muncul di menu utama HP Anda.</li>
                </ol>
                <div className="pt-1 text-[10px] text-slate-500">
                  💡 Tip: Jika ingin mengganti alamat server di APK, tekan dan tahan layar (*long-press*) kapan saja untuk memasukkan URL lokal atau Vercel Anda.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-4">
              {/* PWA Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-200">Instalasi Instan Tanpa Unduh File</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Pasang langsung dari browser ke layar beranda HP atau desktop Anda (Chrome, Samsung Internet, Edge, atau Safari di iPhone). Aplikasi berjalan dalam layar penuh (fullscreen) tanpa bilah URL browser.
                </p>
                {isPwaInstalled ? (
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Aplikasi sudah terpasang di perangkat ini!</span>
                  </div>
                ) : (
                  <button
                    onClick={handleInstallPwa}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Pasang Aplikasi Sekarang (1-Klik)</span>
                  </button>
                )}
              </div>

              {/* iOS Safari Guide */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-slate-300">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Untuk Pengguna iPhone (iOS Safari):</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400 pl-1 leading-relaxed">
                  <li>Buka website ini di <strong>Safari</strong>.</li>
                  <li>Tekan ikon <strong>Share</strong> (kotak panah ke atas di bawah).</li>
                  <li>Scroll ke bawah lalu pilih <strong>Add to Home Screen (Tambah ke Layar Utama)</strong>.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
