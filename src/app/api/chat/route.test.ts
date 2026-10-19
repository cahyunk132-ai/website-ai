import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test of the chat endpoint: it checks that the agent mode really
 * streams the step timeline, the tool outputs and the loaded skills.
 */

const scriptedAnswers: string[] = [];

vi.mock('@/lib/ai/router', () => ({
  defaultRouter: {
    streamChat: async (_options: any, onChunk: (chunk: any) => void) => {
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

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/storage', () => ({
  saveMessage: async () => undefined,
  createConversation: async (title: string) => ({ id: 'conv-1', title }),
  checkAndIncrementUsage: async () => ({
    allowed: true,
    remaining: 199,
    limit: 200,
    requestCount: 1,
    tokensUsed: 0,
    date: '2026-10-19',
  }),
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
});
