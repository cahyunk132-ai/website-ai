import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

describe('/api/usage/daily', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/usage/daily'));
    expect(res.status).toBe(401);
  });

  it('returns seven points by default', async () => {
    const res = await GET(new NextRequest('http://localhost/api/usage/daily'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.points).toHaveLength(7);
    expect(data.points[0].date < data.points[6].date).toBe(true);
  });

  it('honours the days parameter', async () => {
    const res = await GET(new NextRequest('http://localhost/api/usage/daily?days=30'));
    const data = await res.json();
    expect(data.points).toHaveLength(30);
  });

  it('falls back to seven days for an invalid parameter', async () => {
    const res = await GET(new NextRequest('http://localhost/api/usage/daily?days=abc'));
    const data = await res.json();
    expect(data.points).toHaveLength(7);
  });
});
