import { NextResponse } from 'next/server';
import { getSessionFromRequest, findLocalUserIdByEmail } from '@/lib/auth';
import { getUsageSnapshot } from '@/lib/storage';
import {
  PLANS,
  PlanId,
  isPlanId,
  isPremiumPlan,
  planFor,
  dailyLimitFor,
  getUserPlan,
  setUserPlan,
  getPlanSnapshot,
  nextResetAt,
} from '@/lib/plans';
import { getEffectiveRole, setUserRole, clearRoleCache } from '@/lib/roles';
import {
  TIER_CONFIGS,
  getTierConfig,
  getTierForRole,
  isUserRole,
  serializeTierConfig,
} from '@/lib/ai/tiers';
import { createServerSupabaseAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Resolves the id of a user from an email address.
 *
 * The admin API of Supabase Auth is used, because `auth.users` is not exposed
 * through PostgREST. Without a database the request is rejected, there is no
 * way to look up an account then.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createServerSupabaseAdminClient();

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (!error && data?.users) {
        const needle = email.trim().toLowerCase();
        const found = data.users.find(
          (candidate) => candidate.email?.toLowerCase() === needle
        );
        if (found?.id) return found.id;
      }
    } catch {
      // Fall through to the local store.
    }
  }

  // Without a database the seeded accounts are still manageable.
  return findLocalUserIdByEmail(email);
}

export async function GET(req: Request) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plan = await getUserPlan(user.id);
    const role = await getEffectiveRole(user.id, user.email);
    const tierConfig = getTierConfig(role);
    const tier = getTierForRole(role);

    // The quota of the tier is the quota that is actually enforced.
    const limit = tierConfig.dailyRequestLimit;
    const usage = await getUsageSnapshot(user.id, limit);
    const snapshot = await getPlanSnapshot(user.id, usage.requestCount);
    // The remaining quota follows the tier, not the plan.
    const remaining = Number.isFinite(limit) ? Math.max(0, limit - usage.requestCount) : null;

    return NextResponse.json({
      plan: snapshot.plan,
      planLabel: snapshot.label,
      premium: snapshot.premium || role !== 'free',
      limit: Number.isFinite(limit) ? limit : null,
      unlimited: !Number.isFinite(limit),
      used: snapshot.used,
      remaining,
      resetsAt: snapshot.resetsAt,
      isAdmin: role === 'admin',
      role,
      tier,
      tierLabel: tierConfig.name,
      tierBadge: tierConfig.badge,
      tierConfig: serializeTierConfig(tierConfig),
      tiers: Object.values(TIER_CONFIGS).map((config) => serializeTierConfig(config)),
      plans: {
        free: { ...PLANS.free, dailyPromptLimit: dailyLimitFor('free') },
        premium: { ...PLANS.premium, dailyPromptLimit: dailyLimitFor('premium') },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { action?: string; plan?: string; email?: string; role?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const action = body.action ?? 'upgrade';

    // -- self service: activate (or deactivate) the premium plan ----------
    if (action === 'upgrade' || action === 'downgrade' || action === 'toggle') {
      const current = await getUserPlan(user.id);
      const target: PlanId =
        action === 'toggle' ? (current === 'premium' ? 'free' : 'premium') : action === 'upgrade' ? 'premium' : 'free';

      await setUserPlan(user.id, target);
      // The role is derived from the plan, the cache has to be dropped.
      clearRoleCache(user.id);
      // The role follows the plan, unless an administrator set it manually.
      const role = await getEffectiveRole(user.id, user.email);
      const tierConfig = getTierConfig(role);
      const limit = tierConfig.dailyRequestLimit;
      const usage = await getUsageSnapshot(user.id, limit);

      return NextResponse.json({
        ok: true,
        plan: target,
        planLabel: planFor(target).label,
        premium: isPremiumPlan(target) || role !== 'free',
        role,
        tier: tierConfig.tier,
        tierLabel: tierConfig.name,
        tierBadge: tierConfig.badge,
        limit: Number.isFinite(limit) ? limit : null,
        unlimited: !Number.isFinite(limit),
        used: usage.requestCount,
        remaining: Number.isFinite(limit) ? Math.max(0, limit - usage.requestCount) : null,
        resetsAt: nextResetAt(),
      });
    }

    // -- admin: change the plan of another account --------------------------
    if (action === 'set') {
      if (user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Hanya admin yang bisa mengubah plan pengguna lain.' },
          { status: 403 }
        );
      }

      const target = body.plan;
      if (!isPlanId(target)) {
        return NextResponse.json({ error: 'Plan tidak valid.' }, { status: 400 });
      }

      const email = (body.email ?? '').trim();
      if (!email) {
        return NextResponse.json({ error: 'Email wajib diisi.' }, { status: 400 });
      }

      const targetUserId = await findUserIdByEmail(email);
      if (!targetUserId) {
        return NextResponse.json(
          { error: `Pengguna dengan email ${email} tidak ditemukan.` },
          { status: 404 }
        );
      }

      await setUserPlan(targetUserId, target);

      return NextResponse.json({
        ok: true,
        email,
        plan: target,
        planLabel: planFor(target).label,
        premium: isPremiumPlan(target),
        limit: dailyLimitFor(target),
      });
    }

    // -- admin: change the role of another account --------------------------
    if (action === 'setRole') {
      if (user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Hanya admin yang bisa mengubah role pengguna lain.' },
          { status: 403 }
        );
      }

      if (!isUserRole(body.role)) {
        return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 });
      }

      const email = (body.email ?? '').trim();
      if (!email) {
        return NextResponse.json({ error: 'Email wajib diisi.' }, { status: 400 });
      }

      const targetUserId = await findUserIdByEmail(email);
      if (!targetUserId) {
        return NextResponse.json(
          { error: `Pengguna dengan email ${email} tidak ditemukan.` },
          { status: 404 }
        );
      }

      const saved = await setUserRole(targetUserId, body.role);
      const tierConfig = getTierConfig(saved);

      return NextResponse.json({
        ok: true,
        email,
        role: saved,
        tier: tierConfig.tier,
        tierLabel: tierConfig.name,
        limit: Number.isFinite(tierConfig.dailyRequestLimit)
          ? tierConfig.dailyRequestLimit
          : null,
      });
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
