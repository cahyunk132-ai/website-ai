/**
 * Hyunk AI Hub - Admin API: manage the role of the users
 *
 * Only an administrator may use this endpoint. The role decides the daily
 * quota, the maximum length of an answer and which models the account may use.
 */

import { NextResponse } from 'next/server';
import { getSessionFromRequest, listLocalUsers } from '@/lib/auth';
import { createServerSupabaseAdminClient } from '@/lib/supabase/server';
import {
  getEffectiveRole,
  resolveRoleFromParts,
  setUserRole,
  clearUserRole,
  UserRoleEntry,
} from '@/lib/roles';
import { getUsageCountsForUsers } from '@/lib/storage';
import { ASSIGNABLE_ROLES, TIER_CONFIGS, isUserRole, getTierForRole } from '@/lib/ai/tiers';

export const dynamic = 'force-dynamic';

interface AuthUserRow {
  id: string;
  email: string;
  name: string;
  metadataRole: string | null;
  createdAt: string;
}

async function listAuthUsers(): Promise<AuthUserRow[]> {
  const supabase = createServerSupabaseAdminClient();

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (!error && data?.users) {
        return data.users.map((u) => ({
          id: u.id,
          email: u.email || '',
          name: (u.user_metadata?.name as string) || u.email || 'Tanpa nama',
          metadataRole: (u.user_metadata?.role as string) || null,
          createdAt: u.created_at || new Date().toISOString(),
        }));
      }
    } catch {
      // Fall through to the local store.
    }
  }

  return listLocalUsers().map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    metadataRole: u.role,
    createdAt: u.createdAt,
  }));
}

/**
 * Resolves the id of an account from its email address.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const users = await listAuthUsers();
  const needle = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === needle)?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The role is resolved again, a token must never be the only proof.
    const role = await getEffectiveRole(session.id, session.email);
    if (role !== 'admin') {
      return NextResponse.json(
        { error: 'Hanya admin yang dapat melihat daftar pengguna.' },
        { status: 403 }
      );
    }

    const users = await listAuthUsers();
    const supabase = createServerSupabaseAdminClient();

    // The manual overrides
    const overrides = new Map<string, string>();
    if (supabase) {
      try {
        const { data } = await supabase.from('user_roles').select('user_id, role');
        for (const row of data || []) {
          overrides.set(row.user_id as string, row.role as string);
        }
      } catch {
        // The overrides are optional.
      }
    }

    // The subscription plans
    const plans = new Map<string, string>();
    if (supabase) {
      try {
        const { data } = await supabase.from('user_plans').select('user_id, plan');
        for (const row of data || []) {
          plans.set(row.user_id as string, row.plan as string);
        }
      } catch {
        // The plans are optional.
      }
    }

    const usage = await getUsageCountsForUsers(users.map((u) => u.id));

    const entries: UserRoleEntry[] = users.map((user) => {
      const override = overrides.get(user.id) ?? null;
      const effective = resolveRoleFromParts(
        override,
        user.metadataRole,
        plans.get(user.id) ?? null
      );

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: effective,
        tier: getTierForRole(effective),
        usedToday: usage[user.id] ?? 0,
        createdAt: user.createdAt,
        manual: !!override,
      };
    });

    entries.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({
      users: entries,
      roles: ASSIGNABLE_ROLES.map((id) => ({
        id,
        name: TIER_CONFIGS[id].name,
        tier: TIER_CONFIGS[id].tier,
        badge: TIER_CONFIGS[id].badge,
        description: TIER_CONFIGS[id].description,
        dailyRequestLimit: Number.isFinite(TIER_CONFIGS[id].dailyRequestLimit)
          ? TIER_CONFIGS[id].dailyRequestLimit
          : null,
        unlimited: !Number.isFinite(TIER_CONFIGS[id].dailyRequestLimit),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getEffectiveRole(session.id, session.email);
    if (role !== 'admin') {
      return NextResponse.json(
        { error: 'Hanya admin yang dapat mengubah role pengguna.' },
        { status: 403 }
      );
    }

    let body: { userId?: string; email?: string; role?: string; reset?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const targetId = body.userId?.trim() || (body.email ? await findUserIdByEmail(body.email) : null);
    if (!targetId) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan. Gunakan email yang terdaftar.' },
        { status: 404 }
      );
    }

    // The role may be reset, the account then uses its plan again.
    if (body.reset) {
      await clearUserRole(targetId);
      const effective = await getEffectiveRole(targetId);
      return NextResponse.json({
        ok: true,
        userId: targetId,
        role: effective,
        tier: getTierForRole(effective),
        manual: false,
      });
    }

    if (!isUserRole(body.role)) {
      return NextResponse.json(
        { error: 'Role tidak valid. Pilih salah satu: ' + ASSIGNABLE_ROLES.join(', ') },
        { status: 400 }
      );
    }

    const saved = await setUserRole(targetId, body.role);

    return NextResponse.json({
      ok: true,
      userId: targetId,
      role: saved,
      tier: getTierForRole(saved),
      manual: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
