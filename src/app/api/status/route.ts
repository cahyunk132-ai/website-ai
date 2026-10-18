/**
 * Hyunk AI Hub - Provider Status & Usage Metrics API
 */

import { NextResponse } from 'next/server';
import { getAllProviderStats } from '@/lib/ai/usage';
import { radoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter } from '@/lib/ai/providers/inkstone';

export async function GET() {
  const stats = getAllProviderStats();

  // Refresh configured state
  stats.radox.isConfigured = radoxAdapter.isConfigured();
  stats.inkstone.isConfigured = inkstoneAdapter.isConfigured();

  // Aggregate totals
  const totalRequests = Object.values(stats).reduce((acc, p) => acc + p.totalRequests, 0);
  const totalTokens = Object.values(stats).reduce((acc, p) => acc + p.tokens.total, 0);
  const totalCostUsd = Object.values(stats).reduce((acc, p) => acc + p.estimatedCostUsd, 0);

  return NextResponse.json({
    providers: stats,
    totals: {
      totalRequests,
      totalTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
    },
    system: {
      timestamp: new Date().toISOString(),
      primaryProvider: 'radox',
      fallbackPriority: ['radox', 'inkstone'],
    },
  });
}
