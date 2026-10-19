'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Copy,
  CopyCheck,
  RefreshCw,
  Loader2,
  Lock,
  AlertTriangle,
  Info,
  Play,
} from 'lucide-react';
import {
  SIX_HATS,
  SIX_HATS_MIN_TIER,
  SIX_HATS_REQUIRED_LABEL,
  SixHatId,
  SixHatResults,
  buildSixHatsMarkdown,
  canUseSixHats,
} from '@/lib/ai/sixHats';
import type { Tier, UserRole } from '@/lib/ai/tiers';

interface SixHatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The model that generates the six perspectives. */
  model: string;
  provider?: 'auto' | 'radox' | 'inkstone';
  /** The tier of the account, the feature needs Premium 3. */
  tier: Tier;
  role: UserRole;
  /** The conversation the analysis is stored in. */
  conversationId?: string | null;
  /** Called when the analysis was stored in the history. */
  onSaved?: (conversationId: string | null) => void;
  /** Opens the premium panel so the user can upgrade. */
  onUpgrade?: () => void;
}

type HatErrors = Partial<Record<SixHatId, string>>;

/**
 * The colour of a hat as it is used on a dark background: the black hat is
 * almost invisible, a very dark colour becomes a light slate.
 */
export const readableHatColor = (hex: string): string => {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance < 0.45 ? '#94a3b8' : hex;
};

