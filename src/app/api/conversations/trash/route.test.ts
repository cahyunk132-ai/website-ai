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

describe('/api/conversations/trash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/conversations/trash'));
    expect(res.status).toBe(401);
  });

  it('lists the trashed conversations', async () => {
    const res = await GET(new NextRequest('http://localhost/api/conversations/trash'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.conversations)).toBe(true);
  });

  it('restores a conversation', async () => {
    const request = new NextRequest('http://localhost/api/conversations/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'conv-42' }),
    });

    const res = await POST(request);
    // The conversation does not exist, the API must say so.
    expect(res.status).toBe(404);
  });

  it('requires an id to restore a conversation', async () => {
    const request = new NextRequest('http://localhost/api/conversations/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });
});
