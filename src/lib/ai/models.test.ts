import { describe, it, expect } from 'vitest';
import {
  VERIFIED_MODELS,
  getModelById,
  getModelsForTier,
  getModelsForTierByProvider,
  getFallbackForModel,
} from './models';

describe('model tier access', () => {
  it('gives every model a tier', () => {
    for (const model of VERIFIED_MODELS) {
      expect([0, 1, 2, 3, 4]).toContain(model.minTier);
    }
  });

  it('uses the tiers of the specification', () => {
    // Tier 0 - the free models
    expect(getModelById('gemma-2-2b')?.minTier).toBe(0);
    expect(getModelById('deepseek-v4-flash-0731')?.minTier).toBe(0);

    // Tier 1
    expect(getModelById('gpt-5.6-luna')?.minTier).toBe(1);
    expect(getModelById('qwen3.8-27b')?.minTier).toBe(1);

    // Tier 2
    expect(getModelById('glm-5.3')?.minTier).toBe(2);
    expect(getModelById('kimi-k2.6')?.minTier).toBe(2);
    expect(getModelById('gemini-3.7-flash')?.minTier).toBe(2);

    // Tier 3
    expect(getModelById('deepseek-v4-pro-0813')?.minTier).toBe(3);
    expect(getModelById('claude-sonnet-5')?.minTier).toBe(3);
    expect(getModelById('gemini-3.1-pro')?.minTier).toBe(3);

    // Tier 4 - the flagships
    expect(getModelById('claude-opus-5.5')?.minTier).toBe(4);
    expect(getModelById('gpt-5.6-sol')?.minTier).toBe(4);
    expect(getModelById('claude-opus-5')?.minTier).toBe(4);
  });

  it('unlocks every model of a lower tier', () => {
    const tier0 = getModelsForTier(0);
    const tier1 = getModelsForTier(1);
    const tier4 = getModelsForTier(4);

    expect(tier0.length).toBeGreaterThan(0);
    expect(tier0.every((m) => m.minTier <= 0)).toBe(true);
    expect(tier1.length).toBeGreaterThan(tier0.length);
    expect(tier1.every((m) => m.minTier <= 1)).toBe(true);
    expect(tier4.length).toBe(VERIFIED_MODELS.length);
  });

  it('groups the models of a tier by provider', () => {
    const grouped = getModelsForTierByProvider(0);
    expect(grouped.radox.length + grouped.inkstone.length).toBe(
      getModelsForTier(0).length
    );
  });

  it('never falls back to a model of a higher tier', () => {
    // A fallback must not unlock a model the account may not use.
    for (const model of VERIFIED_MODELS) {
      const fallback = getFallbackForModel(model);
      if (!fallback) continue;
      const target = getModelById(fallback.targetModelId, fallback.targetProvider);
      if (!target) continue; // a model of the provider itself
      expect(target.minTier).toBeLessThanOrEqual(model.minTier);
    }
  });
});
