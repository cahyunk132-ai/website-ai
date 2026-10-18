'use client';

import React, { useEffect, useState } from 'react';
import { X, Activity, RefreshCw, AlertTriangle, CheckCircle2, Clock, DollarSign, Database } from 'lucide-react';
import { ProviderHealth, ProviderId } from '@/lib/ai/types';

interface UsageDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsageDashboardModal: React.FC<UsageDashboardModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    providers: Record<ProviderId, ProviderHealth>;
    totals: { totalRequests: number; totalTokens: number; totalCostUsd: number };
    system: { timestamp: string; primaryProvider: string; fallbackPriority: string[] };
  } | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Failed to load metrics
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMetrics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Usage & Quota Health Dashboard</h2>
              <p className="text-xs text-slate-400">
                Multi-provider telemetry, quota monitoring, and automated fallback tracking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchMetrics}
              disabled={loading}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Aggregated Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total Requests</span>
                <Database className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {data?.totals.totalRequests ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Across all active providers</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Processed Tokens</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {(data?.totals.totalTokens ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Prompt + completion tokens</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Estimated Spend</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-slate-100">
                ${data?.totals.totalCostUsd?.toFixed(4) ?? '0.0000'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Calculated from official rates</div>
            </div>
          </div>

          {/* Provider Breakdown Cards */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Provider Connection & Quota Status
            </h3>

            {data?.providers &&
              Object.values(data.providers).map((p) => {
                const isHealthy = p.isHealthy && p.isConfigured;
                return (
                  <div
                    key={p.provider}
                    className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/90 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {isHealthy ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : p.quotaStatus === 'exhausted' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-slate-700" />
                        )}
                        <span className="font-semibold text-sm text-slate-200">{p.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300">
                          {p.baseUrl}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-md font-medium ${
                            !p.isConfigured
                              ? 'bg-slate-800 text-slate-400'
                              : p.quotaStatus === 'exhausted'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : p.quotaStatus === 'rate_limited'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {!p.isConfigured
                            ? 'Not Configured'
                            : p.quotaStatus === 'exhausted'
                            ? 'Quota Exhausted'
                            : p.quotaStatus === 'rate_limited'
                            ? 'Rate Limited (Cooling Off)'
                            : 'Active & Ready'}
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-800/60">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Requests:</span>
                        <span className="font-semibold text-slate-200">
                          {p.totalRequests} ({p.failedRequests} failed)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Token Balance:</span>
                        <span className="font-semibold text-slate-200">
                          {p.quotaStatus === 'exhausted'
                            ? '0 (Exhausted)'
                            : p.quotaSource === 'provider_reported'
                            ? 'Provider Active'
                            : 'Unknown (Heuristic)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Last Success:</span>
                        <span className="font-mono text-[11px] text-slate-300">
                          {p.lastSuccessfulRequest
                            ? new Date(p.lastSuccessfulRequest).toLocaleTimeString()
                            : 'None yet'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Quota Source:</span>
                        <span className="capitalize text-slate-300">
                          {p.quotaSource.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {p.lastError && (
                      <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/40 text-[11px] text-rose-300 font-mono">
                        Last Error: {p.lastError}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Fallback Hierarchy Diagram */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
            <h4 className="font-semibold text-slate-300">Configured Fallback Priority Flow</h4>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-medium">
                1. Radox AI (Primary)
              </span>
              <span className="text-slate-500">➔</span>
              <span className="px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 font-medium">
                2. Intern InkStone (Academic Fallback)
              </span>
              <span className="text-slate-500">➔</span>
              <span className="px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 font-medium">
                3. Experiential Labs (Enterprise Backup)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              If an active provider encounters an HTTP 429 quota exhaustion or server timeout, the router automatically preserves the full conversation context and routes the query to the designated compatible secondary provider without breaking your chat stream.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
