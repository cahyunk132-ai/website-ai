/**
 * Hyunk AI Hub - Intelligent Multi-Provider Router & Automatic Fallback Engine
 */

import {
  ChatOptions,
  ChatCompletionResult,
  ChatStreamChunk,
  ProviderId,
  ProviderAdapter,
} from './types';
import { Tier } from './tiers';
import { getModelById, getFallbackForModel, VERIFIED_MODELS } from './models';
import { radoxAdapter, RadoxAdapter } from './providers/radox';
import { inkstoneAdapter, InkstoneAdapter } from './providers/inkstone';
import {
  AIProviderError,
  QuotaExceededError,
  RateLimitError,
  ModelNotFoundError,
} from './errors';
import { getAllProviderStats } from './usage';

export interface RouteExecutionPlan {
  primaryProvider: ProviderId;
  primaryModel: string;
  fallbackChain: Array<{
    provider: ProviderId;
    model: string;
    reason: string;
  }>;
}

export class ProviderRouter {
  private adapters: Map<ProviderId, ProviderAdapter>;

  constructor(customAdapters?: {
    radox?: RadoxAdapter;
    inkstone?: InkstoneAdapter;
  }) {
    this.adapters = new Map();
    this.adapters.set('radox', customAdapters?.radox || radoxAdapter);
    this.adapters.set('inkstone', customAdapters?.inkstone || inkstoneAdapter);
  }

