import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test of the chat endpoint: it checks that the agent mode really
 * streams the step timeline, the tool outputs and the loaded skills.
 */

const scriptedAnswers: string[] = [];

/** Mutable state for the plan and the quota of the account under test. */
const quotaState = vi.hoisted(() => ({
  plan: 'free' as 'free' | 'premium',
  allowed: true,
  remaining: 4,
  limit: 20,
  /** The role of the account, the tier is derived from it. */
  role: 'free' as string,
}));

/** The options of the last call to the router (used to check the limits). */
const routerCalls = vi.hoisted(() => [] as any[]);

vi.mock('@/lib/ai/router', () => ({
  defaultRouter: {
    streamChat: async (options: any, onChunk: (chunk: any) => void) => {
      routerCalls.push(options);
      const text = scriptedAnswers.shift() ?? '';
      onChunk({ text, done: false });
      onChunk({
        text: '',
        done: true,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19 },
      });
      return {
        text,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19 },
      };
    },
  },
}));

/** The answer of the mocked live web search. */
const searchState = vi.hoisted(() => ({
  results: [] as any[],
  summary: 'Live web results for "test".',
  provider: 'brave',
  recency: false,
}));

vi.mock('@/lib/ai/tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/tools')>();
  return {
    ...actual,
    executeWebSearch: vi.fn(async () => ({
      results: searchState.results,
      summary: searchState.summary,
      provider: searchState.provider,
      recency: searchState.recency,
    })),
  };
});

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/storage', () => ({
  saveMessage: vi.fn(async () => undefined),
  createConversation: async (title: string) => ({ id: 'conv-1', title }),
  checkAndIncrementUsage: async () => ({
    allowed: quotaState.allowed,
    remaining: quotaState.remaining,
    limit: quotaState.limit,
    requestCount: 1,
    tokensUsed: 0,
    date: '2026-10-19',
  }),
  recordUsageRole: async () => undefined,
}));

vi.mock('@/lib/roles', () => ({
  getEffectiveRole: vi.fn(async () => quotaState.role),
  clearRoleCache: vi.fn(),
}));

vi.mock('@/lib/plans', () => ({
  getUserPlan: async () => quotaState.plan,
  planFor: (id: string) => ({
    id,
    label: id === 'premium' ? 'Premium' : 'Gratis',
    dailyPromptLimit: id === 'premium' ? 50 : 5,
  }),
  dailyLimitFor: (id: string) => (id === 'premium' ? 50 : 5),
  isPremiumPlan: (id: string) => id === 'premium',
}));

