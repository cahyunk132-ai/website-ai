'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
  Layers,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { ProviderId } from '@/lib/ai/types';

interface KeyItem {
  id: string;
  provider: ProviderId;
  maskedKey: string;
  source: 'env' | 'database';
  isHealthy: boolean;
  isCoolingDown: boolean;
  cooldownSeconds: number;
  lastError?: string;
  usageCount: number;
  lastUsedAt?: string;
}

interface ProviderSettings {
  isConfigured: boolean;
  keys: KeyItem[];
  totalKeys: number;
  activeKeys: number;
  hasEnvKey: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [settings, setSettings] = useState<Record<string, ProviderSettings>>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderId>('radox');
  const [inputKey, setInputKey] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || {});
      }
    } catch {
      // Failed to load settings
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setInputKey('');
      setStatusMsg(null);
    }
  }, [isOpen]);

  const handleAddKey = async (provider: ProviderId) => {
    if (!inputKey.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: inputKey.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: data.message || `API key(s) added successfully for ${provider}.`,
        });
        setInputKey('');
        await fetchSettings();
        onSaved?.();
      } else {
        setStatusMsg({
          type: 'error',
          text: data.error || 'Failed to add API key',
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error while adding credentials',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (provider: ProviderId, keyId: string) => {
    setDeletingId(keyId);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', provider, keyId }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: data.message || 'Key removed from pool.',
        });
        await fetchSettings();
        onSaved?.();
      } else {
        setStatusMsg({
          type: 'error',
          text: data.error || 'Failed to remove key',
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error while deleting key',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  const currentProviderData = settings[activeTab] || {
    isConfigured: false,
    keys: [],
    totalKeys: 0,
    activeKeys: 0,
    hasEnvKey: false,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Multi-Account API Key Pool</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 font-normal">
                  Auto-Rotation & Failover
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                AES-256-GCM encrypted. Supports multiple keys per provider to maximize quota.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Provider Tabs */}
          <div className="flex border-b border-slate-800 pb-2 gap-2 text-xs">
            {(['radox', 'inkstone'] as ProviderId[]).map((p) => {
              const label = p === 'radox' ? 'Radox AI' : 'Intern InkStone';
              const pData = settings[p];
              const isConfigured = Boolean(pData && pData.totalKeys > 0);

              return (
                <button
                  key={p}
                  onClick={() => {
                    setActiveTab(p);
                    setInputKey('');
                    setStatusMsg(null);
                  }}
                  className={`px-3 py-2 rounded-xl font-medium flex items-center gap-2 transition ${
                    activeTab === p
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConfigured ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <span>{label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700/60 text-slate-300 font-mono">
                    {pData?.totalKeys || 0} keys
                  </span>
                </button>
              );
            })}
          </div>

          {/* Key Pool Status Summary Banner */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-950/70 text-cyan-400 border border-cyan-800/50">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-200">
                  {activeTab === 'radox' ? 'Radox AI' : 'Intern InkStone'} Key Pool
                </p>
                <p className="text-[11px] text-slate-400">
                  {currentProviderData.totalKeys} keys registered • {currentProviderData.activeKeys} active & ready
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchSettings}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
              title="Refresh key pool status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* List of Registered Keys in Pool */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Registered Credentials ({currentProviderData.keys?.length || 0}):
            </label>

            {currentProviderData.keys?.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500 bg-slate-950/40">
                No API keys currently configured for this provider. Add one below or configure in .env.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {currentProviderData.keys?.map((k, idx) => (
                  <div
                    key={k.id || idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2.5">
                      <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-semibold text-slate-200">{k.maskedKey}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-sans font-bold border ${
                          k.source === 'env'
                            ? 'bg-blue-950/80 text-blue-300 border-blue-800/40'
                            : 'bg-purple-950/80 text-purple-300 border-purple-800/40'
                        }`}
                      >
                        {k.source === 'env' ? 'ENV VAR' : 'SAVED'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {k.isCoolingDown ? (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50 font-sans">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>Cooldown ({k.cooldownSeconds}s)</span>
                        </span>
                      ) : k.isHealthy ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50 font-sans">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/50 font-sans">
                          Limit Hit
                        </span>
                      )}

                      <span className="text-[10px] text-slate-500 font-sans">
                        {k.usageCount} uses
                      </span>

                      {k.source === 'database' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(activeTab, k.id)}
                          disabled={deletingId === k.id}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition"
                          title="Remove key from pool"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Key(s) Form */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="block text-xs font-medium text-slate-300">
              Add API Key(s) to {activeTab === 'radox' ? 'Radox AI' : 'Intern InkStone'} Pool:
            </label>
            <textarea
              rows={2}
              placeholder={
                activeTab === 'radox'
                  ? 'Paste Radox API Key (e.g. sk-... or cc_...). Multiple keys can be separated by commas or newlines.'
                  : 'Paste Intern InkStone Bearer Token. Multiple keys can be separated by commas or newlines.'
              }
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono resize-none"
            />
            <p className="text-[11px] text-slate-500">
              💡 Tip: Multiple accounts will automatically load-balance requests. If an account runs out of free quota or hits a rate limit, the system instantly switches to the next account without breaking the user chat.
            </p>

            <button
              type="button"
              onClick={() => handleAddKey(activeTab)}
              disabled={saving || !inputKey.trim()}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-xs font-semibold text-white transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying & Adding Credentials...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Verify & Add Credentials to Pool</span>
                </>
              )}
            </button>
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-800/80 text-rose-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero-Exposure Key Isolation Active</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
