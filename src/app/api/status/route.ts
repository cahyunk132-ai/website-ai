/**
 * Hyunk AI Hub - Provider Status & Usage Metrics API
 */

import { NextResponse } from 'next/server';
import { getAllProviderStats } from '@/lib/ai/usage';
import { readPersistedProviderStats } from '@/lib/ai/usageTelemetry';
import { radoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter } from '@/lib/ai/providers/inkstone';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = getAllProviderStats();

  // Refresh configured state
  stats.radox.isConfigured = radoxAdapter.isConfigured();
  stats.inkstone.isConfigured = inkstoneAdapter.isConfigured();

  // Read persisted telemetry from Supabase (30 days)
  const { data: persisted, issue } = await readPersistedProviderStats(30);

  // Merge persisted telemetry into the live stats
  if (persisted) {
    for (const [providerId, telemetry] of Object.entries(persisted)) {
      const providerKey = providerId as 'radox' | 'inkstone';
      if (stats[providerKey]) {
        // Use persisted totals instead of in-memory (which resets on server restart)
        stats[providerKey].totalRequests = telemetry.totalRequests;
        stats[providerKey].failedRequests = telemetry.failedRequests;
        stats[providerKey].tokens = {
          prompt: telemetry.promptTokens,
          completion: telemetry.completionTokens,
          total: telemetry.totalTokens,
        };
        stats[providerKey].estimatedCostUsd = telemetry.costUsd;
        if (telemetry.lastSuccessAt) {
          stats[providerKey].lastSuccessfulRequest = telemetry.lastSuccessAt;
        }
        if (telemetry.lastError) {
          stats[providerKey].lastError = telemetry.lastError;
        }
      }
    }
  }

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
      telemetryIssue: issue,
    },
  });
}
