'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  CornerDownLeft,
  Command,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  BookMarked,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  icon?: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  /** Called when a prompt template is picked. */
  onInsertPrompt: (text: string) => void;
  /** Called when the user saves the current composer content as a template. */
  onSavePrompt?: (title: string, content: string) => Promise<void>;
  /** The current composer text, offered as "save as template". */
  composerText?: string;
}

const BUILTIN_PROMPTS: Array<{ title: string; content: string; category: string }> = [
  {
    title: 'Ringkas & jelas',
    content:
      'Ringkas jawaban berikut dalam 3 poin utama, lalu tuliskan satu langkah praktis berikutnya. Jawaban singkat, tanpa jargon yang tidak perlu.',
    category: 'Menulis',
  },
  {
    title: 'Review kode',
    content:
      'Review kode berikut: bug correctness, celah keamanan, performa, dan keterbacaan. Sertakan temuan per severity dengan file:line dan saran perbaikannya.',
    category: 'Engineering',
  },
  {
    title: 'Audit keamanan',
    content:
      'Lakukan audit keamanan pada target berikut: konfigurasi header, cookie, CORS, paparan file sensitif, TLS, dan kebocoran secret. Laporkan temuan per severity beserta bukti dan rekomendasinya.',
    category: 'Engineering',
  },
  {
    title: 'Jelaskan seperti ke xyz',
    content:
      'Jelaskan topik ini seperti saya orang awam: gunakan analogi sehari-hari, hindari istilah teknis, dan tutup dengan satu contoh praktis.',
    category: 'Belajar',
  },
  {
    title: 'Buat rencana belajar',
    content:
      'Buat rencana belajar bertahap untuk topik ini: target mingguan, sumber yang relevan, latihan praktis, dan cara mengukur kemajuan.',
    category: 'Belajar',
  },
  {
    title: 'Tulis SQL & optimasi',
    content:
      'Tulis query SQL untuk kebutuhan berikut, jelaskan indeks yang disarankan, potensi bottleneck, dan versi yang sudah dioptimasi.',
    category: 'Data',
  },
  {
    title: 'Ide konten',
    content:
      'Buat 10 ide konten beserta hook, judul, dan poin utama untuk audiens yang [, elaborate with the goal, tone, and platform provided].',
    category: 'Konten',
  },
  {
    title: 'Perbandingan opsi',
    content:
      'Bandingkan opsi berikut dalam tabel: biaya, kurva belajar, performa, ekosistem, dan kasus penggunaan terbaik. Berikan rekomendasi beserta alasannya.',
    category: 'Analisis',
  },
];

/**
 * Fuzzy-ish matcher: every token of the query must appear in the haystack.
 */
