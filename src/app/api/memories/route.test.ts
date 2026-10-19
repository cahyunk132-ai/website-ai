import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET, POST, PATCH, DELETE } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: any, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/memories', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/memories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);
  });

  it('creates a memory', async () => {
    const res = await POST(buildRequest({ content: 'nama saya Cahyunk', category: 'identity' }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.memory.content).toBe('nama saya Cahyunk');
    expect(data.memory.category).toBe('identity');
  });

  it('rejects an empty memory', async () => {
    const res = await POST(buildRequest({ content: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid source', async () => {
    const res = await POST(buildRequest({ content: 'x', source: 'hacked' }));
    expect(res.status).toBe(400);
  });

  it('lists the memories', async () => {
    await POST(buildRequest({ content: 'suka kopi' }));
    const res = await GET(buildRequest(undefined, 'GET'));
    const data = await res.json();
    expect(Array.isArray(data.memories)).toBe(true);
    expect(data.memories.some((m: any) => m.content === 'suka kopi')).toBe(true);
  });

  it('disables a memory', async () => {
    const created = await (await POST(buildRequest({ content: 'suka teh' }))).json();
    const res = await PATCH(buildRequest({ id: created.memory.id, enabled: false }));
    expect(res.status).toBe(200);

    const list = await (await GET(buildRequest(undefined, 'GET'))).json();
    const found = list.memories.find((m: any) => m.id === created.memory.id);
    expect(found.enabled).toBe(false);
  });

  it('deletes a memory', async () => {
    const created = await (await POST(buildRequest({ content: 'suka matcha' }))).json();
    const req = new NextRequest(
      `http://localhost/api/memories?id=${encodeURIComponent(created.memory.id)}`,
      { method: 'DELETE' }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });

  it('requires an id to delete a memory', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/memories', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});
