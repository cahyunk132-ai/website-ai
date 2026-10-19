/**
 * Hyunk AI Hub - Provider Status & Usage Metrics API
 */

import { NextResponse } from 'next/server';
import { getAllProviderStats } from '@/lib/ai/usage';
import { readPersistedProviderStats } from '@/lib/ai/usageTelemetry';
import { createServerSupabaseAdminClient } from '@/lib/supabase/server';
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

  // Also aggregate from usage_logs (per-user daily activity) to show total platform activity
  // This ensures the dashboard shows real numbers even before provider_usage_daily is populated
  let usageLogsTotalRequests = 0;
  let usageLogsTotalTokens = 0;
  
  const supabase = createServerSupabaseAdminClient();
  if (supabase) {
    try {
      const { data: usageLogs, error } = await supabase
        .from('usage_logs')
        .select('request_count, tokens_used');
      
      if (!error && usageLogs) {
        for (const row of usageLogs) {
          usageLogsTotalRequests += Number(row.request_count ?? 0);
          usageLogsTotalTokens += Number(row.tokens_used ?? 0);
        }
      }
    } catch {
      // Best effort - don't break the endpoint if usage_logs query fails
    }
  }

  // Aggregate totals: use the maximum of provider telemetry and usage_logs
  // (provider telemetry is more accurate for cost, usage_logs is more accurate for request count)
  const providerTotalRequests = Object.values(stats).reduce((acc, p) => acc + p.totalRequests, 0);
  const providerTotalTokens = Object.values(stats).reduce((acc, p) => acc + p.tokens.total, 0);
  const totalCostUsd = Object.values(stats).reduce((acc, p) => acc + p.estimatedCostUsd, 0);
  
  const totalRequests = Math.max(providerTotalRequests, usageLogsTotalRequests);
  const totalTokens = Math.max(providerTotalTokens, usageLogsTotalTokens);

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
