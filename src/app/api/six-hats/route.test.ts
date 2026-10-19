import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test of the Six Thinking Hats endpoint: it checks the tier
 * gate, the quota of six requests, the parallel run of the five perspectives
 * and the summary of the blue hat.
 */

const quotaState = vi.hoisted(() => ({
  role: 'free' as string,
  allowed: true,
  remaining: 100,
  limit: 500,
}));

const routerCalls = vi.hoisted(() => [] as any[]);
const savedMessages = vi.hoisted(() => [] as any[]);

vi.mock('@/lib/ai/router', () => ({
  defaultRouter: {
    streamChat: async (options: any, onChunk: (chunk: any) => void) => {
      routerCalls.push(options);
      const text = `jawaban-${routerCalls.length}`;
      onChunk({ text, done: false });
      onChunk({
        text: '',
        done: true,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      return {
        text,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/storage', () => ({
  saveMessage: async (conversationId: string, message: any) => {
    savedMessages.push({ conversationId, message });
  },
  createConversation: async (title: string) => ({ id: 'conv-1', title }),
  checkAndIncrementUsage: async () => ({
    allowed: quotaState.allowed,
    remaining: quotaState.remaining,
    limit: quotaState.limit,
    requestCount: 1,
    tokensUsed: 0,
    date: '2026-10-20',
  }),
  getUsageSnapshot: async () => ({
    allowed: quotaState.remaining > 0,
    remaining: quotaState.remaining,
    limit: quotaState.limit,
    requestCount: 0,
    tokensUsed: 0,
    date: '2026-10-20',
  }),
  recordUsageRole: async () => undefined,
}));

vi.mock('@/lib/roles', () => ({
  getEffectiveRole: vi.fn(async () => quotaState.role),
  clearRoleCache: vi.fn(),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function buildRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/six-hats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readEvents(response: Response): Promise<Array<{ event: string; data: any }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: any }> = [];
  let current = 'message';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('event: ')) {
      current = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      try {
        events.push({ event: current, data: JSON.parse(line.slice(6)) });
      } catch {
        // ignore
      }
      current = 'message';
    }
  }

  return events;
}

describe('POST /api/six-hats', () => {
  beforeEach(() => {
    quotaState.role = 'premium3';
    quotaState.allowed = true;
    quotaState.remaining = 100;
    quotaState.limit = 500;
    routerCalls.length = 0;
    savedMessages.length = 0;
  });

  it('rejects an unauthenticated request', async () => {
    const authMod = await import('@/lib/auth');
    (authMod.getSessionFromRequest as any).mockResolvedValueOnce(null);

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await POST(buildRequest({ topic: '', model: '' }));
    expect(res.status).toBe(400);
  });

  it('locks the feature for an account below premium 3', async () => {
    quotaState.role = 'premium2';

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('SIX_HATS_TIER_REQUIRED');
    expect(data.upgradeRequired).toBe(true);
    expect(data.requiredTier).toBe(3);
    expect(data.requiredLabel).toBe('Premium 3');
    expect(data.error).toContain('Premium 3');
    expect(routerCalls).toHaveLength(0);
  });

  it('locks the feature for a free account', async () => {
    quotaState.role = 'free';

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SIX_HATS_TIER_REQUIRED');
  });

  it('lets premium 3, premium 4 and the administrator use the feature', async () => {
    for (const role of ['premium3', 'premium4', 'admin']) {
      quotaState.role = role;
      routerCalls.length = 0;

      const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));
      expect(res.status).toBe(200);
      // The body has to be consumed, the analysis runs while the stream is read.
      await res.text();
      expect(routerCalls).toHaveLength(6);
    }
  });

  it('refuses a model of a higher tier', async () => {
    quotaState.role = 'premium3';

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'claude-opus-5.5' }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('MODEL_TIER_REQUIRED');
    expect(routerCalls).toHaveLength(0);
  });

  it('refuses the analysis when six requests are not left', async () => {
    quotaState.role = 'premium3';
    quotaState.remaining = 2;

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('PLAN_LIMIT_REACHED');
    expect(data.required).toBe(6);
    expect(data.remaining).toBe(2);
    expect(routerCalls).toHaveLength(0);
  });

  it('runs the six hats and streams every perspective', async () => {
    const res = await POST(buildRequest({ topic: 'apakah kita harus meluncur?', model: 'gemma-2-2b' }));

    expect(res.status).toBe(200);
    const events = await readEvents(res);

    // Six AI requests: five perspectives and the summary.
    expect(routerCalls).toHaveLength(6);

    // Every hat got its own system prompt.
    const prompts = routerCalls.map((call) => call.messages[0].content);
    expect(prompts.filter((p: string) => p.includes('White Hat'))).toHaveLength(1);
    expect(prompts.filter((p: string) => p.includes('Red Hat'))).toHaveLength(1);
    expect(prompts.filter((p: string) => p.includes('Black Hat'))).toHaveLength(1);
    expect(prompts.filter((p: string) => p.includes('Yellow Hat'))).toHaveLength(1);
    expect(prompts.filter((p: string) => p.includes('Green Hat'))).toHaveLength(1);
    expect(prompts.filter((p: string) => p.includes('Blue Hat'))).toHaveLength(1);

    // The first five hats only know the topic.
    for (const call of routerCalls.slice(0, 5)) {
      expect(call.messages[1].content).toBe('apakah kita harus meluncur?');
    }

    // The blue hat receives the result of the other five.
    const blueCall = routerCalls[5];
    expect(blueCall.messages[1].content).toContain('apakah kita harus meluncur?');
    expect(blueCall.messages[1].content).toContain('White Hat');
    expect(blueCall.messages[1].content).toContain('Green Hat');

    // Every hat streams its own chunks.
    const hatIds = new Set(
      events.filter((e) => e.data.hatId).map((e) => e.data.hatId)
    );
    expect(hatIds).toEqual(new Set(['white', 'red', 'black', 'yellow', 'green', 'blue']));

    // The blue hat is flagged as the summary.
    const summary = events.find((e) => e.data.hatId === 'blue' && e.data.summary);
    expect(summary).toBeTruthy();
    expect(summary!.data.chunk).toContain('jawaban-');

    const done = events.find((e) => e.data.done);
    expect(done).toBeTruthy();
    expect(done!.data.markdown).toContain('## 🎩 Six Thinking Hats Analysis');
    expect(done!.data.markdown).toContain('**Topik:** apakah kita harus meluncur?');
  });

  it('counts one request per hat against the quota', async () => {
    const storageMod = await import('@/lib/storage');
    const spy = vi.spyOn(storageMod, 'checkAndIncrementUsage');

    const res = await POST(buildRequest({ topic: 'topik uji', model: 'gemma-2-2b' }));
    await res.text();

    expect(spy).toHaveBeenCalledTimes(6);
    spy.mockRestore();
  });

  it('stores the topic and the analysis in the conversation history', async () => {
    const res = await POST(
      buildRequest({
        topic: 'topik tersimpan',
        model: 'gemma-2-2b',
        conversationId: 'conv-9',
      })
    );
    await res.text();

    expect(savedMessages).toHaveLength(2);
    expect(savedMessages[0].conversationId).toBe('conv-9');
    expect(savedMessages[0].message.role).toBe('user');
    expect(savedMessages[0].message.content).toBe('topik tersimpan');

    expect(savedMessages[1].message.role).toBe('assistant');
    expect(savedMessages[1].message.content).toContain('## 🎩 Six Thinking Hats Analysis');
    expect(savedMessages[1].message.content).toContain('### 💙 Blue Hat');
  });

  it('creates a conversation when the client does not send one', async () => {
    const res = await POST(buildRequest({ topic: 'topik baru', model: 'gemma-2-2b' }));
    const events = await readEvents(res);

    const conversation = events.find((e) => e.event === 'conversation');
    expect(conversation).toBeTruthy();
    expect(conversation!.data.conversationId).toBe('conv-1');
  });
});
