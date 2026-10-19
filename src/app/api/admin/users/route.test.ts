import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests of the admin API that manages the role of the users.
 */

const mockState = vi.hoisted(() => ({
  /** The role of the account that sends the request. */
  role: 'admin' as string | null,
  /** The role that was written last. */
  savedRole: null as string | null,
  // The shape of the Supabase auth admin API.
  users: [
    {
      id: 'u-1',
      email: 'admin@hyunkai.com',
      user_metadata: { name: 'Admin Hyunk', role: 'admin' },
      created_at: '2026-10-18T00:00:00.000Z',
    },
    {
      id: 'u-2',
      email: 'demo@hyunkai.com',
      user_metadata: { name: 'Demo User', role: 'free' },
      created_at: '2026-10-19T00:00:00.000Z',
    },
  ],
}));

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () =>
    mockState.role
      ? { id: 'u-1', email: 'admin@hyunkai.com', role: mockState.role }
      : null
  ),
  listLocalUsers: vi.fn(() => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: mockState.users }, error: null }),
      },
    },
    from: (table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            // The demo account has a manual override.
            then: (resolve: any) =>
              resolve({ data: [{ user_id: 'u-2', role: 'premium3' }], error: null }),
          }),
        };
      }
      return {
        select: () => ({
          data: [],
          then: (resolve: any) => resolve({ data: [], error: null }),
        }),
      };
    },
  }),
  createServerSupabaseClient: () => null,
}));

vi.mock('@/lib/storage', () => ({
  getUsageCountsForUsers: vi.fn(async (ids: string[]) => {
    const result: Record<string, number> = {};
    for (const id of ids) result[id] = id === 'u-2' ? 7 : 0;
    return result;
  }),
}));

vi.mock('@/lib/roles', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getEffectiveRole: vi.fn(async () => mockState.role ?? 'free'),
    setUserRole: vi.fn(async (_id: string, role: string) => {
      mockState.savedRole = role;
      return role;
    }),
    clearUserRole: vi.fn(async () => {
      mockState.savedRole = null;
    }),
  };
});

import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';

function buildRequest(body?: unknown, method = 'GET'): NextRequest {
  return new NextRequest('http://localhost/api/admin/users', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/admin/users', () => {
  beforeEach(() => {
    mockState.role = 'admin';
    mockState.savedRole = null;
  });

  it('rejects an unauthenticated request', async () => {
    mockState.role = null;
    expect((await GET(buildRequest())).status).toBe(401);
  });

  it('forbids a normal user', async () => {
    mockState.role = 'free';
    const res = await GET(buildRequest());
    expect(res.status).toBe(403);
  });

  it('lists the users with their role, tier and usage', async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.users).toHaveLength(2);

    const demo = data.users.find((u: any) => u.email === 'demo@hyunkai.com');
    expect(demo.role).toBe('premium3');
    expect(demo.tier).toBe(3);
    expect(demo.usedToday).toBe(7);
    expect(demo.manual).toBe(true);

    const admin = data.users.find((u: any) => u.email === 'admin@hyunkai.com');
    expect(admin.role).toBe('admin');
    expect(admin.tier).toBe(4);

    // The catalogue of the roles is sent for the dropdown.
    expect(data.roles.map((r: any) => r.id)).toContain('premium4');
    expect(data.roles.find((r: any) => r.id === 'admin').unlimited).toBe(true);
  });

  it('lets an admin change the role of a user', async () => {
    const res = await PATCH(
      buildRequest({ userId: 'u-2', role: 'premium4' }, 'PATCH')
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.role).toBe('premium4');
    expect(data.tier).toBe(4);
    expect(data.manual).toBe(true);
    expect(mockState.savedRole).toBe('premium4');
  });

  it('rejects an invalid role', async () => {
    const res = await PATCH(
      buildRequest({ userId: 'u-2', role: 'gold' }, 'PATCH')
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unknown user', async () => {
    const res = await PATCH(
      buildRequest({ email: 'nobody@hyunkai.com', role: 'premium1' }, 'PATCH')
    );
    expect(res.status).toBe(404);
  });

  it('resets a manual override', async () => {
    const res = await PATCH(buildRequest({ userId: 'u-2', reset: true }, 'PATCH'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.manual).toBe(false);
    expect(mockState.savedRole).toBeNull();
  });

  it('forbids a normal user to change a role', async () => {
    mockState.role = 'premium1';
    const res = await PATCH(
      buildRequest({ userId: 'u-2', role: 'premium4' }, 'PATCH')
    );
    expect(res.status).toBe(403);
  });
});
