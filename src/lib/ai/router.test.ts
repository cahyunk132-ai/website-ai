import { describe, it, expect } from 'vitest';
import { ProviderRouter } from './router';
import { RadoxAdapter } from './providers/radox';
import { InkstoneAdapter } from './providers/inkstone';
import { QuotaExceededError } from './errors';
import { getModelById, getModelsByProvider } from './models';

describe('Provider Router & Automatic Fallback', () => {
  it('builds an appropriate execution plan with primary and fallback providers', () => {
    const router = new ProviderRouter();
    const plan = router.buildRoutePlan('claude-opus-4.8', 'radox');

    expect(plan.primaryProvider).toBe('radox');
    expect(plan.primaryModel).toBe('claude-opus-4.8');
    expect(plan.fallbackChain.length).toBeGreaterThan(0);
    expect(plan.fallbackChain.some((f) => f.provider === 'inkstone')).toBe(true);
  });

  it('automatically falls back to InkStone when Radox quota is exhausted', async () => {
    // Mock failing primary adapter
    const mockRadox = new RadoxAdapter('dummy-key');
    mockRadox.chatCompletion = async () => {
      throw new QuotaExceededError('radox', 'Your current balance is zero.');
    };

    // Mock successful secondary adapter
    const mockInkstone = new InkstoneAdapter('dummy-key');
    mockInkstone.chatCompletion = async (options) => {
      return {
        text: 'Hello from InkStone fallback!',
        model: options.model,
        provider: 'inkstone',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };
    };

    const router = new ProviderRouter({
      radox: mockRadox,
      inkstone: mockInkstone,
    });

    const result = await router.completeChat({
      messages: [{ role: 'user', content: 'Test message' }],
      model: 'deepseek-chat',
      provider: 'radox',
    });

    expect(result.text).toBe('Hello from InkStone fallback!');
    expect(result.provider).toBe('inkstone');
    expect(result.isFallback).toBe(true);
  });

  it('automatically falls back to Radox when InkStone quota is exhausted', async () => {
    // Mock failing InkStone adapter
    const mockInkstone = new InkstoneAdapter('dummy-key');
    mockInkstone.chatCompletion = async () => {
      throw new QuotaExceededError('inkstone', 'Rate limit or quota reached on InkStone.');
    };

    // Mock successful Radox adapter
    const mockRadox = new RadoxAdapter('dummy-key');
    mockRadox.chatCompletion = async (options) => {
      return {
        text: 'Hello from Radox fallback!',
        model: options.model,
        provider: 'radox',
        usage: { promptTokens: 15, completionTokens: 15, totalTokens: 30 },
      };
    };

    const router = new ProviderRouter({
      radox: mockRadox,
      inkstone: mockInkstone,
    });

    const result = await router.completeChat({
      messages: [{ role: 'user', content: 'Fallback to Radox' }],
      model: 'intern-latest',
      provider: 'inkstone',
    });

    expect(result.text).toBe('Hello from Radox fallback!');
    expect(result.provider).toBe('radox');
    expect(result.isFallback).toBe(true);
  });

  it('correctly registers all 12 platform catalog InkStone models with free tier eligibility', () => {
    const catalogIds = [
      'Agents-A1',
      'Atria-Dawn',
      'Atria-Dawn-Preview',
      'deepseek-v4-flash-0731',
      'deepseek-v4-flash-vision',
      'deepseek-v4-pro-0813',
      'glm-5.3',
      'intern-decision-4b',
      'intern-s2',
      'kimi-k2.6',
      'minimax-m3',
      'qwen3.8-27b',
    ];

    for (const modelId of catalogIds) {
      const model = getModelById(modelId, 'inkstone');
      expect(model, `Expected ${modelId} to exist in VERIFIED_MODELS`).toBeDefined();
      expect(model?.provider).toBe('inkstone');
      expect(model?.isFreeQuotaEligible).toBe(true);
      expect(model?.inputPricePerMillion).toBe(0.0);
      expect(model?.outputPricePerMillion).toBe(0.0);
    }

    const inkstoneModels = getModelsByProvider('inkstone');
    expect(inkstoneModels.length).toBeGreaterThanOrEqual(16);
  });
});