vi.mock('@/lib/skills/registry', () => ({
  getSkillCatalog: async () => [
    {
      slug: 'code-review',
      name: 'Code Review',
      description: 'Review a change for defects.',
      category: 'engineering',
      icon: 'shield',
      kind: 'system',
      isPinned: false,
    },
  ],
  loadPinnedSkills: async () => [],
  loadSkillContent: async (slug: string) => ({
    slug,
    name: 'Code Review',
    description: 'Review a change for defects.',
    category: 'engineering',
    content: 'FULL CODE REVIEW BODY',
    source: 'catalog',
  }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function buildRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
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
      // A bare "data:" line belongs to no named event.
      current = 'message';
    }
  }

  return events;
}

describe('POST /api/chat (agent mode)', () => {
  beforeEach(() => {
    scriptedAnswers.length = 0;
    quotaState.plan = 'free';
    quotaState.allowed = true;
    quotaState.remaining = 4;
    quotaState.limit = 20;
    quotaState.role = 'free';
    routerCalls.length = 0;
    searchState.results = [];
    searchState.summary = 'Live web results for "test".';
    searchState.provider = 'brave';
    searchState.recency = false;
  });

  it('rejects an unauthenticated request', async () => {
    const authMod = await import('@/lib/auth');
    (authMod.getSessionFromRequest as any).mockResolvedValueOnce(null);

    const res = await POST(buildRequest({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await POST(buildRequest({ messages: [], model: '' }));
    expect(res.status).toBe(400);
  });

  it('streams the agent timeline, the tool output and the final answer', async () => {
    scriptedAnswers.push(
      '<thought>Saya perlu menghitung.</thought>\n<agent_action tool="calculator">21 * 2</agent_action>'
    );
    scriptedAnswers.push('Hasilnya 42.');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: '21 * 2 ?' }],
        model: 'test-model',
        mode: 'agent',
      })
    );

    expect(res.status).toBe(200);
    const events = await readEvents(res);
    const names = events.map((e) => e.event);

    expect(names).toContain('conversation');
    expect(names).toContain('agent_step_start');
    expect(names).toContain('tool_output');
    expect(names).toContain('agent_step');
    expect(names).toContain('done');

    const toolEvent = events.find((e) => e.event === 'tool_output')!;
    expect(toolEvent.data.tool).toBe('calculator');
    expect(toolEvent.data.success).toBe(true);
    expect(toolEvent.data.output).toBe('21 * 2 = 42');

    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.steps).toBe(2);
    expect(done.data.usage.totalTokens).toBe(38);
  });

  it('creates and streams a real PDF download from ordinary chat and saves the attachment', async () => {
    scriptedAnswers.push('<agent_action tool="write_file">{"path":"NIM_Nama_KeamananKomunikasiDigital.pdf","content":"Panduan keamanan komunikasi digital"}</agent_action>');
    scriptedAnswers.push('File PDF tersedia melalui tombol Unduh.');
    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'Buatkan file PDF panduan keamanan komunikasi digital' }],
      model: 'test-model', mode: 'chat',
    }));
    const events = await readEvents(res);
    const artifact = events.find((event) => event.event === 'artifact')?.data;
    expect(artifact.name).toBe('NIM_Nama_KeamananKomunikasiDigital.pdf');
    expect(Buffer.from(artifact.url.split(',')[1], 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(events.find((event) => event.event === 'tool_output')?.data.success).toBe(true);
    const { saveMessage } = await import('@/lib/storage');
    expect(saveMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      role: 'assistant', attachments: [artifact],
    }), 'user-1');
    expect(routerCalls[0].messages.some((message: any) => message.role === 'system' && message.content.includes('write_file'))).toBe(true);
  });

  it('never emits a download artifact for a failed file operation', async () => {
    scriptedAnswers.push('<agent_action tool="write_file">{"path":"../guide.pdf","content":"test"}</agent_action>');
    scriptedAnswers.push('Nama file tidak valid.');
    const res = await POST(buildRequest({
      messages: [{ role: 'user', content: 'Buatkan file PDF' }], model: 'test-model', mode: 'chat',
    }));
    const events = await readEvents(res);
    expect(events.some((event) => event.event === 'artifact')).toBe(false);
    expect(events.find((event) => event.event === 'tool_output')?.data.success).toBe(false);
  });

  it('publishes and saves a clean authoritative final answer rather than process text', async () => {
    scriptedAnswers.push('<thought>Rencana awal.</thought>', '<thought>Susun hasil.</thought>\n# Kerangka LMS\nBeranda, kursus, dan dashboard.');
    const res = await POST(buildRequest({ messages: [{ role: 'user', content: 'Buat kerangka website LMS' }], model: 'test-model', mode: 'agent' }));
    const events = await readEvents(res);
    const final = events.find((event) => event.event === 'agent_final');
    expect(final?.data.content).toBe('# Kerangka LMS\nBeranda, kursus, dan dashboard.');
    const { saveMessage } = await import('@/lib/storage');
    expect(saveMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ role: 'assistant', content: final!.data.content }), 'user-1');
    expect(events.find((event) => event.event === 'done')).toBeDefined();
  });

  it('emits a skill_loaded event when the agent loads a skill', async () => {
    scriptedAnswers.push('<skill_use skill="code-review" />');
    scriptedAnswers.push('Review selesai.');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'review kode ini' }],
        model: 'test-model',
        mode: 'agent',
      })
    );

    const events = await readEvents(res);
    const skillEvent = events.find((e) => e.event === 'skill_loaded');

    expect(skillEvent).toBeTruthy();
    expect(skillEvent!.data.skill).toBe('code-review');

    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.activatedSkills).toEqual([{ slug: 'code-review', name: 'Code Review' }]);
  });

  it('enforces the free tier quota of twenty requests per day', async () => {
    quotaState.plan = 'free';
    quotaState.role = 'free';
    quotaState.limit = 20;
    quotaState.allowed = false;
    quotaState.remaining = 0;

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'test-model',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(res.headers.get('X-Plan')).toBe('free');
    expect(res.headers.get('X-Tier')).toBe('0');

    const data = await res.json();
    expect(data.code).toBe('PLAN_LIMIT_REACHED');
    expect(data.plan).toBe('free');
    expect(data.limit).toBe(20);
    expect(data.remaining).toBe(0);
    expect(data.upgradeAvailable).toBe(true);
    expect(data.role).toBe('free');
    expect(data.tier).toBe(0);
    expect(data.error).toContain('20 request');
    expect(data.error).toContain('Free');
  });

  it('enforces the bigger premium tier quota', async () => {
    quotaState.plan = 'premium';
    quotaState.role = 'premium2';
    quotaState.limit = 200;
    quotaState.allowed = false;
    quotaState.remaining = 0;

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'test-model',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('200');
    expect(res.headers.get('X-Plan')).toBe('premium');
    expect(res.headers.get('X-Tier')).toBe('2');

    const data = await res.json();
    expect(data.code).toBe('PLAN_LIMIT_REACHED');
    expect(data.plan).toBe('premium');
    expect(data.limit).toBe(200);
    expect(data.role).toBe('premium2');
    expect(data.tier).toBe(2);
    // A premium account cannot upgrade any further.
    expect(data.upgradeAvailable).toBe(false);
  });

  it('reports the plan and the remaining quota in the response headers', async () => {
    scriptedAnswers.push('Halo!');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'test-model',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Plan')).toBe('free');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
    expect(res.headers.get('X-Role')).toBe('free');
    expect(res.headers.get('X-Tier')).toBe('0');
  });

  it('keeps the plain chat mode working', async () => {
    scriptedAnswers.push('Halo, apa kabar?');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'test-model',
        mode: 'chat',
      })
    );

    const events = await readEvents(res);
    const text = events
      .filter((e) => e.event === 'message')
      .map((e) => e.data.text)
      .join('');

    expect(text).toContain('Halo, apa kabar?');
    expect(events.map((e) => e.event)).not.toContain('agent_step_start');
  });
  it('refuses a model of a higher tier', async () => {
    quotaState.role = 'free';

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'claude-opus-5.5',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.code).toBe('MODEL_TIER_REQUIRED');
    expect(data.upgradeRequired).toBe(true);
    expect(data.requiredTier).toBe(4);
    expect(data.requiredLabel).toBe('Premium 4');
    expect(data.role).toBe('free');
    expect(data.error).toContain('Premium 4');
  });

  it('lets a premium account use the model of its tier', async () => {
    quotaState.role = 'premium4';
    scriptedAnswers.push('Halo!');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'claude-opus-5.5',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(200);
  });

  it('gives the administrator access to every model', async () => {
    quotaState.role = 'admin';
    scriptedAnswers.push('Halo!');

    const res = await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'claude-opus-5.5',
        mode: 'chat',
      })
    );

    expect(res.status).toBe(200);
  });

  it('limits the answer length to the tier of the account', async () => {
    quotaState.role = 'free';
    scriptedAnswers.push('Halo!');

    await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'halo' }],
        model: 'gemma-2-2b',
        maxTokens: 32000,
        mode: 'chat',
      })
    );

    // The free tier allows 2048 output tokens.
    expect(routerCalls.at(-1)?.maxTokens).toBe(2048);
    expect(routerCalls.at(-1)?.maxTier).toBe(0);
  });

  it('limits the history to the tier of the account', async () => {
    quotaState.role = 'free';
    scriptedAnswers.push('Halo!');

    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `pesan ${i}`,
    }));

    await POST(
      buildRequest({
        messages: history,
        model: 'gemma-2-2b',
        mode: 'chat',
      })
    );

    // The free tier sends the last 10 messages of the history.
    expect(routerCalls.at(-1)?.messages).toHaveLength(10);
  });

  it('grounds the answer in the live search results', async () => {
    quotaState.role = 'premium3';
    scriptedAnswers.push('Menurut sumber [1], jawabannya adalah 42.');
    searchState.results = [
      {
        title: 'Berita terbaru',
        url: 'https://berita.example.com/1',
        snippet: 'Ringkasan berita.',
        publishedDate: '2026-10-19',
        provider: 'Brave Search',
      },
    ];
    searchState.summary =
      '[1] Berita terbaru\nSource: https://berita.example.com/1\nPublished: 2026-10-19\nRingkasan berita.';
    searchState.recency = true;

    await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'gubernur kaltim sekarang' }],
        model: 'gemma-2-2b',
        webSearch: true,
      })
    );

    const call = routerCalls.at(-1);
    const prompt = String(call.messages[call.messages.length - 1].content);

    // The results are injected and the model is told to cite them.
    expect(prompt).toContain('LIVE WEB SEARCH RESULTS');
    expect(prompt).toContain('[1] Berita terbaru');
    expect(prompt).toContain('Published: 2026-10-19');
    expect(prompt).toContain('cite them as [1]');
    expect(prompt).toContain('Today is');
    // The query itself is still part of the prompt.
    expect(prompt).toContain('gubernur kaltim sekarang');
  });

  it('warns the model when the live search found nothing', async () => {
    quotaState.role = 'premium3';
    scriptedAnswers.push('Jawaban dari pengetahuan umum.');
    searchState.results = [];
    searchState.summary = 'No live search results found for query: "test".';

    await POST(
      buildRequest({
        messages: [{ role: 'user', content: 'gubernur kaltim sekarang' }],
        model: 'gemma-2-2b',
        webSearch: true,
      })
    );

    const call = routerCalls.at(-1);
    const prompt = String(call.messages[call.messages.length - 1].content);

    expect(prompt).toContain('NO RESULTS FOUND');
    expect(prompt).toContain('may be outdated');
  });

  it('keeps the whole history for a premium tier', async () => {
    quotaState.role = 'premium3';
    scriptedAnswers.push('Halo!');

    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `pesan ${i}`,
    }));

    await POST(
      buildRequest({
        messages: history,
        model: 'gemma-2-2b',
        mode: 'chat',
      })
    );

    expect(routerCalls.at(-1)?.messages).toHaveLength(15);
    expect(routerCalls.at(-1)?.maxTokens).toBe(16000);
    expect(routerCalls.at(-1)?.maxTier).toBe(3);
  });
});
