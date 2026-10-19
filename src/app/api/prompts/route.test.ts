import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET, POST, DELETE } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: any, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/prompts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);
  });

  it('creates a template', async () => {
    const res = await POST(buildRequest({ title: 'Ringkas', content: 'Ringkas dalam 3 poin' }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.prompt.title).toBe('Ringkas');
  });

  it('rejects a template without a title', async () => {
    const res = await POST(buildRequest({ content: 'x' }));
    expect(res.status).toBe(400);
  });

  it('lists the templates', async () => {
    await POST(buildRequest({ title: 'Audit', content: 'Audit keamanan' }));
    const data = await (await GET(buildRequest(undefined, 'GET'))).json();
    expect(data.prompts.some((p: any) => p.title === 'Audit')).toBe(true);
  });

  it('deletes a template', async () => {
    const created = await (await POST(buildRequest({ title: 'Hapus', content: 'x' }))).json();
    const req = new NextRequest(
      `http://localhost/api/prompts?id=${encodeURIComponent(created.prompt.id)}`,
      { method: 'DELETE' }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
