import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET, POST, DELETE } from './route';
import { GET as GET_PUBLIC } from './[token]/route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: any, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/share', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);
  });

  it('creates a share link', async () => {
    const res = await POST(buildRequest({ conversationId: 'conv-1' }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.share.token).toHaveLength(48);
    expect(data.share.conversationId).toBe('conv-1');
  });

  it('rejects a payload without a conversation id', async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns the existing share of a conversation', async () => {
    const created = await (await POST(buildRequest({ conversationId: 'conv-2' }))).json();

    const req = new NextRequest('http://localhost/api/share?conversationId=conv-2', {
      method: 'GET',
    });
    const data = await (await GET(req)).json();
    expect(data.share.token).toBe(created.share.token);
  });

  it('revokes a share', async () => {
    await POST(buildRequest({ conversationId: 'conv-3' }));

    const req = new NextRequest('http://localhost/api/share?conversationId=conv-3', {
      method: 'DELETE',
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});

describe('/api/share/[token] (public)', () => {
  it('answers 404 for an unknown token', async () => {
    const res = await GET_PUBLIC(new NextRequest('http://localhost/api/share/unknown'), {
      params: { token: 'unknown' },
    });
    expect(res.status).toBe(404);
  });

  it('answers 400 for an empty token', async () => {
    const res = await GET_PUBLIC(new NextRequest('http://localhost/api/share/'), {
      params: { token: '' },
    });
    expect(res.status).toBe(400);
  });
});
