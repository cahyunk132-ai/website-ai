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
    const limit = dailyLimitFor(plan);
    const usage = await getUsageSnapshot(user.id, limit);
    const snapshot = await getPlanSnapshot(user.id, usage.requestCount);

    return NextResponse.json({
      plan: snapshot.plan,
      planLabel: snapshot.label,
      premium: snapshot.premium,
      limit: snapshot.dailyPromptLimit,
      used: snapshot.used,
      remaining: snapshot.remaining,
      resetsAt: snapshot.resetsAt,
      isAdmin: user.role === 'admin',
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

    let body: { action?: string; plan?: string; email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const action = body.action ?? 'upgrade';

    // -- self service: activate (or deactivate) the premium plan -----------
    if (action === 'upgrade' || action === 'downgrade' || action === 'toggle') {
      const current = await getUserPlan(user.id);
      const target: PlanId =
        action === 'toggle' ? (current === 'premium' ? 'free' : 'premium') : action === 'upgrade' ? 'premium' : 'free';

      await setUserPlan(user.id, target);
      const limit = dailyLimitFor(target);
      const usage = await getUsageSnapshot(user.id, limit);

      return NextResponse.json({
        ok: true,
        plan: target,
        planLabel: planFor(target).label,
        premium: isPremiumPlan(target),
        limit,
        used: usage.requestCount,
        remaining: Math.max(0, limit - usage.requestCount),
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

    return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
