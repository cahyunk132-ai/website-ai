'use client';

import React, { useEffect, useState } from 'react';
import { X, Trash2, RotateCcw, Loader2, AlertTriangle, MessageSquare } from 'lucide-react';

interface TrashedConversation {
  id: string;
  title: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ isOpen, onClose, onChanged }) => {
  const [conversations, setConversations] = useState<TrashedConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/conversations/trash');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      setError('Gagal memuat sampah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadTrash();
  }, [isOpen]);

  const handleRestore = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/conversations/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setConversations((items) => items.filter((item) => item.id !== id));
        onChanged?.();
      }
    } catch {
      setError('Gagal memulihkan percakapan.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/conversations/${id}?permanent=true`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((items) => items.filter((item) => item.id !== id));
        onChanged?.();
      }
    } catch {
      setError('Gagal menghapus permanen.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[86dvh] flex flex-col pb-safe"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold">Sampah</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Percakapan yang dihapus masih bisa dipulihkan.
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

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Trash2 className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-sm text-slate-400">Sampah kosong.</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Percakapan yang Anda hapus akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60"
                >
                  <MessageSquare className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{conversation.title}</p>
                    <p className="text-[10px] text-slate-500">
                      Dihapus {new Date(conversation.deletedAt || conversation.updatedAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(conversation.id)}
                    disabled={busyId === conversation.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/20 text-xs font-medium transition disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Pulihkan
                  </button>
                  <button
                    onClick={() => handlePurge(conversation.id)}
                    disabled={busyId === conversation.id}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50 shrink-0"
                    aria-label="Hapus permanen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-400">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