function matches(query: string, haystack: string): boolean {
  if (!query) return true;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const target = haystack.toLowerCase();
  return tokens.every((token) => target.includes(token));
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  onInsertPrompt,
  onSavePrompt,
  composerText,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<'commands' | 'prompts'>('commands');
  const [userPrompts, setUserPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ title: '', content: '' });
  const [showNew, setShowNew] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const data = await res.json();
        setUserPrompts(data.prompts || []);
      }
    } catch {
      // keep the previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    setTab('commands');
    setShowNew(false);
    setStatusMsg(null);
    loadPrompts();
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands.filter(
      (command) =>
        matches(q, command.label) ||
        matches(q, command.group) ||
        matches(q, command.keywords || '') ||
        matches(q, command.hint || '')
    );
  }, [commands, query]);

  const filteredPrompts = useMemo(() => {
    const q = query.trim();
    const all = [
      ...BUILTIN_PROMPTS.map((prompt) => ({
        id: `builtin:${prompt.title}`,
        title: prompt.title,
        content: prompt.content,
        category: prompt.category,
        builtin: true,
      })),
      ...userPrompts.map((prompt) => ({ ...prompt, builtin: false })),
    ];
    if (!q) return all;
    return all.filter(
      (prompt) => matches(q, prompt.title) || matches(q, prompt.content) || matches(q, prompt.category || '')
    );
  }, [userPrompts, query]);

  const totalItems = tab === 'commands' ? filteredCommands.length : filteredPrompts.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, tab]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (totalItems ? (index + 1) % totalItems : 0));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (totalItems ? (index - 1 + totalItems) % totalItems : 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (tab === 'commands') {
          const command = filteredCommands[activeIndex];
          if (command) {
            command.run();
            onClose();
          }
        } else {
          const prompt = filteredPrompts[activeIndex];
          if (prompt) {
            onInsertPrompt(prompt.content);
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, tab, activeIndex, filteredCommands, filteredPrompts, totalItems, onClose, onInsertPrompt]);

  const handleSave = async () => {
    if (!newPrompt.title.trim() || !newPrompt.content.trim()) {
      setStatusMsg('Judul dan isi template wajib diisi.');
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrompt),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg('Template disimpan.');
        setNewPrompt({ title: '', content: '' });
        setShowNew(false);
        await loadPrompts();
      } else {
        setStatusMsg(data.error || 'Gagal menyimpan template.');
      }
    } catch {
      setStatusMsg('Network error saat menyimpan template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id.startsWith('builtin:')) {
      try {
        await fetch(`/api/prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadPrompts();
      } catch {
        setStatusMsg('Gagal menghapus template.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12dvh] p-3 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[70dvh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Search */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari perintah atau template prompt..."
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800/80 bg-slate-950/40">
          {(
            [
              { id: 'commands', label: 'Perintah', icon: Command },
              { id: 'prompts', label: 'Template Prompt', icon: BookMarked },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] text-slate-500 hidden sm:inline">
            ↑↓ untuk memilih · Enter untuk membuka · Esc untuk menutup
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[120px]">
          {tab === 'commands' ? (
            filteredCommands.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Tidak ada perintah yang cocok.
              </div>
            ) : (
              filteredCommands.map((command, index) => {
                const Icon = command.icon;
                const active = index === activeIndex;
                return (
                  <button
                    key={command.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      command.run();
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                      active ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {Icon ? <Icon className="w-4 h-4" /> : <Command className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-100 truncate">{command.label}</div>
                      {command.hint && (
                        <div className="text-[11px] text-slate-500 truncate">{command.hint}</div>
                      )}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 shrink-0">
                      {command.group}
                    </span>
                  </button>
                );
              })
            )
          ) : filteredPrompts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Tidak ada template yang cocok.
            </div>
          ) : (
            filteredPrompts.map((prompt, index) => {
              const active = index === activeIndex;
              return (
                <div
                  key={prompt.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onInsertPrompt(prompt.content);
                    onClose();
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                    active ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100 truncate">{prompt.title}</span>
                      {prompt.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                          {prompt.category}
                        </span>
                      )}
                      {'builtin' in prompt && prompt.builtin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 shrink-0">
                          bawaan
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-2">{prompt.content}</div>
                  </div>
                  {!('builtin' in prompt && prompt.builtin) && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(prompt.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                      aria-label="Hapus template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Save the composer as a template */}
        {tab === 'prompts' && (
          <div className="border-t border-slate-800 p-3 bg-slate-950/50">
            {showNew ? (
              <div className="space-y-2">
                <input
                  value={newPrompt.title}
                  onChange={(event) => setNewPrompt({ ...newPrompt, title: event.target.value })}
                  placeholder="Judul template"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                />
                <textarea
                  value={newPrompt.content}
                  onChange={(event) => setNewPrompt({ ...newPrompt, content: event.target.value })}
                  placeholder="Isi prompt..."
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50 resize-y"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Simpan
                  </button>
                  <button
                    onClick={() => {
                      setShowNew(false);
                      setNewPrompt({ title: '', content: '' });
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                  >
                    Batal
                  </button>
                  {statusMsg && <span className="text-[11px] text-slate-400 truncate">{statusMsg}</span>}
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNewPrompt({
                    title: '',
                    content: composerText || '',
                  });
                  setShowNew(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Simpan input saat ini sebagai template
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="absolute top-14 right-4 text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};
