'use client';

import React, { useEffect, useState } from 'react';
import { X, Key, ShieldCheck, Check, AlertCircle, Loader2 } from 'lucide-react';
import { ProviderId } from '@/lib/ai/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [settings, setSettings] = useState<Record<string, { isConfigured: boolean; maskedKey: string; hasEnvKey: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProviderId>('radox');
  const [inputKey, setInputKey] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSaveKey = async (provider: ProviderId) => {
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
          text: data.message || `API key for ${provider} saved and encrypted successfully.`,
        });
        setInputKey('');
        fetchSettings();
        onSaved?.();
      } else {
        setStatusMsg({
          type: 'error',
          text: data.error || 'Failed to save API key',
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error while saving credentials',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Provider API Credentials</h2>
              <p className="text-xs text-slate-400">
                Encrypted at rest using AES-256-GCM. Never exposed to browser or logs.
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
        <div className="p-6 space-y-5">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 pb-2 gap-2 text-xs">
            {(['radox', 'inkstone'] as ProviderId[]).map((p) => {
              const label = p === 'radox' ? 'Radox AI' : 'Intern InkStone';
              const isConfigured = settings[p]?.isConfigured;

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
                </button>
              );
            })}
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Current Status:</span>
              <span className="font-mono text-cyan-300">
                {settings[activeTab]?.maskedKey || 'Checking...'}
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Update or Rotate API Key:
              </label>
              <input
                type="password"
                placeholder={
                  activeTab === 'radox'
                    ? 'Enter Radox AI Key (cc_... or sk-...)'
                    : 'Enter Intern InkStone Bearer Token'
                }
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                {activeTab === 'radox' && 'Get keys from https://radoxai.com/'}
                {activeTab === 'inkstone' && 'Get keys from https://discovery.intern-ai.org.cn/'}
              </p>
            </div>

            {statusMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-300'
                    : 'bg-rose-950/40 border border-rose-800/50 text-rose-300'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}

            <button
              onClick={() => handleSaveKey(activeTab)}
              disabled={saving || !inputKey.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-medium text-xs shadow-md shadow-blue-500/10 transition active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encrypting & Validating Connection...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Save & Test Credentials</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
