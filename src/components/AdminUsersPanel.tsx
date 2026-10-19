'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Loader2,
  Users,
  Crown,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

interface RoleOption {
  id: string;
  name: string;
  tier: number;
  badge: string;
  description: string;
  dailyRequestLimit: number | null;
  unlimited: boolean;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tier: number;
  usedToday: number;
  createdAt: string;
  manual: boolean;
}

/**
 * The admin panel of the role & tier system: every account is listed with its
 * role, its tier and the requests it used today. The role can be changed
 * directly, the change is written to the `user_roles` table.
 */
export const AdminUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Gagal memuat daftar pengguna.');
        return;
      }
      setUsers(data.users || []);
      setRoles(data.roles || []);
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(needle) ||
        u.name.toLowerCase().includes(needle) ||
        u.role.toLowerCase().includes(needle)
    );
  }, [users, search]);

  const changeRole = async (user: AdminUser, role: string) => {
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan role.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, role: data.role, tier: data.tier, manual: !!data.manual }
            : u
        )
      );
      setNotice(`Role ${user.email} diubah menjadi ${data.role}.`);
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const resetRole = async (user: AdminUser) => {
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, reset: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Gagal mengembalikan role.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, role: data.role, tier: data.tier, manual: !!data.manual }
            : u
        )
      );
      setNotice(`Role ${user.email} kembali mengikuti paketnya (${data.role}).`);
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
    }
  };

  const roleOptions = roles.length
    ? roles
    : [
        { id: 'free', name: 'Free', tier: 0, badge: '🆓', description: '', dailyRequestLimit: 20, unlimited: false },
        { id: 'premium1', name: 'Premium 1', tier: 1, badge: '⭐', description: '', dailyRequestLimit: 100, unlimited: false },
        { id: 'premium2', name: 'Premium 2', tier: 2, badge: '⭐⭐', description: '', dailyRequestLimit: 200, unlimited: false },
        { id: 'premium3', name: 'Premium 3', tier: 3, badge: '⭐⭐⭐', description: '', dailyRequestLimit: 500, unlimited: false },
        { id: 'premium4', name: 'Premium 4', tier: 4, badge: '💎', description: '', dailyRequestLimit: 1000, unlimited: false },
        { id: 'admin', name: 'Admin', tier: 4, badge: '👑', description: '', dailyRequestLimit: null, unlimited: true },
      ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-3 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">Kelola Role Pengguna</h1>
              <p className="text-[11px] text-slate-400">
                Role menentukan kuota harian, panjang jawaban, dan model yang boleh dipakai.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-300"
            >
              Kembali ke chat
            </a>
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Muat ulang
            </button>
          </div>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari email, nama, atau role..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
        {notice && (
          <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-3 py-2">
            {notice}
          </p>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat pengguna...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Users className="w-6 h-6" />
              Tidak ada pengguna yang cocok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="px-4 py-3 font-semibold">Pengguna</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Tier</th>
                    <th className="px-4 py-3 font-semibold">Pemakaian hari ini</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => {
                    const option = roleOptions.find((r) => r.id === user.role);
                    const limit = option?.dailyRequestLimit ?? null;
                    const unlimited = option?.unlimited ?? false;
                    const percent =
                      !unlimited && limit ? Math.min(100, Math.round((user.usedToday / limit) * 100)) : 0;

                    return (
                      <tr key={user.id} className="border-b border-slate-800/70 text-xs hover:bg-slate-900/60">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100 truncate max-w-[220px]">
                            {user.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                            {user.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={user.role}
                            disabled={busyId === user.id}
                            onChange={(e) => changeRole(user, e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                          >
                            {roleOptions.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.badge} {r.name}
                              </option>
                            ))}
                          </select>
                          {user.manual && (
                            <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-mono">
                              MANUAL
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300 font-mono">T{user.tier}</span>
                        </td>
                        <td className="px-4 py-3">
                          {unlimited ? (
                            <span className="text-amber-300 font-mono">{user.usedToday} / ∞</span>
                          ) : (
                            <>
                              <div className="font-mono text-slate-300">
                                {user.usedToday} / {limit ?? '-'}
                              </div>
                              <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                                  style={{ width: `${Math.max(3, percent)}%` }}
                                />
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {user.manual && (
                            <button
                              onClick={() => resetRole(user)}
                              disabled={busyId === user.id}
                              title="Kembalikan ke role bawaan paket"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 text-[10px] text-slate-400 hover:text-white hover:border-slate-700 disabled:opacity-60"
                            >
                              {busyId === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              Reset
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-600 flex items-center gap-1.5">
          <Crown className="w-3 h-3" />
          Perubahan role langsung berlaku untuk permintaan berikutnya, tanpa perlu login ulang.
        </p>
      </div>
    </div>
  );
};
