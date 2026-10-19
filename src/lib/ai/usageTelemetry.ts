/**
 * Hyunk AI Hub - Persistent provider telemetry (server side only)
 *
 * The live statistics of the providers live in the memory of the server
 * process (`src/lib/ai/usage.ts`). On a serverless platform every request can
 * land in another instance, so the telemetry dashboard always showed
 * "0 requests" and "None yet" even though the platform was busy.
 *
 * This module writes the telemetry into `public.provider_usage_daily` and reads
 * it back for the dashboard. The writes use the service role, therefore the
 * module must never be imported by a client component.
 *
 * The module is intentionally free of `next/headers`: the provider adapters
 * import it and those are also loaded by plain Node scripts and tests.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProviderId } from './types';
import { calculateCost } from './usage';

const TABLE = 'provider_usage_daily';

/** The aggregated telemetry of one provider. */
export interface ProviderTelemetryAggregate {
  provider: ProviderId;
  totalRequests: number;
  failedRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  lastSuccessAt: string | null;
  lastError: string | null;
}

/** The telemetry of every provider, keyed by the provider id. */
export type ProviderTelemetryMap = Record<string, ProviderTelemetryAggregate>;

/** One day of the platform wide activity. */
export interface TelemetryDailyPoint {
  date: string;
  requests: number;
  tokens: number;
}

/** Why the persisted telemetry could not be read. */
export type TelemetryIssue = 'not_configured' | 'missing_table' | 'query_failed';

export interface TelemetryReadResult<T> {
  data: T | null;
  issue: TelemetryIssue | null;
}

let cachedClient: SupabaseClient | null | undefined;

/**
 * The service role client of Supabase, or null when the database is not
 * configured (local development without Supabase).
 */
export function getTelemetryClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}

