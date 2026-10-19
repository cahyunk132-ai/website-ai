'use client';

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Globe,
  Server,
  Hash,
  Braces,
  Regex,
  Ruler,
  KeyRound,
  CalendarClock,
  GitCompare,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Play,
  Info,
  Copy,
  Check,
  Terminal,
  Search,
} from 'lucide-react';

export interface ManualTool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: Array<{
    name: string;
    label: string;
    placeholder?: string;
    type?: 'text' | 'textarea';
    required?: boolean;
  }>;
  buildArgs: (values: Record<string, string>) => Record<string, unknown>;
}

const TOOLS: ManualTool[] = [
  {
    id: 'website_security_scan',
    label: 'Security Scan',
    description:
      'Audit keamanan website: TLS, header, cookie, CORS, mixed content, dan file sensitif yang tereksposur.',
    icon: ShieldCheck,
    fields: [
      { name: 'url', label: 'URL target', placeholder: 'https://contoh.com', required: true },
    ],
    buildArgs: (values) => ({ url: values.url, deep: true }),
  },
  {
    id: 'page_inspector',
    label: 'Page Inspector',
    description: 'Meta tag, Open Graph, struktur heading, gambar tanpa alt, link, dan isu SEO/a11y.',
    icon: Globe,
    fields: [{ name: 'url', label: 'URL target', placeholder: 'https://contoh.com', required: true }],
    buildArgs: (values) => ({ url: values.url }),
  },
  {
    id: 'dns_lookup',
    label: 'DNS Lookup',
    description: 'Record A, AAAA, MX, TXT, NS, CNAME plus deteksi SPF dan DMARC.',
    icon: Server,
    fields: [{ name: 'host', label: 'Hostname', placeholder: 'contoh.com', required: true }],
    buildArgs: (values) => ({ host: values.host }),
  },
  {
    id: 'hash_calculate',
    label: 'Hash',
    description: 'Digest SHA-256, SHA-1, SHA-512 atau MD5, opsional HMAC.',
    icon: Hash,
    fields: [
      { name: 'text', label: 'Teks / payload', type: 'textarea', placeholder: 'data yang di-hash' },
      { name: 'algorithm', label: 'Algoritma', placeholder: 'sha256' },
      { name: 'key', label: 'HMAC key (opsional)', placeholder: 'rahasia' },
    ],
    buildArgs: (values) => ({
      text: values.text,
      algorithm: values.algorithm || 'sha256',
      key: values.key || undefined,
    }),
  },
  {
    id: 'base64_codec',
    label: 'Base64',
    description: 'Encode atau decode string base64.',
    icon: Braces,
    fields: [
      { name: 'text', label: 'Teks', type: 'textarea', placeholder: 'data' },
      { name: 'mode', label: 'Mode', placeholder: 'encode atau decode' },
    ],
    buildArgs: (values) => ({ text: values.text, mode: values.mode || 'encode' }),
  },
  {
    id: 'json_select',
    label: 'JSON Select',
    description: 'Ambil field tertentu dari dokumen JSON dengan path.',
    icon: Search,
    fields: [
      { name: 'json', label: 'JSON', type: 'textarea', placeholder: '{ "data": { "items": [] } }' },
      { name: 'path', label: 'Path', placeholder: 'data.items[*].id' },
    ],
    buildArgs: (values) => ({ json: values.json, path: values.path }),
  },
  {
    id: 'regex_extract',
    label: 'Regex Extract',
    description: 'Ekstrak semua kecocokan sebuah regular expression beserta grupnya.',
    icon: Regex,
    fields: [
      { name: 'text', label: 'Teks', type: 'textarea', placeholder: 'data yang dipindai' },
      { name: 'pattern', label: 'Pattern', placeholder: '[a-z]+@[a-z]+\\.[a-z]+' },
      { name: 'flags', label: 'Flags', placeholder: 'g' },
    ],
    buildArgs: (values) => ({
      text: values.text,
      pattern: values.pattern,
      flags: values.flags || 'g',
    }),
  },
  {
    id: 'unit_convert',
    label: 'Unit Convert',
    description: 'Konversi panjang, massa, data, atau waktu.',
    icon: Ruler,
    fields: [
      { name: 'value', label: 'Nilai', placeholder: '10' },
      { name: 'from', label: 'Dari', placeholder: 'km' },
      { name: 'to', label: 'Ke', placeholder: 'mi' },
    ],
    buildArgs: (values) => ({
      value: Number(values.value),
      from: values.from,
      to: values.to,
    }),
  },
  {
    id: 'password_entropy',
    label: 'Password Strength',
    description: 'Entropi, kekuatan, dan estimasi waktu crack kata sandi (dihitung di server).',
    icon: KeyRound,
    fields: [{ name: 'password', label: 'Kata sandi', type: 'textarea', placeholder: '••••••' }],
    buildArgs: (values) => ({ password: values.password }),
  },
  {
    id: 'cron_next',
    label: 'Cron Next',
    description: 'Hitung waktu eksekusi berikutnya dari ekspresi cron 5 kolom.',
    icon: CalendarClock,
    fields: [
      { name: 'expression', label: 'Ekspresi cron', placeholder: '0 9 * * 1-5', required: true },
      { name: 'count', label: 'Jumlah', placeholder: '5' },
    ],
    buildArgs: (values) => ({
      expression: values.expression,
      count: Number(values.count) || 5,
    }),
  },
  {
    id: 'text_diff',
    label: 'Text Diff',
    description: 'Bandingkan dua teks dan lihat baris yang ditambahkan atau dihapus.',
    icon: GitCompare,
    fields: [
      { name: 'original', label: 'Versi awal', type: 'textarea', placeholder: 'sebelum' },
      { name: 'updated', label: 'Versi baru', type: 'textarea', placeholder: 'sesudah' },
    ],
    buildArgs: (values) => ({ original: values.original, updated: values.updated }),
  },
];

