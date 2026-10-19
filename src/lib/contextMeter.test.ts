import { describe, it, expect } from 'vitest';
import { computeContextUsage, formatTokenCount, DEFAULT_CONTEXT_WINDOW } from './contextMeter';

describe('context meter', () => {
  it('reports an empty conversation as almost free', () => {
    const usage = computeContextUsage([], DEFAULT_CONTEXT_WINDOW);
    expect(usage.used).toBeGreaterThan(0);
    expect(usage.used).toBeLessThan(2000);
    expect(usage.percent).toBeLessThan(5);
    expect(usage.warning).toBe(false);
    expect(usage.overflow).toBe(false);
  });

  it('grows with the conversation', () => {
    const small = computeContextUsage([{ role: 'user', content: 'halo' }]);
    const big = computeContextUsage([
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'lorem ipsum dolor '.repeat(300) },
    ]);
    expect(big.used).toBeGreaterThan(small.used);
  });

  it('warns when the window is almost full', () => {
    const usage = computeContextUsage(
      [{ role: 'user', content: 'lorem ipsum dolor '.repeat(30000) }],
      128000
    );
    expect(usage.percent).toBeGreaterThanOrEqual(80);
    expect(usage.warning).toBe(true);
  });

  it('detects an overflow', () => {
    const usage = computeContextUsage(
      [{ role: 'user', content: 'lorem ipsum dolor '.repeat(30000) }],
      32000
    );
    expect(usage.overflow).toBe(true);
    expect(usage.percent).toBe(100);
  });

  it('takes the system prompt into account', () => {
    const without = computeContextUsage([{ role: 'user', content: 'halo' }]);
    const withPrompt = computeContextUsage(
      [{ role: 'user', content: 'halo' }],
      DEFAULT_CONTEXT_WINDOW,
      'you are a very long system prompt '.repeat(50)
    );
    expect(withPrompt.used).toBeGreaterThan(without.used);
  });

  it('never exceeds 100 percent', () => {
    const usage = computeContextUsage([{ role: 'user', content: 'lorem ipsum dolor '.repeat(80000) }], 1000);
    expect(usage.percent).toBe(100);
  });
});

describe('token formatting', () => {
  it('formats the counts compactly', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(128000)).toBe('128k');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
  });
});