  getAdapter(provider: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Provider adapter for '${provider}' not found.`);
    }
    return adapter;
  }

  /**
   * Builds an execution route plan with primary and ordered fallback candidates.
   */
  buildRoutePlan(
    requestedModelId: string,
    preferredProvider?: ProviderId,
    maxTier?: Tier
  ): RouteExecutionPlan {
    const model = getModelById(requestedModelId, preferredProvider);
    const primaryProvider = preferredProvider || model?.provider || 'radox';
    const primaryModel = model?.id || requestedModelId;

    const fallbackChain: Array<{ provider: ProviderId; model: string; reason: string }> = [];

    // A fallback may never unlock a model the account is not allowed to use.
    const isAllowed = (candidateId: string, candidateProvider: ProviderId) => {
      if (maxTier === undefined) return true;
      const candidate = getModelById(candidateId, candidateProvider);
      return (candidate?.minTier ?? 0) <= maxTier;
    };

    // Check primary model's designated fallback
    if (model) {
      const fallbackTarget = getFallbackForModel(model);
      if (
        fallbackTarget &&
        fallbackTarget.targetProvider !== primaryProvider &&
        isAllowed(fallbackTarget.targetModelId, fallbackTarget.targetProvider)
      ) {
        fallbackChain.push({
          provider: fallbackTarget.targetProvider,
          model: fallbackTarget.targetModelId,
          reason: `Designated fallback route for ${model.name}`,
        });
      }
    }

    // Add remaining configured providers as safety net
    const allProviders: ProviderId[] = ['radox', 'inkstone'];
    for (const p of allProviders) {
      if (p !== primaryProvider && !fallbackChain.some((f) => f.provider === p)) {
        const defaultModel = VERIFIED_MODELS.find((m) => m.provider === p)?.id || 'intern-latest';
        if (!isAllowed(defaultModel, p)) continue;
        fallbackChain.push({
          provider: p,
          model: defaultModel,
          reason: `General high-availability secondary fallback to ${p}`,
        });
      }
    }

    return {
      primaryProvider,
      primaryModel,
      fallbackChain,
    };
  }

  /**
   * Helper delay for bounded exponential backoff
   */
  private async waitBackoff(seconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Operation cancelled'));
      const timer = setTimeout(resolve, Math.min(seconds * 1000, 15000));
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Operation cancelled'));
      });
    });
  }

  /**
   * Routes chat stream with seamless automated fallback if quota or rate limits are reached.
   */
  async streamChat(
    options: ChatOptions,
    onChunk: (chunk: ChatStreamChunk) => void
  ): Promise<ChatCompletionResult> {
    const plan = this.buildRoutePlan(options.model, options.provider, options.maxTier);
    const executionAttempts: Array<{ provider: ProviderId; model: string; isFallback: boolean; fallbackReason?: string }> = [
      { provider: plan.primaryProvider, model: plan.primaryModel, isFallback: false },
      ...plan.fallbackChain.map((f) => ({
        provider: f.provider,
        model: f.model,
        isFallback: true,
        fallbackReason: f.reason,
      })),
    ];

    let lastError: Error | null = null;
    const providerStats = getAllProviderStats();

    for (let i = 0; i < executionAttempts.length; i++) {
      const attempt = executionAttempts[i];
      const adapter = this.getAdapter(attempt.provider);

      // Verify that provider is configured
      if (!adapter.isConfigured()) {
        continue;
      }

      // Check known quota exhaustion in stats
      const currentHealth = providerStats[attempt.provider];
      if (currentHealth && currentHealth.quotaStatus === 'exhausted' && !attempt.isFallback) {
        // Skip exhausted provider to prevent needless failure
        continue;
      }

      try {
        // Notify client if this execution is a fallback route
        if (attempt.isFallback) {
          const fallbackNotice = `Notice: Primary provider quota or rate limit reached. Auto-routed via ${adapter.name} (${attempt.model}).`;
          onChunk({
            text: '',
            done: false,
            model: attempt.model,
            provider: attempt.provider,
            isFallback: true,
            fallbackNotice,
          });
        }

        const result = await adapter.chatStream(
          {
            ...options,
            model: attempt.model,
            provider: attempt.provider,
          },
          (chunk) => {
            onChunk({
              ...chunk,
              isFallback: attempt.isFallback,
              model: attempt.model,
              provider: attempt.provider,
            });
          }
        );

        return {
          ...result,
          isFallback: attempt.isFallback,
          fallbackNotice: attempt.isFallback ? `Completed via ${adapter.name} (${attempt.model})` : undefined,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const normError = err instanceof AIProviderError ? err : new AIProviderError(lastError.message, { provider: attempt.provider });

        // If rate limited with retry-after and it's the primary attempt, back off once
        if (normError instanceof RateLimitError && normError.retryAfterSeconds && normError.retryAfterSeconds <= 5) {
          try {
            await this.waitBackoff(normError.retryAfterSeconds, options.signal);
            // Retry once
            const retryResult = await adapter.chatStream(
              {
                ...options,
                model: attempt.model,
                provider: attempt.provider,
              },
              onChunk
            );
            return retryResult;
          } catch (retryErr) {
            lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          }
        }

        // Check if error is eligible for fallback (QuotaExceeded, RateLimit, ServerError, Timeout)
        const isEligibleForFallback =
          normError instanceof QuotaExceededError ||
          normError instanceof RateLimitError ||
          normError.statusCode === 429 ||
          normError.statusCode === 503 ||
          normError.statusCode === 502 ||
          normError.statusCode === 408;

        if (isEligibleForFallback && i < executionAttempts.length - 1) {
          // Log and continue to next fallback candidate
          continue;
        }

        // If not eligible (e.g., auth failure or malformed payload) or no fallbacks left, throw
        throw normError;
      }
    }

    throw lastError || new Error('All configured providers failed or no eligible provider available.');
  }

  /**
   * Non-streaming completion with automatic fallback
   */
  async completeChat(options: ChatOptions): Promise<ChatCompletionResult> {
    const plan = this.buildRoutePlan(options.model, options.provider, options.maxTier);
    const executionAttempts = [
      { provider: plan.primaryProvider, model: plan.primaryModel, isFallback: false },
      ...plan.fallbackChain.map((f) => ({
        provider: f.provider,
        model: f.model,
        isFallback: true,
        fallbackReason: f.reason,
      })),
    ];

    let lastError: Error | null = null;
    const providerStats = getAllProviderStats();

    for (let i = 0; i < executionAttempts.length; i++) {
      const attempt = executionAttempts[i];
      const adapter = this.getAdapter(attempt.provider);

      if (!adapter.isConfigured()) continue;

      const currentHealth = providerStats[attempt.provider];
      if (currentHealth && currentHealth.quotaStatus === 'exhausted' && !attempt.isFallback) {
        continue;
      }

      try {
        const result = await adapter.chatCompletion({
          ...options,
          model: attempt.model,
          provider: attempt.provider,
        });

        return {
          ...result,
          isFallback: attempt.isFallback,
          fallbackNotice: attempt.isFallback ? `Routed via fallback ${adapter.name}` : undefined,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const normError = err instanceof AIProviderError ? err : new AIProviderError(lastError.message, { provider: attempt.provider });

        const isEligibleForFallback =
          normError instanceof QuotaExceededError ||
          normError instanceof RateLimitError ||
          normError.statusCode === 429 ||
          normError.statusCode === 503 ||
          normError.statusCode === 408;

        if (isEligibleForFallback && i < executionAttempts.length - 1) {
          continue;
        }

        throw normError;
      }
    }

    throw lastError || new Error('All configured providers failed or no eligible provider available.');
  }
}

export const defaultRouter = new ProviderRouter();
