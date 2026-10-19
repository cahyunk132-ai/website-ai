import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests of the role resolution. The database is replaced by a fake client, so
 * the priority of the three sources (override, metadata, plan) can be checked.
 */

const mockState = vi.hoisted(() => ({
  /** The auth user of the account under test. */
  authUser: null as { id: string; user_metadata?: Record<string, unknown> } | null,
  /** The rows of the `user_roles` table. */
  roleRows: [] as Array<{ user_id: string; role: string }>,
  /** The rows of the `user_plans` table. */
  planRows: [] as Array<{ user_id: string; plan: string }>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseAdminClient: () => createFakeClient(),
  createServerSupabaseClient: () => createFakeClient(),
}));

function createFakeClient() {
  const matches = (row: any, column: string, value: any) => row[column] === value;

  /** A tiny table handler for the two tables of the role system. */
  const table = (name: 'user_roles' | 'user_plans') => {
    const rows = () => (name === 'user_roles' ? mockState.roleRows : mockState.planRows);
    const setRows = (next: any[]) => {
      if (name === 'user_roles') mockState.roleRows = next;
      else mockState.planRows = next;
    };

    return {
      select: (_columns: string) => ({
        eq: (column: string, value: any) => ({
          maybeSingle: async () => ({
            data: rows().find((row) => matches(row, column, value)) ?? null,
            error: null,
          }),
        }),
      }),
      upsert: async (row: any) => {
        setRows([
          ...rows().filter((r) => r.user_id !== row.user_id),
          { user_id: row.user_id, [name === 'user_roles' ? 'role' : 'plan']: row[name === 'user_roles' ? 'role' : 'plan'] },
        ]);
        return { error: null };
      },
      delete: () => ({
        eq: async (column: string, value: any) => {
          setRows(rows().filter((row) => !matches(row, column, value)));
          return { error: null };
        },
      }),
    };
  };

  return {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user:
              mockState.authUser && mockState.authUser.id === id
                ? mockState.authUser
                : null,
          },
          error: null,
        }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
    from: (name: string) => {
      if (name === 'user_roles' || name === 'user_plans') return table(name);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };
}

import {
  getEffectiveRole,
  getEffectiveTier,
  setUserRole,
  clearUserRole,
  getRoleOverride,
  resolveRoleFromParts,
  clearRoleCache,
} from './roles';
import { setUserPlan, clearPlanCache } from './plans';

describe('role resolution', () => {
  beforeEach(() => {
    mockState.authUser = null;
    mockState.roleRows = [];
    mockState.planRows = [];
    clearRoleCache();
    clearPlanCache();
  });

  it('gives a new account the free role', async () => {
    expect(await getEffectiveRole('user-new')).toBe('free');
    expect(await getEffectiveTier('user-new')).toBe(0);
  });

  it('derives the role of a premium account from the plan', async () => {
    await setUserPlan('user-premium', 'premium');
    clearRoleCache('user-premium');

    expect(await getEffectiveRole('user-premium')).toBe('premium2');
    expect(await getEffectiveTier('user-premium')).toBe(2);
  });

  it('uses the role of the account when it was created with one', async () => {
    mockState.authUser = {
      id: 'user-admin',
      user_metadata: { role: 'admin' },
    };

    expect(await getEffectiveRole('user-admin')).toBe('admin');
  });

  it('lets the manual override win over everything', async () => {
    mockState.authUser = { id: 'user-admin', user_metadata: { role: 'admin' } };
    await setUserPlan('user-admin', 'free');
    clearRoleCache('user-admin');

    await setUserRole('user-admin', 'premium3');
    expect(await getRoleOverride('user-admin')).toBe('premium3');
    expect(await getEffectiveRole('user-admin')).toBe('premium3');
    expect(await getEffectiveTier('user-admin')).toBe(3);
  });

  it('falls back to the plan when the override is removed', async () => {
    await setUserPlan('user-back', 'premium');
    clearRoleCache('user-back');

    await setUserRole('user-back', 'premium4');
    expect(await getEffectiveRole('user-back')).toBe('premium4');

    await clearUserRole('user-back');
    expect(await getRoleOverride('user-back')).toBeNull();
    expect(await getEffectiveRole('user-back')).toBe('premium2');
  });

  it('rejects an invalid role', async () => {
    await expect(setUserRole('user-x', 'gold' as any)).rejects.toThrow('Role tidak valid');
  });

  it('caches the role and drops the cache on demand', async () => {
    await setUserPlan('user-cache', 'premium');
    clearRoleCache('user-cache');

    expect(await getEffectiveRole('user-cache')).toBe('premium2');

    await setUserPlan('user-cache', 'free');
    // The cached value is still returned ...
    expect(await getEffectiveRole('user-cache')).toBe('premium2');

    // ... until the cache is dropped.
    clearRoleCache('user-cache');
    expect(await getEffectiveRole('user-cache')).toBe('free');
  });

  it('resolves a role from its three sources', () => {
    expect(resolveRoleFromParts('premium3', 'admin', 'premium')).toBe('premium3');
    expect(resolveRoleFromParts(null, 'admin', 'free')).toBe('admin');
    expect(resolveRoleFromParts(null, 'premium1', 'premium')).toBe('premium1');
    expect(resolveRoleFromParts(null, 'free', 'premium')).toBe('premium2');
    expect(resolveRoleFromParts(null, 'free', 'free')).toBe('free');
    expect(resolveRoleFromParts(null, null, null)).toBe('free');
    expect(resolveRoleFromParts('gold', null, null)).toBe('free');
  });
});
