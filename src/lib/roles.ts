/**
 * Hyunk AI Hub - Role storage & resolution
 *
 * The role of an account is resolved with the following priority:
 *
 *   1. `public.user_roles`  - the manual override of an administrator,
 *   2. `user_metadata.role` - "admin" and the premium roles are sticky,
 *   3. the subscription plan - "premium" maps to "premium2", "free" to "free",
 *   4. "free"               - the default of every new account.
 *
 * Only the service role key may read or write the table, a user can never
 * raise his own role.
 */

import { createServerSupabaseAdminClient } from './supabase/server';
import { getUserPlan, PlanId, PLAN_ROLES } from './plans';
import {
  Tier,
  TIER_CONFIGS,
  UserRole,
  getTierForRole,
  isUserRole,
} from './ai/tiers';

export { PLAN_ROLES };

/** The seeded administrator keeps the admin role even without a database. */
const ADMIN_SEED_EMAILS = ['admin@hyunkai.com'];

export interface UserRoleEntry {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tier: Tier;
  /** How many AI requests the account used today. */
  usedToday: number;
  createdAt: string;
  /** True when the role was set manually by an administrator. */
  manual: boolean;
}

// ---------------------------------------------------------------------------
// In-memory fallback (local development without a database)
// ---------------------------------------------------------------------------

const ROLE_STORE_KEY = Symbol.for('hyunk-ai-hub.user-roles');
const globalScope = globalThis as unknown as Record<symbol, Map<string, UserRole> | undefined>;
if (!globalScope[ROLE_STORE_KEY]) {
  globalScope[ROLE_STORE_KEY] = new Map<string, UserRole>();
}
const memoryRoles = globalScope[ROLE_STORE_KEY] as Map<string, UserRole>;

// Short lived cache: the role is read on every chat request.
const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: UserRole; expiresAt: number }>();

export function clearRoleCache(userId?: string): void {
  if (userId) {
    roleCache.delete(userId);
  } else {
    roleCache.clear();
  }
}

/** The manual roles of the local development store. */
export function getMemoryRole(userId: string): UserRole | null {
  return memoryRoles.get(userId) ?? null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * The manual override of an administrator (`null` when there is none).
 */
export async function getRoleOverride(userId: string): Promise<UserRole | null> {
  if (!userId) return null;

  const supabase = createServerSupabaseAdminClient();
  if (!supabase) {
    return memoryRoles.get(userId) ?? null;
  }

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data && isUserRole(data.role)) {
      return data.role;
    }
  } catch {
    // A database error must never lock a user out, the fallback below applies.
  }

  return null;
}

/**
 * Stores the role of a user. This is the manual override of an administrator.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<UserRole> {
  if (!isUserRole(role)) {
    throw new Error('Role tidak valid.');
  }

  const supabase = createServerSupabaseAdminClient();
  if (supabase) {
    const { error } = await supabase.from('user_roles').upsert(
      {
        user_id: userId,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      throw new Error(`Gagal menyimpan role: ${error.message}`);
    }
  } else {
    memoryRoles.set(userId, role);
  }

  clearRoleCache(userId);
  return role;
}

/**
 * Removes the manual override of a user, the role is derived again.
 */
export async function clearUserRole(userId: string): Promise<void> {
  const supabase = createServerSupabaseAdminClient();
  if (supabase) {
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
    if (error) {
      throw new Error(`Gagal menghapus role: ${error.message}`);
    }
  } else {
    memoryRoles.delete(userId);
  }

  clearRoleCache(userId);
}

/**
 * The role of the account as it was created (`user_metadata.role`).
 */
async function getMetadataRole(userId: string): Promise<UserRole | null> {
  const supabase = createServerSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const role = data.user.user_metadata?.role;
    return isUserRole(role) ? role : null;
  } catch {
    return null;
  }
}

/**
 * The role that results from the three sources. Kept separate from the
 * database access so the admin list and the request path use the same rules.
 */
export function resolveRoleFromParts(
  overrideRole?: string | null,
  metadataRole?: string | null,
  plan?: string | null
): UserRole {
  // 1. the manual override of an administrator wins
  if (isUserRole(overrideRole)) {
    return overrideRole;
  }

  // 2. the role the account was created with ("admin" and the premium roles
  //    are sticky, "free" falls through to the plan)
  if (isUserRole(metadataRole) && metadataRole !== 'free') {
    return metadataRole;
  }

  // 3. the subscription plan
  if (plan === 'premium') {
    return PLAN_ROLES.premium;
  }

  // 4. the default of every new account
  return 'free';
}

/**
 * The role that is actually applied to an account.
 *
 * @param userId       the id of the account
 * @param email        the email of the account (used for the local fallback)
 * @param metadataRole the role of `user_metadata`, when it is already known
 */
export async function getEffectiveRole(
  userId: string,
  email?: string | null,
  metadataRole?: string | null
): Promise<UserRole> {
  if (!userId) return 'free';

  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }

  // 1. the manual override of an administrator wins
  const override = await getRoleOverride(userId);
  let role: UserRole;

  if (override) {
    role = override;
  } else {
    // 2. the role the account was created with
    const meta =
      metadataRole !== undefined && metadataRole !== null
        ? isUserRole(metadataRole)
          ? metadataRole
          : null
        : await getMetadataRole(userId);

    // 3. the subscription plan
    const plan = await getUserPlan(userId);
    role = resolveRoleFromParts(null, meta, plan);

    // The seeded administrator keeps the admin role, also without a database.
    const isSeededAdmin =
      !!email && ADMIN_SEED_EMAILS.includes(email.trim().toLowerCase());
    if (!createServerSupabaseAdminClient() && isSeededAdmin) {
      role = 'admin';
    }
  }

  roleCache.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

/**
 * The tier of an account (0 - 4).
 */
export async function getEffectiveTier(
  userId: string,
  email?: string | null,
  metadataRole?: string | null
): Promise<Tier> {
  return getTierForRole(await getEffectiveRole(userId, email, metadataRole));
}

/**
 * The daily request limit of an account (based on its role).
 */
export async function resolveTierLimit(
  userId: string,
  email?: string | null
): Promise<number> {
  const role = await getEffectiveRole(userId, email);
  return TIER_CONFIGS[role].dailyRequestLimit;
}

/**
 * The tier configuration of an account.
 */
export async function getEffectiveTierConfig(
  userId: string,
  email?: string | null,
  metadataRole?: string | null
) {
  const role = await getEffectiveRole(userId, email, metadataRole);
  return TIER_CONFIGS[role];
}
