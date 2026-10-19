import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET, POST } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: any, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/feedback', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);
  });

  it('stores a rating', async () => {
    const res = await POST(
      buildRequest({ messageId: 'msg-1', conversationId: 'conv-1', rating: 'up' })
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.feedback.rating).toBe('up');
  });

  it('rejects an invalid rating', async () => {
    const res = await POST(
      buildRequest({ messageId: 'msg-1', conversationId: 'conv-1', rating: 'maybe' })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a payload without a message id', async () => {
    const res = await POST(buildRequest({ conversationId: 'conv-1', rating: 'up' }));
    expect(res.status).toBe(400);
  });

  it('lists the feedback of a conversation', async () => {
    await POST(buildRequest({ messageId: 'msg-9', conversationId: 'conv-9', rating: 'down' }));

    const req = new NextRequest('http://localhost/api/feedback?conversationId=conv-9', {
      method: 'GET',
    });
    const data = await (await GET(req)).json();
    expect(data.feedback.some((f: any) => f.messageId === 'msg-9')).toBe(true);
  });
});