/** Only used by the tests: forgets the cached client. */
export function resetTelemetryClient(): void {
  cachedClient = undefined;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PostgreSQL error code of a missing table.
 */
const UNDEFINED_TABLE = '42P01';

function classifyError(error: any): TelemetryIssue {
  if (!error) return 'query_failed';
  if (error.code === UNDEFINED_TABLE || /does not exist/i.test(String(error.message))) {
    return 'missing_table';
  }
  return 'query_failed';
}

/**
 * Stores a successful request. The write is best effort: a telemetry problem
 * must never break a chat request.
 */
export async function persistProviderUsage(params: {
  provider: ProviderId;
  modelId?: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<void> {
  const supabase = getTelemetryClient();
  if (!supabase) return;

  const model = params.modelId || 'unknown';
  const date = todayUtc();
  const costUsd = calculateCost(
    params.modelId || 'unknown',
    params.promptTokens,
    params.completionTokens
  );

  try {
    const { error } = await supabase.rpc('record_provider_usage', {
      p_provider: params.provider,
      p_model: model,
      p_date: date,
      p_requests: 1,
      p_failures: 0,
      p_prompt_tokens: params.promptTokens,
      p_completion_tokens: params.completionTokens,
      p_cost_usd: costUsd,
      p_last_success: new Date().toISOString(),
      p_last_error: null,
    });

    if (!error) return;

    // The helper function is missing (the migration was not applied yet):
    // fall back to a read/modify/write cycle.
    const { data } = await supabase
      .from(TABLE)
      .select('request_count, failed_count, prompt_tokens, completion_tokens, cost_usd')
      .eq('provider', params.provider)
      .eq('model', model)
      .eq('date', date)
      .maybeSingle();

    await supabase.from(TABLE).upsert(
      {
        provider: params.provider,
        model,
        date,
        request_count: (data?.request_count ?? 0) + 1,
        failed_count: data?.failed_count ?? 0,
        prompt_tokens: (data?.prompt_tokens ?? 0) + params.promptTokens,
        completion_tokens: (data?.completion_tokens ?? 0) + params.completionTokens,
        cost_usd: Number(data?.cost_usd ?? 0) + costUsd,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,model,date' }
    );
  } catch {
    // Telemetry is best effort.
  }
}

/**
 * Stores a provider failure (timeout, rate limit, quota exhaustion, ...).
 */
export async function persistProviderFailure(params: {
  provider: ProviderId;
  modelId?: string;
  errorMessage: string;
}): Promise<void> {
  const supabase = getTelemetryClient();
  if (!supabase) return;

  const model = params.modelId || 'unknown';
  const date = todayUtc();
  const message = params.errorMessage.slice(0, 500);

  try {
    const { error } = await supabase.rpc('record_provider_usage', {
      p_provider: params.provider,
      p_model: model,
      p_date: date,
      p_requests: 0,
      p_failures: 1,
      p_prompt_tokens: 0,
      p_completion_tokens: 0,
      p_cost_usd: 0,
      p_last_success: null,
      p_last_error: message,
    });

    if (!error) return;

    const { data } = await supabase
      .from(TABLE)
      .select('request_count, failed_count, prompt_tokens, completion_tokens, cost_usd')
      .eq('provider', params.provider)
      .eq('model', model)
      .eq('date', date)
      .maybeSingle();

    await supabase.from(TABLE).upsert(
      {
        provider: params.provider,
        model,
        date,
        request_count: data?.request_count ?? 0,
        failed_count: (data?.failed_count ?? 0) + 1,
        prompt_tokens: data?.prompt_tokens ?? 0,
        completion_tokens: data?.completion_tokens ?? 0,
        cost_usd: Number(data?.cost_usd ?? 0),
        last_error: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,model,date' }
    );
  } catch {
    // Telemetry is best effort.
  }
}

/**
 * Reads the aggregated telemetry of the last `days` days.
 */
export async function readPersistedProviderStats(
  days: number = 30
): Promise<TelemetryReadResult<ProviderTelemetryMap>> {
  const supabase = getTelemetryClient();
  if (!supabase) return { data: null, issue: 'not_configured' };

  const span = Math.max(1, Math.min(365, Math.floor(days)));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (span - 1));
  const fromDate = from.toISOString().slice(0, 10);

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        'provider, model, date, request_count, failed_count, prompt_tokens, completion_tokens, cost_usd, last_success_at, last_error, updated_at'
      )
      .gte('date', fromDate)
      .order('updated_at', { ascending: false });

    if (error) {
      return { data: null, issue: classifyError(error) };
    }
    if (!data) {
      return { data: null, issue: 'query_failed' };
    }

    const map: ProviderTelemetryMap = {};
    // The rows are sorted by `updated_at`, therefore the first error that is
    // found for a provider is the most recent one.
    const errorSeen = new Set<string>();

    for (const row of data as any[]) {
      const provider = String(row.provider) as ProviderId;
      const entry =
        map[provider] ??
        (map[provider] = {
          provider,
          totalRequests: 0,
          failedRequests: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          lastSuccessAt: null,
          lastError: null,
        });

      entry.totalRequests += Number(row.request_count ?? 0);
      entry.failedRequests += Number(row.failed_count ?? 0);
      entry.promptTokens += Number(row.prompt_tokens ?? 0);
      entry.completionTokens += Number(row.completion_tokens ?? 0);
      entry.costUsd += Number(row.cost_usd ?? 0);

      if (row.last_success_at && (!entry.lastSuccessAt || row.last_success_at > entry.lastSuccessAt)) {
        entry.lastSuccessAt = String(row.last_success_at);
      }
      if (row.last_error && !errorSeen.has(provider)) {
        errorSeen.add(provider);
        entry.lastError = String(row.last_error);
      }
    }

    for (const entry of Object.values(map)) {
      entry.totalTokens = entry.promptTokens + entry.completionTokens;
      entry.costUsd = Number(entry.costUsd.toFixed(6));
    }

    return { data: map, issue: null };
  } catch (error: any) {
    return { data: null, issue: classifyError(error) };
  }
}

/**
 * Reads the platform wide activity of the last `days` days (one point per
 * day, oldest first).
 */
export async function readPersistedDailyUsage(
  days: number = 7
): Promise<TelemetryReadResult<TelemetryDailyPoint[]>> {
  const supabase = getTelemetryClient();
  if (!supabase) return { data: null, issue: 'not_configured' };

  const span = Math.max(1, Math.min(90, Math.floor(days)));
  const points: TelemetryDailyPoint[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);
    points.push({ date: date.toISOString().slice(0, 10), requests: 0, tokens: 0 });
  }

  const fromDate = points[0].date;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('date, request_count, failed_count, prompt_tokens, completion_tokens')
      .gte('date', fromDate);

    if (error) {
      return { data: null, issue: classifyError(error) };
    }
    if (!data) {
      return { data: null, issue: 'query_failed' };
    }

    const byDate = new Map(points.map((p) => [p.date, p]));
    for (const row of data as any[]) {
      const key =
        typeof row.date === 'string' ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10);
      const point = byDate.get(key);
      if (!point) continue;
      point.requests += Number(row.request_count ?? 0) + Number(row.failed_count ?? 0);
      point.tokens += Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0);
    }

    return { data: points, issue: null };
  } catch (error: any) {
    return { data: null, issue: classifyError(error) };
  }
}