export const SixHatsPanel: React.FC<SixHatsPanelProps> = ({
  isOpen,
  onClose,
  model,
  provider = 'auto',
  tier,
  role,
  conversationId,
  onSaved,
  onUpgrade,
}) => {
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState<SixHatResults>({});
  const [errors, setErrors] = useState<HatErrors>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const allowed = canUseSixHats(role, tier);
  const blueHat = SIX_HATS.find((hat) => hat.id === 'blue')!;

  // A new panel always starts empty.
  useEffect(() => {
    if (isOpen) {
      setResults({});
      setErrors({});
      setGlobalError(null);
      setFinished(false);
      setCopied(false);
    }
  }, [isOpen]);

  // The request is stopped when the panel is closed.
  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setRunning(false);
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  /** Runs the analysis and consumes the stream of the endpoint. */
  const runAnalysis = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setGlobalError('Tuliskan topik yang ingin dianalisis.');
      return;
    }

    setResults({});
    setErrors({});
    setGlobalError(null);
    setFinished(false);
    setCopied(false);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/six-hats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: trimmed,
          model,
          provider: provider === 'auto' ? undefined : provider,
          conversationId: conversationId || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        setGlobalError(errorJson.error || `HTTP ${response.status}`);
        setRunning(false);
        return;
      }

      if (!response.body) {
        setGlobalError('Server tidak mengirim stream.');
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data: ')) continue;

          let payload: any;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (payload.hatId && typeof payload.chunk === 'string') {
            const hatId = payload.hatId as SixHatId;
            setResults((prev) => ({ ...prev, [hatId]: (prev[hatId] || '') + payload.chunk }));
            scrollToBottom();
            continue;
          }

          if (payload.hatId && payload.error) {
            setErrors((prev) => ({ ...prev, [payload.hatId as SixHatId]: payload.error }));
            continue;
          }

          if (payload.error) {
            setGlobalError(payload.error);
            continue;
          }

          if (payload.done) {
            setFinished(true);
            if (payload.conversationId) onSaved?.(payload.conversationId);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setGlobalError(err instanceof Error ? err.message : 'Gagal menjalankan analisis.');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleAnalyze = () => runAnalysis(topic);

  const handleRegenerate = () => runAnalysis(topic);

  const handleCopy = async () => {
    const markdown = buildSixHatsMarkdown(topic, results);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setGlobalError('Clipboard tidak tersedia di browser ini.');
    }
  };

  if (!isOpen) return null;

  const hasContent = Object.values(results).some((value) => (value || '').trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[94dvh] flex flex-col pb-safe"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <span className="text-lg leading-none" aria-hidden>
                🎩
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2 flex-wrap">
                <span>Six Thinking Hats</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/50 font-normal">
                  6 request
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Enam sudut pandang untuk satu topik, lalu satu kesimpulan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-2"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!allowed ? (
          /* Locked state: the feature belongs to Premium 3 and above. */
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Lock className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-100">
              Six Thinking Hats adalah fitur {SIX_HATS_REQUIRED_LABEL}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Fitur ini menjalankan enam permintaan AI sekaligus (enam topi) lalu merangkum
              semuanya. Butuh tier {SIX_HATS_MIN_TIER} atau lebih tinggi.
            </p>
            <button
              onClick={onUpgrade}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition"
            >
              Lihat paket upgrade
            </button>
          </div>
        ) : (
          <>
            {/* Topic */}
            <div className="p-4 border-b border-slate-800 space-y-2.5 shrink-0">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !running) {
                      event.preventDefault();
                      handleAnalyze();
                    }
                  }}
                  placeholder="Contoh: Haruskah kami meluncurkan aplikasi baru di pasar Asia?"
                  disabled={running}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500/50 placeholder:text-slate-600 disabled:opacity-60"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={running || !topic.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Analisis
                </button>
              </div>
              {globalError && (
                <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-2.5 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{globalError}</span>
                </div>
              )}
            </div>

            {/* Grid of the six cards */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[120px]">
              {!hasContent && !running ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-3xl mb-2" aria-hidden>
                    🎩
                  </span>
                  <p className="text-sm text-slate-400">Belum ada analisis.</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-sm">
                    Tulis satu topik, lalu keenam topi akan menjawab dengan sudut pandang masing-masing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {SIX_HATS.map((hat) => {
                    const text = (results[hat.id] || '').trim();
                    const error = errors[hat.id];
                    const isStreaming = running && !!text;

                    return (
                      <div
                        key={hat.id}
                        className="rounded-xl border bg-slate-950/80 p-3 flex flex-col gap-2 min-h-[150px]"
                        style={{ borderColor: `${readableHatColor(hat.color)}33` }}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base leading-none mt-0.5" aria-hidden>
                            {hat.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-100 leading-tight">
                              {hat.name}
                            </p>
                            <p
                              className="text-[10px] leading-tight mt-0.5"
                              style={{ color: readableHatColor(hat.color) }}
                            >
                              {hat.focus}
                            </p>
                          </div>
                          {isStreaming && (
                            <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin shrink-0" />
                          )}
                        </div>

                        {error ? (
                          <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
                        ) : text ? (
                          <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                            {text}
                          </p>
                        ) : running ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="h-2.5 w-full rounded bg-slate-800/70 animate-pulse" />
                            <div className="h-2.5 w-11/12 rounded bg-slate-800/70 animate-pulse" />
                            <div className="h-2.5 w-9/12 rounded bg-slate-800/70 animate-pulse" />
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600">Menunggu analisis.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Blue Hat summary */}
              {((results.blue || '').trim() || errors.blue) && (
                <div className="mt-3 rounded-xl border-2 border-blue-500/50 bg-blue-950/20 p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base leading-none" aria-hidden>
                      {blueHat.emoji}
                    </span>
                    <p className="text-xs font-bold text-blue-200">
                      {blueHat.name} — {blueHat.focus}
                    </p>
                    {running && (
                      <Loader2 className="w-3.5 h-3.5 text-blue-300 animate-spin ml-auto" />
                    )}
                  </div>
                  {errors.blue ? (
                    <p className="text-[11px] text-red-400">{errors.blue}</p>
                  ) : (
                    <p className="text-[11px] sm:text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                      {results.blue}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={handleCopy}
                disabled={!hasContent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition disabled:opacity-40"
              >
                {copied ? (
                  <CopyCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Tersalin' : 'Copy Semua'}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={running || !topic.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition disabled:opacity-40"
              >
                {running ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate
              </button>

              <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <p className="text-[11px] text-slate-500">
                  {finished
                    ? 'Analisis tersimpan di riwayat percakapan.'
                    : `Model ${model} · 1 analisis = 6 request kuota.`}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
