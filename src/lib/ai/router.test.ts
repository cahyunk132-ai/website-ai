import { describe, it, expect } from 'vitest';
import { ProviderRouter } from './router';
import { RadoxAdapter } from './providers/radox';
import { InkstoneAdapter } from './providers/inkstone';
import { ExperientialAdapter } from './providers/experiential';
import { QuotaExceededError } from './errors';

describe('Provider Router & Automatic Fallback', () => {
  it('builds an appropriate execution plan with primary and fallback providers', () => {
    const router = new ProviderRouter();
    const plan = router.buildRoutePlan('claude-opus-4.8', 'radox');

    expect(plan.primaryProvider).toBe('radox');
    expect(plan.primaryModel).toBe('claude-opus-4.8');
    expect(plan.fallbackChain.length).toBeGreaterThan(0);
    expect(plan.fallbackChain.some((f) => f.provider === 'experiential')).toBe(true);
  });

  it('automatically falls back to secondary provider when primary quota is exhausted', async () => {
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

    const mockExperiential = new ExperientialAdapter();

    const router = new ProviderRouter({
      radox: mockRadox,
      inkstone: mockInkstone,
      experiential: mockExperiential,
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
});
