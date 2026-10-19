'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, Loader2, AlertTriangle } from 'lucide-react';

interface DailyPoint {
  date: string;
  requests: number;
  tokens: number;
}

interface UsageChartProps {
  days?: number;
}

/**
 * Compact SVG bar chart of the daily request count.
 */
export const UsageChart: React.FC<UsageChartProps> = ({ days = 7 }) => {
  const [points, setPoints] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<'requests' | 'tokens'>('requests');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/usage/daily?days=${days}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPoints(data.points || []);
        } else if (!cancelled) {
          setError('Gagal memuat grafik.');
        }
      } catch {
        if (!cancelled) setError('Gagal memuat grafik.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const values = points.map((point) => point[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);

  const dayLabel = (iso: string): string => {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', '');
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">Aktivitas {days} hari terakhir</h3>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-800/60 p-0.5">
          {(
            [
              { id: 'requests', label: 'Request' },
              { id: 'tokens', label: 'Token' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setMetric(item.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                metric === item.id
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-28 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-28 text-[11px] text-red-400 gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1.5 h-28">
            {points.map((point) => {
              const value = point[metric];
              const height = Math.max(4, Math.round((value / max) * 100));
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="relative w-full flex items-end justify-center h-full">
                    <span className="absolute -top-1 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                      {value}
                    </span>
                    <div
                      className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-cyan-600/70 to-cyan-400/80 group-hover:from-cyan-500 group-hover:to-cyan-300 transition-all"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">{dayLabel(point.date)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Total {days} hari: <span className="text-slate-300 font-medium">{total}</span>{' '}
            {metric === 'requests' ? 'request' : 'token'}
          </p>
        </>
      )}
    </div>
  );
};
