'use client';

import React from 'react';
import { Crown, Zap, AlertTriangle } from 'lucide-react';

interface QuotaMeterProps {
  used: number;
  limit: number;
  remaining: number;
  premium: boolean;
  /** The tier of the account, e.g. "Premium 1". */
  tierLabel?: string;
  /** True when the account has no daily limit (admin). */
  unlimited?: boolean;
  onClick?: () => void;
}

/**
 * Shows how many AI requests are left today. The quota depends on the tier
 * of the account: 20 requests per day for a free account, up to 1000 for
 * Premium 4 and no limit at all for an administrator.
 */
export const QuotaMeter: React.FC<QuotaMeterProps> = ({
  used,
  limit,
  remaining,
  premium,
  tierLabel,
  unlimited = false,
  onClick,
}) => {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const exhausted = !unlimited && remaining <= 0;

  const barColor = exhausted
    ? 'bg-red-500'
    : percent > 70
      ? 'bg-amber-500'
      : premium
        ? 'bg-amber-400'
        : 'bg-cyan-500';

  const textColor = exhausted
    ? 'text-red-400'
    : percent > 70
      ? 'text-amber-400'
      : premium
        ? 'text-amber-300'
        : 'text-cyan-300';

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        unlimited
          ? `Admin: ${used} request terpakai hari ini, tanpa batas harian`
          : `${tierLabel ? tierLabel + ': ' : premium ? 'Premium: ' : 'Paket gratis: '}${remaining} dari ${limit} request tersisa hari ini${
              premium ? '' : '. Klik untuk upgrade.'
            }`
      }
      className={`flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg border transition ${
        onClick ? 'hover:bg-slate-800/60 cursor-pointer' : 'cursor-default'
      } ${
        exhausted
          ? 'border-red-900/60 bg-red-950/30'
          : premium
            ? 'border-amber-800/60 bg-amber-950/25'
            : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      {exhausted ? (
        <AlertTriangle className={`w-3.5 h-3.5 ${textColor}`} />
      ) : premium ? (
        <Crown className={`w-3.5 h-3.5 ${textColor}`} />
      ) : (
        <Zap className={`w-3.5 h-3.5 ${textColor}`} />
      )}
      <div className="w-10 sm:w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums ${textColor}`}>
        {used}/{unlimited ? '∞' : limit}
      </span>
    </button>
  );
};
