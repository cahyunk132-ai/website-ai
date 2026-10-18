import { describe, it, expect } from 'vitest';
import { estimateTokens, calculateCost, recordRequestUsage, getAllProviderStats } from './usage';

describe('Usage and Token Telemetry', () => {
  it('estimates tokens for English text', () => {
    const text = 'Hello world, this is a test prompt for Hyunk AI Hub.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(30);
  });

  it('estimates tokens for mixed CJK text', () => {
    const text = '上海人工智能实验室 (Shanghai AI Lab)';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(10);
  });

  it('calculates cost according to model catalog pricing', () => {
    // claude-opus-4.8: input 15.0 / M, output 75.0 / M
    const cost = calculateCost('claude-opus-4.8', 1000, 1000);
    // (1000 / 1e6)*15 + (1000 / 1e6)*75 = 0.015 + 0.075 = 0.090
    expect(cost).toBe(0.09);
  });

  it('records request usage and updates telemetry stats', () => {
    recordRequestUsage({
      provider: 'radox',
      modelId: 'claude-opus-4.8',
      promptTokens: 500,
      completionTokens: 200,
      isOfficialReport: true,
    });

    const stats = getAllProviderStats();
    expect(stats.radox.totalRequests).toBeGreaterThan(0);
    expect(stats.radox.tokens.prompt).toBeGreaterThanOrEqual(500);
    expect(stats.radox.tokens.completion).toBeGreaterThanOrEqual(200);
    expect(stats.radox.quotaSource).toBe('provider_reported');
  });
});
