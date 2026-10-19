import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The feature storage is tested with the in-memory fallback (no Supabase),
 * which is exactly the code path used during local development.
 */
vi.mock('./supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import {
  listMemories,
  createMemory,
  deleteMemory,
  setMemoryEnabled,
  buildMemoryPrompt,
  listPrompts,
  createPrompt,
  deletePrompt,
  createShare,
  revokeShare,
  getShareByConversation,
  saveFeedback,
  listFeedback,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getDailyUsage,
  recordDailyUsage,
} from './featureStorage';

describe('AI memory storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and lists a memory', async () => {
    const created = await createMemory('nama saya Cahyunk', { userId: 'user-1' });
    expect(created.content).toBe('nama saya Cahyunk');
    expect(created.enabled).toBe(true);
    expect(created.source).toBe('manual');

    const memories = await listMemories('user-1');
    expect(memories.some((m) => m.id === created.id)).toBe(true);
  });

  it('deletes a memory', async () => {
    const created = await createMemory('suka kopi', { userId: 'user-1' });
    expect(await deleteMemory(created.id)).toBe(true);
    expect(await deleteMemory(created.id)).toBe(false);
  });

  it('disables a memory without deleting it', async () => {
    const created = await createMemory('suka teh', { userId: 'user-1' });
    expect(await setMemoryEnabled(created.id, false)).toBe(true);

    const memories = await listMemories('user-1');
    const found = memories.find((m) => m.id === created.id);
    expect(found?.enabled).toBe(false);
  });

  it('builds the prompt block from the active memories', () => {
    const prompt = buildMemoryPrompt([
      {
        id: '1',
        content: 'nama saya Cahyunk',
        category: 'identity',
        source: 'manual',
        enabled: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: '2',
        content: 'suka kopi',
        category: 'preference',
        source: 'manual',
        enabled: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]);

    expect(prompt).toContain('nama saya Cahyunk');
    expect(prompt).not.toContain('suka kopi');
  });

  it('returns an empty prompt when nothing is active', () => {
    expect(buildMemoryPrompt([])).toBe('');
  });
});

describe('prompt library storage', () => {
  it('creates, lists and deletes a template', async () => {
    const created = await createPrompt('Ringkas', 'Ringkas dalam 3 poin', { userId: 'user-1' });
    expect(created.title).toBe('Ringkas');

    const prompts = await listPrompts('user-1');
    expect(prompts.some((p) => p.id === created.id)).toBe(true);

    expect(await deletePrompt(created.id)).toBe(true);
    expect(await deletePrompt(created.id)).toBe(false);
  });
});

describe('public shares', () => {
  it('creates a share and finds it again', async () => {
    const share = await createShare('conv-1', { userId: 'user-1' });
    expect(share.token).toHaveLength(48);
    expect(share.enabled).toBe(true);

    const found = await getShareByConversation('conv-1');
    expect(found?.token).toBe(share.token);
  });

  it('revokes a share', async () => {
    await createShare('conv-2', { userId: 'user-1' });
    expect(await revokeShare('conv-2')).toBe(true);
    expect(await getShareByConversation('conv-2')).toBeNull();
  });
});

describe('message feedback', () => {
  it('stores and replaces the rating of a message', async () => {
    await saveFeedback({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      rating: 'up',
      userId: 'user-1',
    });
    await saveFeedback({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      rating: 'down',
      userId: 'user-1',
    });

    const feedback = await listFeedback('conv-1');
    expect(feedback).toHaveLength(1);
    expect(feedback[0].rating).toBe('down');
  });

  it('keeps the feedback of the conversations apart', async () => {
    await saveFeedback({
      messageId: 'msg-2',
      conversationId: 'conv-2',
      rating: 'up',
      userId: 'user-1',
    });
    expect(await listFeedback('conv-3')).toHaveLength(0);
    expect(await listFeedback('conv-2')).toHaveLength(1);
  });
});

describe('scheduled runs', () => {
  it('creates, updates and deletes a schedule', async () => {
    const schedule = await createSchedule({
      name: 'Ringkasan harian',
      prompt: 'Ringkas berita terbaru',
      model: 'gpt-5.6-luna',
      cron: '0 9 * * *',
      userId: 'user-1',
    });

    expect(schedule.enabled).toBe(true);
    expect((await listSchedules('user-1')).some((s) => s.id === schedule.id)).toBe(true);

    const updated = await updateSchedule(schedule.id, { enabled: false, lastRunAt: '2026-01-01' });
    expect(updated?.enabled).toBe(false);
    expect(updated?.lastRunAt).toBe('2026-01-01');

    expect(await deleteSchedule(schedule.id)).toBe(true);
    expect(await deleteSchedule(schedule.id)).toBe(false);
  });
});

describe('daily usage', () => {
  it('returns one point per day, oldest first', async () => {
    const points = await getDailyUsage('user-3', 7);
    expect(points).toHaveLength(7);
    expect(points[0].date < points[6].date).toBe(true);
  });

  it('records the usage of the day', async () => {
    recordDailyUsage('user-4', 3, 120);
    recordDailyUsage('user-4', 2, 80);

    const points = await getDailyUsage('user-4', 1);
    expect(points[0].requests).toBe(5);
    expect(points[0].tokens).toBe(200);
  });
});