interface ToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-rose-950 text-rose-300 border-rose-800/60',
  HIGH: 'bg-orange-950 text-orange-300 border-orange-800/60',
  MEDIUM: 'bg-amber-950 text-amber-300 border-amber-800/60',
  LOW: 'bg-sky-950 text-sky-300 border-sky-800/60',
  INFO: 'bg-slate-900 text-slate-400 border-slate-700/60',
};

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ isOpen, onClose }) => {
  const [activeId, setActiveId] = useState(TOOLS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    output: string;
    data: any;
    durationMs: number;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const active = TOOLS.find((tool) => tool.id === activeId) || TOOLS[0];

  const run = async () => {
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch('/api/tools/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: active.id, args: active.buildArgs(values) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          success: false,
          output: '',
          data: null,
          durationMs: 0,
          error: data.error || `HTTP ${res.status}`,
        });
        return;
      }

      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        output: '',
        data: null,
        durationMs: 0,
        error: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.output) return;
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isOpen) return null;

  const findings = result?.data?.findings;
  const score = result?.data?.score;
  const grade = result?.data?.grade;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92dvh] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 flex flex-col pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold">Tool Runner</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Jalankan tool langsung — hasil identik dengan yang dipakai AI.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          {/* Tool list */}
          <div className="space-y-1.5 lg:sticky lg:top-0 lg:self-start">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = tool.id === activeId;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setActiveId(tool.id);
                    setValues({});
                    setResult(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-medium truncate">{tool.label}</span>
                </button>
              );
            })}
          </div>

          {/* Runner */}
          <div className="space-y-4 min-w-0">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <div className="flex items-start gap-2.5 mb-3">
                <active.icon className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-100">{active.label}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    {active.description}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {active.fields.map((field) => (
                  <div key={field.name}>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      {field.label}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={values[field.name] || ''}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono resize-y leading-relaxed"
                      />
                    ) : (
                      <input
                        value={values[field.name] || ''}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={run}
                disabled={running}
                className="mt-3 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {running ? 'Menjalankan...' : 'Jalankan Tool'}
              </button>
            </div>

            {/* Result */}
            {result && (
              <div className="space-y-3 animate-fadeIn">
                {result.error ? (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{result.error}</span>
                  </div>
                ) : (
                  <>
                    {score !== undefined && (
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-4">
                        <div className="text-center shrink-0">
                          <div
                            className={`text-2xl font-black ${
                              score >= 90
                                ? 'text-emerald-400'
                                : score >= 60
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {score}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500">SKOR</div>
                        </div>
                        <div className="shrink-0">
                          <div className="text-lg font-bold text-slate-100">Grade {grade}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {result.durationMs}ms
                          </div>
                        </div>
                      </div>
                    )}

                    {Array.isArray(findings) && findings.length > 0 && (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                        {findings.map((finding: any, index: number) => (
                          <div
                            key={index}
                            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-1"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                                  SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.INFO
                                }`}
                              >
                                {finding.severity}
                              </span>
                              <span className="font-semibold text-slate-200">{finding.title}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">{finding.detail}</p>
                            {finding.recommendation && (
                              <p className="text-[11px] text-cyan-300/90 leading-relaxed">
                                → {finding.recommendation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                          Raw output
                        </span>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="p-1.5 rounded text-slate-500 hover:text-cyan-400 hover:bg-slate-900 transition"
                          title="Copy output"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <pre className="p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72 whitespace-pre-wrap break-words">
                        {result.output}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            )}

            {!result && (
              <div className="p-4 rounded-xl border border-dashed border-slate-800 text-[11px] text-slate-500 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Tool yang sama bisa dipanggil AI secara otomatis lewat Agent Mode. Jalankan
                  di sini bila ingin melihat hasil mentahnya tanpa lewat percakapan.
                </span>
              </div>
            )}

            {result?.success && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selesai dalam {result.durationMs}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Target privat & loopback diblokir (SSRF guard)</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
