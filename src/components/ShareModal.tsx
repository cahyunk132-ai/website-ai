'use client';

import React, { useEffect, useState } from 'react';
import { X, Link2, Copy, Check, Trash2, Loader2, Share2, Globe, Eye, Info } from 'lucide-react';

interface ShareInfo {
  id: string;
  conversationId: string;
  token: string;
  enabled: boolean;
  views: number;
  createdAt: string;
  expiresAt?: string | null;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  title?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  title,
}) => {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = share
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${share.token}`
    : '';

  const loadShare = async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share?conversationId=${encodeURIComponent(conversationId)}`);
      if (res.ok) {
        const data = await res.json();
        setShare(data.share || null);
      }
    } catch {
      setError('Gagal memuat status share.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setError(null);
      loadShare();
    }
  }, [isOpen, conversationId]);

  const handleCreate = async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();
      if (res.ok) {
        setShare(data.share);
      } else {
        setError(data.error || 'Gagal membuat tautan share.');
      }
    } catch {
      setError('Network error saat membuat tautan share.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share?conversationId=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShare(null);
      } else {
        setError('Gagal mencabut tautan share.');
      }
    } catch {
      setError('Network error saat mencabut tautan share.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Browser menolak akses clipboard. Salin manual dari kotak tautan.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 pb-safe"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold">Bagikan percakapan</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {title || 'Buat tautan publik read-only'}
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

        <div className="p-4 sm:p-5 space-y-4">
          {loading && !share ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : share ? (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-200 leading-relaxed">
                  Percakapan ini publik. Siapa pun yang punya tautannya bisa membacanya, tapi tidak
                  bisa mengedit atau melanjutkan.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">Tautan publik</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.target.select()}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 outline-none focus:border-cyan-500/50 font-mono"
                  />
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  {share.views} kali dilihat
                </span>
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Dibuat {new Date(share.createdAt).toLocaleDateString('id-ID')}
                </span>
              </div>

              <button
                onClick={handleRevoke}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10 text-sm font-medium transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Cabut tautan publik
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400 leading-relaxed">
                Buat tautan publik agar percakapan ini bisa dibaca orang lain tanpa perlu login.
                Tautan bisa dicabut kapan saja.
              </p>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                Buat tautan publik
              </button>
            </>
          )}

          {error && (
            <p className="text-[11px] text-red-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
