'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Crown,
  Check,
  Sparkles,
  Zap,
  ShieldCheck,
  Users,
  Loader2,
  ArrowRight,
} from 'lucide-react';

export type PlanId = 'free' | 'premium';

export interface PlanInfo {
  id: PlanId;
  label: string;
  tagline: string;
  dailyPromptLimit: number;
  priceLabel: string;
  features: string[];
}

interface PremiumPanelProps {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanId;
  used: number;
  limit: number;
  remaining: number;
  resetsAt?: string;
  isAdmin: boolean;
  onPlanChanged: (plan: PlanId) => void;
}

/**
 * Premium panel: shows the quota of the current plan, compares Free and
 * Premium and lets the user activate the premium plan. An administrator can
 * additionally change the plan of any account.
 */
export const PremiumPanel: React.FC<PremiumPanelProps> = ({
  isOpen,
  onClose,
  plan,
  used,
  limit,
  remaining,
  resetsAt,
  isAdmin,
  onPlanChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPlan, setAdminPlan] = useState<PlanId>('premium');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(null);
      setAdminMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isPremium = plan === 'premium';
  const exhausted = remaining <= 0;

  const activate = async (action: 'upgrade' | 'downgrade') => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengubah plan.');
        return;
      }
      setSuccess(
        action === 'upgrade'
          ? 'Premium aktif! Kuota kamu kini 10x lebih besar.'
          : 'Paket dikembalikan ke mode gratis.'
      );
      onPlanChanged(data.plan as PlanId);
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusy(false);
    }
  };

  const saveAdminPlan = async () => {
    if (!adminEmail.trim()) {
      setAdminMessage('Email pengguna wajib diisi.');
      return;
    }
    setAdminBusy(true);
    setAdminMessage(null);
    try {
      const res = await fetch('/api/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', email: adminEmail.trim(), plan: adminPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminMessage(data.error || 'Gagal menyimpan plan.');
        return;
      }
      setAdminMessage(`Plan ${data.planLabel} berhasil diberikan ke ${data.email}.`);
      setAdminEmail('');
    } catch {
      setAdminMessage('Gagal menghubungi server.');
    } finally {
      setAdminBusy(false);
    }
  };

  const plans: PlanInfo[] = [
    {
      id: 'free',
      label: 'Gratis',
      tagline: 'Untuk coba-coba dan pertanyaan singkat',
      dailyPromptLimit: 5,
      priceLabel: 'Gratis',
      features: [
        '5 prompt AI per hari',
        'Seluruh model free tier (Radox & InkStone)',
        'Riwayat percakapan, folder, dan tag',
        'AI Memory & Prompt Library',
      ],
    },
    {
      id: 'premium',
      label: 'Premium',
      tagline: 'Untuk kerja harian yang tidak boleh nunggu',
      dailyPromptLimit: 50,
      priceLabel: 'Rp 99.000 / bulan',
      features: [
        '50 prompt AI per hari (10x)',
        'Model premium tanpa batas kuota harian',
        'Konteks panjang, Agent Mode & tool keamanan',
        'Jadwal otomatis, export, dan bagikan',
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl shadow-black/80 text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Hyunk Premium</h2>
              <p className="text-[11px] text-slate-400">
                Paket gratis {plan === 'premium' ? 'ditinggalkan' : 'aktif'} &middot; kuota
                harian{' '}
                {isPremium ? (
                  <span className="text-amber-400 font-semibold">{limit} prompt</span>
                ) : (
                  <span className="text-cyan-400 font-semibold">{limit} prompt</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Current usage */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Prompt hari ini
              </span>
              <span className="tabular-nums text-slate-400">
                <span className={exhausted ? 'text-red-400 font-semibold' : 'text-slate-100 font-semibold'}>
                  {used}
                </span>{' '}
                / {limit}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  exhausted
                    ? 'bg-red-500'
                    : percent > 70
                      ? 'bg-amber-500'
                      : isPremium
                        ? 'bg-amber-400'
                        : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {exhausted
                ? 'Kuota hari ini sudah habis. Kuota direset pukul 00:00 UTC.'
                : `Sisa ${remaining} prompt lagi hari ini. Kuota direset pukul 00:00 UTC.`}
            </p>
          </section>

          {/* Plan comparison */}
          <section className="grid sm:grid-cols-2 gap-3">
            {plans.map((definition) => {
              const active = definition.id === plan;
              return (
                <div
                  key={definition.id}
                  className={`rounded-2xl border p-4 relative transition ${
                    active
                      ? definition.id === 'premium'
                        ? 'border-amber-500/60 bg-amber-950/20 shadow-lg shadow-amber-950/20'
                        : 'border-cyan-500/60 bg-cyan-950/20'
                      : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  {active && (
                    <span
                      className={`absolute -top-2 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        definition.id === 'premium'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-cyan-500 text-slate-950'
                      }`}
                    >
                      PAKET ANDA
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    {definition.id === 'premium' ? (
                      <Crown className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                    )}
                    <h3 className="text-sm font-bold text-slate-100">{definition.label}</h3>
                    <span className="ml-auto text-[11px] font-semibold text-slate-300">
                      {definition.priceLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">{definition.tagline}</p>
                  <p className="text-2xl font-bold text-slate-100 mb-3">
                    {definition.dailyPromptLimit}
                    <span className="text-xs font-medium text-slate-400 ml-1">prompt / hari</span>
                  </p>
                  <ul className="space-y-1.5">
                    {definition.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[11px] text-slate-300">
                        <Check
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                            definition.id === 'premium' ? 'text-amber-400' : 'text-cyan-400'
                          }`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          {/* Action */}
          <section className="flex flex-col sm:flex-row sm:items-center gap-3">
            {isPremium ? (
              <>
                <div className="flex-1 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  Premium aktif: {limit} prompt per hari (10x paket gratis).
                </div>
                <button
                  onClick={() => activate('downgrade')}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Kembali ke paket gratis
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 text-[11px] text-slate-400">
                  Paket gratis hanya boleh {limit} prompt per hari. Premium memberi{' '}
                  <span className="text-amber-400 font-semibold">10x</span> ({50} prompt).
                </div>
                <button
                  onClick={() => activate('upgrade')}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4" />
                  )}
                  Aktifkan Premium
                </button>
              </>
            )}
          </section>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-3 py-2">
              {success}
            </p>
          )}

          {/* Admin: manage the plan of another account */}
          {isAdmin && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                Kelola plan pengguna (admin)
              </h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Berikan paket premium ke akun lain berdasarkan emailnya.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="email@pengguna.com"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                />
                <select
                  value={adminPlan}
                  onChange={(event) => setAdminPlan(event.target.value as PlanId)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                >
                  <option value="premium">Premium</option>
                  <option value="free">Gratis</option>
                </select>
                <button
                  onClick={saveAdminPlan}
                  disabled={adminBusy}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {adminBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  Simpan
                </button>
              </div>
              {adminMessage && (
                <p className="text-[11px] text-cyan-300 mt-2">{adminMessage}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
