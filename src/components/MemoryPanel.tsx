'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Brain,
  Plus,
  Trash2,
  Loader2,
  Check,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';

interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  source: 'manual' | 'auto' | 'command';
  enabled: boolean;
  createdAt: string;
}

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when the memory list changed so the chat can refresh the prompt. */
  onChanged?: () => void;
}

const CATEGORIES = [
  { id: 'general', label: 'Umum' },
  { id: 'identity', label: 'Identitas' },
  { id: 'preference', label: 'Preferensi' },
  { id: 'project', label: 'Proyek' },
  { id: 'style', label: 'Gaya bahasa' },
];

const CATEGORY_STYLES: Record<string, string> = {
  general: 'bg-slate-800 text-slate-300 border-slate-700',
  identity: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  preference: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  project: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  style: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose, onChanged }) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      // keep the previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMemories();
      setStatusMsg(null);
    }
  }, [isOpen]);

  const handleAdd = async () => {
    if (!content.trim()) {
      setStatusMsg({ type: 'error', text: 'Isi memori tidak boleh kosong.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category, source: 'manual' }),
      });
      const data = await res.json();
      if (res.ok) {
        setContent('');
        setStatusMsg({ type: 'success', text: 'Memori ditambahkan.' });
        await loadMemories();
        onChanged?.();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Gagal menyimpan memori.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network error saat menyimpan memori.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (memory: MemoryEntry) => {
    try {
      const res = await fetch('/api/memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memory.id, enabled: !memory.enabled }),
      });
      if (res.ok) {
        setMemories((items) =>
          items.map((item) => (item.id === memory.id ? { ...item, enabled: !item.enabled } : item))
        );
        onChanged?.();
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Gagal mengubah status memori.' });
    }
  };

  const handleDelete = async (memory: MemoryEntry) => {
    try {
      const res = await fetch(`/api/memories?id=${encodeURIComponent(memory.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMemories((items) => items.filter((item) => item.id !== memory.id));
        setStatusMsg({ type: 'success', text: 'Memori dihapus.' });
        onChanged?.();
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Gagal menghapus memori.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[92dvh] flex flex-col pb-safe"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
              <Brain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2 flex-wrap">
                <span>AI Memory</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-800/50 font-normal">
                  {memories.filter((m) => m.enabled).length} aktif
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                AI mengingat fakta ini di percakapan berikutnya.
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

        {/* Add */}
        <div className="p-4 border-b border-slate-800 space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Contoh: Nama saya Cahyunk, saya biasa pakai TypeScript"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-500/50 placeholder:text-slate-600"
            />
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Simpan
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                  category === item.id
                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Brain className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-sm text-slate-400">Belum ada memori.</p>
              <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                Simpan preferensi Anda agar AI tidak perlu ditanya ulang. Bisa juga lewat perintah
                <span className="text-slate-400"> /remember nama saya ...</span> di chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                    memory.enabled
                      ? 'bg-slate-800/40 border-slate-700/60'
                      : 'bg-slate-900/40 border-slate-800/40 opacity-60'
                  }`}
                >
                  <button
                    onClick={() => handleToggle(memory)}
                    className="shrink-0 mt-0.5 text-slate-400 hover:text-violet-300 transition"
                    aria-label={memory.enabled ? 'Nonaktifkan memori' : 'Aktifkan memori'}
                  >
                    {memory.enabled ? (
                      <ToggleRight className="w-5 h-5 text-violet-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 break-words">{memory.content}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          CATEGORY_STYLES[memory.category] || CATEGORY_STYLES.general
                        }`}
                      >
                        {memory.category}
                      </span>
                      {memory.source === 'auto' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          otomatis
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(memory)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                    aria-label="Hapus memori"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2 shrink-0">
          <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <p className="text-[11px] text-slate-500 flex-1 min-w-0">
            Memori hanya tersimpan di akun Anda dan disisipkan ke system prompt.
          </p>
          {statusMsg && (
            <span
              className={`text-[11px] shrink-0 flex items-center gap-1 ${
                statusMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {statusMsg.type === 'success' && <Check className="w-3 h-3" />}
              {statusMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
