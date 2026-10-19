import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLANS,
  FREE_DAILY_PROMPT_LIMIT,
  PREMIUM_DAILY_PROMPT_LIMIT,
  PREMIUM_PROMPT_MULTIPLIER,
  planFor,
  isPremiumPlan,
  dailyLimitFor,
  isPlanId,
  nextResetAt,
  getPlanSnapshot,
  clearPlanCache,
} from './plans';

describe('plan definitions', () => {
  it('gives a free account five prompts per day', () => {
    expect(FREE_DAILY_PROMPT_LIMIT).toBe(20);
    expect(PLANS.free.dailyPromptLimit).toBe(20);
  });

  it('gives a premium account ten times the free quota', () => {
    expect(PREMIUM_PROMPT_MULTIPLIER).toBe(10);
    expect(PREMIUM_DAILY_PROMPT_LIMIT).toBe(200);
    expect(PLANS.premium.dailyPromptLimit).toBe(
      FREE_DAILY_PROMPT_LIMIT * PREMIUM_PROMPT_MULTIPLIER
    );
  });

  it('resolves the limit of a plan', () => {
    expect(dailyLimitFor('free')).toBe(20);
    expect(dailyLimitFor('premium')).toBe(200);
  });

  it('falls back to the free plan for an unknown value', () => {
    expect(planFor('gold').id).toBe('free');
    expect(planFor(null).id).toBe('free');
    expect(planFor(undefined).dailyPromptLimit).toBe(20);
    expect(dailyLimitFor('whatever')).toBe(20);
  });

  it('knows which plan is premium', () => {
    expect(isPremiumPlan('premium')).toBe(true);
    expect(isPremiumPlan('free')).toBe(false);
    expect(isPremiumPlan(null)).toBe(false);
  });

  it('validates the plan id', () => {
    expect(isPlanId('free')).toBe(true);
    expect(isPlanId('premium')).toBe(true);
    expect(isPlanId('gold')).toBe(false);
    expect(isPlanId(null)).toBe(false);
  });

  it('resets the quota at midnight utc', () => {
    const reset = new Date(nextResetAt());
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
    expect(reset.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('plan snapshot', () => {
  beforeEach(() => {
    clearPlanCache();
  });

  it('reports the free quota when no plan is stored', async () => {
    const snapshot = await getPlanSnapshot('user-without-plan', 2);
    expect(snapshot.plan).toBe('free');
    expect(snapshot.dailyPromptLimit).toBe(20);
    expect(snapshot.used).toBe(2);
    expect(snapshot.remaining).toBe(18);
    expect(snapshot.premium).toBe(false);
  });

  it('resolves the daily limit of an account from its plan', async () => {
    const { resolveDailyLimit } = await import('./plans');
    expect(await resolveDailyLimit('user-without-plan')).toBe(20);
  });

  it('never reports a negative remainder', async () => {
    const snapshot = await getPlanSnapshot('user-over-quota', 99);
    expect(snapshot.remaining).toBe(0);
  });
});
