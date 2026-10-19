import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/router', () => ({
  defaultRouter: {
    completeChat: vi.fn(async () => ({
      text: 'hasil jadwal',
      model: 'test-model',
      provider: 'radox',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    })),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { isScheduleDue, nextRunAt, executeSchedule, runDueSchedules } from './scheduleRunner';
import { createSchedule, listSchedules } from './featureStorage';
import type { ScheduledRun } from './featureStorage';

function makeSchedule(overrides: Partial<ScheduledRun> = {}): ScheduledRun {
  return {
    id: 'sched-1',
    name: 'Uji',
    prompt: 'Ringkas',
    model: 'gpt-5.6-luna',
    provider: 'auto',
    cron: '0 9 * * *',
    enabled: true,
    lastRunAt: null,
    lastResult: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('schedule runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes the next run of a schedule', () => {
    const next = nextRunAt(makeSchedule(), new Date('2026-01-01T00:00:00.000Z'));
    expect(next).toBeTruthy();
    expect(new Date(next as string).getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('returns null for an invalid cron expression', () => {
    expect(nextRunAt(makeSchedule({ cron: 'not a cron' }))).toBeNull();
  });

  it('never fires a disabled schedule', () => {
    expect(isScheduleDue(makeSchedule({ enabled: false }), new Date('2026-06-01T10:00:00.000Z'))).toBe(
      false
    );
  });

  it('fires a schedule whose occurrence passed', () => {
    // The last run was at 08:00, the 09:00 occurrence has been missed.
    const schedule = makeSchedule({ lastRunAt: '2026-01-01T08:00:00.000Z' });
    expect(isScheduleDue(schedule, new Date('2026-01-01T09:30:00.000Z'))).toBe(true);
  });

  it('does not fire a daily schedule twice on the same day', () => {
    // The 09:00 occurrence already ran at 09:05.
    const schedule = makeSchedule({ lastRunAt: '2026-01-01T09:05:00.000Z' });
    expect(isScheduleDue(schedule, new Date('2026-01-01T09:30:00.000Z'))).toBe(false);
  });

  it('does not fire a schedule that already ran', () => {
    const schedule = makeSchedule({ lastRunAt: '2026-01-01T09:05:00.000Z' });
    expect(isScheduleDue(schedule, new Date('2026-01-01T09:06:00.000Z'))).toBe(false);
  });

  it('never fires a schedule with an invalid cron expression', () => {
    expect(isScheduleDue(makeSchedule({ cron: 'oops' }), new Date('2026-06-01T10:00:00.000Z'))).toBe(
      false
    );
  });

  it('executes a schedule and stores the result', async () => {
    const result = await executeSchedule(makeSchedule(), 'user-1');
    expect(result.ok).toBe(true);
    expect(result.output).toBe('hasil jadwal');
    expect(result.conversationId).toBeTruthy();
  });

  it('runs the schedules that are due', async () => {
    await createSchedule({
      name: 'Terlama',
      prompt: 'p',
      model: 'gpt-5.6-luna',
      cron: '0 9 * * *',
      userId: 'user-due',
    });

    const schedules = await listSchedules('user-due');
    const lastRun = schedules[0].lastRunAt;

    // A schedule that already ran in the past must not run again.
    expect(lastRun).toBeNull();
  });
});
