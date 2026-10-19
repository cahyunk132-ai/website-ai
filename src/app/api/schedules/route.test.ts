import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

vi.mock('@/lib/ai/router', () => ({
  defaultRouter: {
    completeChat: async () => ({
      text: 'hasil jadwal',
      model: 'test-model',
      provider: 'radox',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
  },
}));

import { GET, POST, PATCH, DELETE } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: any, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/schedules', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);
  });

  it('creates a schedule', async () => {
    const res = await POST(
      buildRequest({
        name: 'Ringkasan harian',
        prompt: 'Ringkas berita',
        model: 'gpt-5.6-luna',
        cron: '0 9 * * *',
      })
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.schedule.name).toBe('Ringkasan harian');
    expect(data.schedule.cron).toBe('0 9 * * *');
  });

  it('rejects a schedule without a prompt', async () => {
    const res = await POST(buildRequest({ name: 'x', model: 'm', cron: '0 9 * * *' }));
    expect(res.status).toBe(400);
  });

  it('lists the schedules with the next run', async () => {
    await POST(
      buildRequest({
        name: 'Jadwal A',
        prompt: 'p',
        model: 'gpt-5.6-luna',
        cron: '0 9 * * *',
      })
    );

    const data = await (await GET(buildRequest(undefined, 'GET'))).json();
    expect(data.schedules.length).toBeGreaterThan(0);
    expect(data.schedules[0].nextRunAt).toBeTruthy();
  });

  it('toggles a schedule', async () => {
    const created = await (
      await POST(
        buildRequest({
          name: 'Jadwal B',
          prompt: 'p',
          model: 'gpt-5.6-luna',
          cron: '0 9 * * *',
        })
      )
    ).json();

    const res = await PATCH(buildRequest({ id: created.schedule.id, enabled: false }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.schedule.enabled).toBe(false);
  });

  it('deletes a schedule', async () => {
    const created = await (
      await POST(
        buildRequest({
          name: 'Jadwal C',
          prompt: 'p',
          model: 'gpt-5.6-luna',
          cron: '0 9 * * *',
        })
      )
    ).json();

    const req = new NextRequest(
      `http://localhost/api/schedules?id=${encodeURIComponent(created.schedule.id)}`,
      { method: 'DELETE' }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
