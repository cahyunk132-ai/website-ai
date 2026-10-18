/**
 * Hyunk AI Hub - Usage Monitoring, Quota & Token Management
 */

import { ProviderId, ProviderHealth } from './types';
import { getModelById } from './models';

// Live in-memory provider metrics (persisted to Supabase when configured)
const providerStats: Record<ProviderId, ProviderHealth> = {
  radox: {
    provider: 'radox',
    name: 'Radox AI',
    baseUrl: 'https://radoxai.com/v1',
    isConfigured: false,
    isHealthy: true,
    totalRequests: 0,
    failedRequests: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    estimatedCostUsd: 0,
    quotaStatus: 'unknown',
    quotaSource: 'estimated',
  },
  inkstone: {
    provider: 'inkstone',
    name: 'Intern InkStone',
    baseUrl: 'https://chat.intern-ai.org.cn/api/v1',
    isConfigured: false,
    isHealthy: true,
    totalRequests: 0,
    failedRequests: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    estimatedCostUsd: 0,
    quotaStatus: 'unknown',
    quotaSource: 'estimated',
  },
};

/**
 * Estimates token count based on typical UTF-8 English/Code heuristics (~4 chars/token).
 * For CJK (Chinese/Japanese/Korean), characters often equate to ~1 token/char.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '');
  const wordCount = nonCjkText.trim().split(/\s+/).filter(Boolean).length;
  const nonCjkTokenEstimate = Math.ceil(wordCount * 1.33);

  return Math.max(1, cjkCount + nonCjkTokenEstimate);
}

/**
 * Calculates estimated USD cost for a generation given prompt and completion tokens.
 */
export function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const model = getModelById(modelId);
  if (!model) return 0;

  const promptCost = (promptTokens / 1_000_000) * model.inputPricePerMillion;
  const completionCost = (completionTokens / 1_000_000) * model.outputPricePerMillion;

  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Records a completed request to in-memory stats.
 */
export function recordRequestUsage(params: {
  provider: ProviderId;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  isOfficialReport: boolean;
}): void {
  const { provider, modelId, promptTokens, completionTokens, isOfficialReport } = params;
  const stats = providerStats[provider];
  if (!stats) return;

  stats.totalRequests += 1;
  stats.lastSuccessfulRequest = new Date().toISOString();
  stats.isHealthy = true;

  stats.tokens.prompt += promptTokens;
  stats.tokens.completion += completionTokens;
  stats.tokens.total += promptTokens + completionTokens;

  const cost = calculateCost(modelId, promptTokens, completionTokens);
  stats.estimatedCostUsd = Number((stats.estimatedCostUsd + cost).toFixed(6));

  if (isOfficialReport) {
    stats.quotaSource = 'provider_reported';
  }

  // If successfully executed, quota is definitely active
  if (stats.quotaStatus === 'exhausted') {
    stats.quotaStatus = 'active';
  }
}

/**
 * Records a provider failure or quota exhaustion.
 */
export function recordProviderError(
  provider: ProviderId,
  errorMessage: string,
  isQuotaExhausted = false,
  isRateLimited = false
): void {
  const stats = providerStats[provider];
  if (!stats) return;

  stats.totalRequests += 1;
  stats.failedRequests += 1;
  stats.lastError = errorMessage;

  if (isQuotaExhausted) {
    stats.quotaStatus = 'exhausted';
    stats.isHealthy = false;
  } else if (isRateLimited) {
    stats.quotaStatus = 'rate_limited';
    stats.isHealthy = false;
  } else {
    stats.isHealthy = false;
  }
}

/**
 * Sets configuration status for a provider.
 */
export function setProviderConfigured(provider: ProviderId, configured: boolean): void {
  if (providerStats[provider]) {
    providerStats[provider].isConfigured = configured;
  }
}

/**
 * Returns current snapshot of all provider health and metrics.
 */
export function getAllProviderStats(): Record<ProviderId, ProviderHealth> {
  return JSON.parse(JSON.stringify(providerStats));
}
