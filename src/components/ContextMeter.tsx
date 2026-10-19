'use client';

import React from 'react';
import { Gauge, AlertTriangle } from 'lucide-react';
import { formatTokenCount } from '@/lib/contextMeter';

interface ContextMeterProps {
  used: number;
  window: number;
  percent: number;
  warning: boolean;
  overflow: boolean;
}

/**
 * Shows how much of the model context window is already used.
 */
export const ContextMeter: React.FC<ContextMeterProps> = ({
  used,
  window,
  percent,
  warning,
  overflow,
}) => {
  const barColor = overflow
    ? 'bg-red-500'
    : warning
      ? 'bg-amber-500'
      : percent > 50
        ? 'bg-cyan-500'
        : 'bg-slate-600';

  const textColor = overflow
    ? 'text-red-400'
    : warning
      ? 'text-amber-400'
      : 'text-slate-400';

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      title={`Context terpakai ${formatTokenCount(used)} dari ${formatTokenCount(window)} token (${percent}%)`}
    >
      {warning && <AlertTriangle className={`w-3.5 h-3.5 ${textColor}`} />}
      <Gauge className={`w-3.5 h-3.5 ${textColor}`} />
      <div className="w-16 sm:w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums ${textColor}`}>
        {formatTokenCount(used)} / {formatTokenCount(window)}
      </span>
    </div>
  );
};
