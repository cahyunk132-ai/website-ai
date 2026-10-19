import { describe, it, expect, vi, beforeEach } from 'vitest';

const DEFAULT_SESSION = {
  id: 'user-default',
  email: 'demo@hyunkai.com',
  role: 'user',
};

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({
    id: 'user-default',
    email: 'demo@hyunkai.com',
    role: 'user',
  })),
  findLocalUserIdByEmail: vi.fn(async (email: string) =>
    email === 'demo@hyunkai.com' ? 'demo-user-hyunk-001' : null
  ),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => null,
  createServerSupabaseAdminClient: () => null,
}));

import { GET, POST } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body?: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/premium', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Signs in as a specific account (the plan store is global). */
function signIn(id: string, role: 'user' | 'admin' = 'user') {
  (getSessionFromRequest as any).mockResolvedValue({
    id,
    email: `${id}@hyunkai.com`,
    role,
  });
}

describe('/api/premium', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSessionFromRequest as any).mockResolvedValue(DEFAULT_SESSION);
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValue(null);

    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(401);

    const res2 = await POST(buildRequest({ action: 'upgrade' }));
    expect(res2.status).toBe(401);
  });

  it('reports the free plan with its quota', async () => {
    signIn('user-free-plan');

    const res = await GET(buildRequest(undefined, 'GET'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.plan).toBe('free');
    expect(data.premium).toBe(false);
    // The quota of the tier (free = tier 0).
    expect(data.limit).toBe(20);
    expect(data.role).toBe('free');
    expect(data.tier).toBe(0);
    expect(data.plans.premium.dailyPromptLimit).toBe(200);
    expect(data.plans.free.dailyPromptLimit).toBe(20);
  });

  it('activates the premium plan', async () => {
    signIn('user-upgrade');

    const res = await POST(buildRequest({ action: 'upgrade' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.plan).toBe('premium');
    expect(data.premium).toBe(true);
    // The premium plan grants the tier "premium2".
    expect(data.role).toBe('premium2');
    expect(data.tier).toBe(2);
    expect(data.limit).toBe(200);

    // The plan is now active for the account.
    const after = await (await GET(buildRequest(undefined, 'GET'))).json();
    expect(after.plan).toBe('premium');
    expect(after.role).toBe('premium2');
    expect(after.limit).toBe(200);
  });

  it('deactivates the premium plan again', async () => {
    signIn('user-downgrade');

    await POST(buildRequest({ action: 'upgrade' }));
    const res = await POST(buildRequest({ action: 'downgrade' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.plan).toBe('free');
    expect(data.premium).toBe(false);
  });

  it('toggles the plan', async () => {
    signIn('user-toggle');

    const first = await (await POST(buildRequest({ action: 'toggle' }))).json();
    expect(first.plan).toBe('premium');

    const second = await (await POST(buildRequest({ action: 'toggle' }))).json();
    expect(second.plan).toBe('free');
  });

  it('rejects an unknown action', async () => {
    signIn('user-unknown-action');
    const res = await POST(buildRequest({ action: 'explode' }));
    expect(res.status).toBe(400);
  });

  it('forbids a normal user to change the plan of somebody else', async () => {
    signIn('user-not-admin');
    const res = await POST(
      buildRequest({ action: 'set', email: 'other@hyunkai.com', plan: 'premium' })
    );
    expect(res.status).toBe(403);
  });

  it('lets an admin change the plan of another account', async () => {
    signIn('admin-account', 'admin');

    // The seeded demo account can be resolved from the local store.
    const found = await POST(
      buildRequest({ action: 'set', email: 'demo@hyunkai.com', plan: 'premium' })
    );
    expect(found.status).toBe(200);
    expect((await found.json()).plan).toBe('premium');

    // An unknown account is rejected.
    const missing = await POST(
      buildRequest({ action: 'set', email: 'other@hyunkai.com', plan: 'premium' })
    );
    expect(missing.status).toBe(404);

    // An invalid plan is rejected before the lookup.
    const invalid = await POST(
      buildRequest({ action: 'set', email: 'other@hyunkai.com', plan: 'gold' })
    );
    expect(invalid.status).toBe(400);

    // A missing email is rejected as well.
    const noEmail = await POST(buildRequest({ action: 'set', plan: 'premium' }));
    expect(noEmail.status).toBe(400);
  });
});
