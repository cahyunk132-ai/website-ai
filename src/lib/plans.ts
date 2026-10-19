/**
 * Hyunk AI Hub - Subscription plans (Free / Premium)
 *
 * The plan decides how many AI prompts a user may send per day:
 *
 *   free     -> 5 prompt per day
 *   premium  -> 10x the free quota (50 prompt per day)
 *
 * The plan lives in the `user_plans` table and is only reachable with the
 * service role, so a user can never raise his own quota. The limits can be
 * tuned per deployment with the environment variables below.
 */

import { createServerSupabaseAdminClient } from './supabase/server';
import { TIER_CONFIGS, UserRole } from './ai/tiers';

export type PlanId = 'free' | 'premium';

/** The role a plan grants. */
export const PLAN_ROLES: Record<PlanId, UserRole> = {
  free: 'free',
  premium: 'premium2',
};

export interface PlanDefinition {
  id: PlanId;
  label: string;
  tagline: string;
  /** How many AI prompts the plan allows per day. */
  dailyPromptLimit: number;
  priceLabel: string;
  features: string[];
}

/**
 * The daily quota of a plan is the quota of the tier it grants, so there is
 * only one place that decides how many requests an account may send:
 * `src/lib/ai/tiers.ts` (tunable with the environment variables below).
 */
export const FREE_DAILY_PROMPT_LIMIT = TIER_CONFIGS.free.dailyRequestLimit;

/** The premium plan grants the tier "premium2". */
export const PREMIUM_DAILY_PROMPT_LIMIT = TIER_CONFIGS.premium2.dailyRequestLimit;

/** How many times more a premium account may prompt than a free one. */
export const PREMIUM_PROMPT_MULTIPLIER =
  FREE_DAILY_PROMPT_LIMIT > 0
    ? Math.round((PREMIUM_DAILY_PROMPT_LIMIT / FREE_DAILY_PROMPT_LIMIT) * 10) / 10
    : 1;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    label: 'Gratis',
    tagline: 'Untuk coba-coba dan pertanyaan singkat',
    dailyPromptLimit: FREE_DAILY_PROMPT_LIMIT,
    priceLabel: 'Gratis',
    features: [
      `${FREE_DAILY_PROMPT_LIMIT} request AI per hari`,
      'Seluruh model free tier (Radox & InkStone)',
      'Riwayat percakapan, folder, dan tag tersimpan',
      'AI Memory, Prompt Library, dan Command Palette',
    ],
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    tagline: 'Untuk kerja harian yang tidak boleh nunggu',
    dailyPromptLimit: PREMIUM_DAILY_PROMPT_LIMIT,
    priceLabel: 'Rp 99.000 / bulan',
    features: [
      `${PREMIUM_DAILY_PROMPT_LIMIT} request AI per hari (tier Premium 2)`,
      'Semua model tier 0 - 2, termasuk model premium',
      'Konteks panjang, Agent Mode, dan tool keamanan',
      'Jadwal otomatis, export, dan bagikan percakapan',
      'Dukungan prioritas',
    ],
  },
};

export const DEFAULT_PLAN: PlanId = 'free';

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'premium';
}

export function planFor(id: string | null | undefined): PlanDefinition {
  return PLANS[isPlanId(id) ? id : DEFAULT_PLAN];
}

export function isPremiumPlan(id: string | null | undefined): boolean {
  return id === 'premium';
}

export function dailyLimitFor(id: string | null | undefined): number {
  const role = isPlanId(id) ? PLAN_ROLES[id] : 'free';
  return TIER_CONFIGS[role].dailyRequestLimit;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

// In-memory fallback for local development without a database. It lives on
// `globalThis` because every route handler is bundled separately by Next.js.
const PLAN_STORE_KEY = Symbol.for('hyunk-ai-hub.user-plans');
const globalScope = globalThis as unknown as Record<symbol, Map<string, PlanId> | undefined>;
if (!globalScope[PLAN_STORE_KEY]) {
  globalScope[PLAN_STORE_KEY] = new Map<string, PlanId>();
}
const memoryPlans = globalScope[PLAN_STORE_KEY] as Map<string, PlanId>;

/** The seeded admin account shows the premium experience right away. */
const PREMIUM_SEED_EMAILS = ['admin@hyunkai.com'];

// Short lived cache: the plan is read on every chat request, the database
// round trip is not needed for every single prompt.
const PLAN_CACHE_TTL_MS = 30_000;
const planCache = new Map<string, { plan: PlanId; expiresAt: number }>();

export function clearPlanCache(userId?: string): void {
  if (userId) {
    planCache.delete(userId);
  } else {
    planCache.clear();
  }
}

/**
 * Resolves the effective plan of a user.
 *
 * Never throws: a database failure falls back to the free plan so the
 * application keeps working (with the stricter quota).
 */
export async function getUserPlan(userId: string): Promise<PlanId> {
  if (!userId) return DEFAULT_PLAN;

  const cached = planCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.plan;
  }

  const supabase = createServerSupabaseAdminClient();
  let plan: PlanId = DEFAULT_PLAN;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_plans')
        .select('plan, premium_until')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data && isPlanId(data.plan)) {
        const expired =
          data.plan === 'premium' &&
          !!data.premium_until &&
          new Date(data.premium_until).getTime() < Date.now();
        plan = expired ? DEFAULT_PLAN : data.plan;
      }
    } catch {
      // Keep the free plan on any database error.
    }
  } else {
    plan = memoryPlans.get(userId) ?? DEFAULT_PLAN;
  }

  planCache.set(userId, { plan, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
  return plan;
}

/**
 * Stores the plan of a user. Returns the plan that is now effective.
 */
export async function setUserPlan(
  userId: string,
  plan: PlanId,
  premiumUntil?: string | null
): Promise<PlanId> {
  const supabase = createServerSupabaseAdminClient();

  if (supabase) {
    const { error } = await supabase.from('user_plans').upsert(
      {
        user_id: userId,
        plan,
        premium_until: premiumUntil ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      throw new Error(`Gagal menyimpan plan: ${error.message}`);
    }
  } else {
    memoryPlans.set(userId, plan);
  }

  clearPlanCache(userId);
  return plan;
}

/**
 * Resolves the plan of an account that just signed in.
 *
 * Without a database the plan is kept in the process wide store. The seeded
 * admin account starts on the premium plan so the premium experience is
 * visible right away, every other account starts on the free plan. The value
 * is only written once, a manual downgrade is never overwritten.
 */
export async function ensureSeededPlan(userId: string, email?: string | null): Promise<PlanId> {
  if (createServerSupabaseAdminClient()) {
    // The database is the source of truth.
    return getUserPlan(userId);
  }

  if (!memoryPlans.has(userId)) {
    const premium =
      !!email && PREMIUM_SEED_EMAILS.includes(email.trim().toLowerCase());
    memoryPlans.set(userId, premium ? 'premium' : 'free');
  }

  return memoryPlans.get(userId) ?? DEFAULT_PLAN;
}

/**
 * The daily prompt quota of a user, based on the plan of the account.
 */
export async function resolveDailyLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId);
  return dailyLimitFor(plan);
}

export interface PlanSnapshot {
  plan: PlanId;
  label: string;
  dailyPromptLimit: number;
  used: number;
  remaining: number;
  premium: boolean;
  resetsAt: string;
}

/** The moment the daily quota is reset (00:00 UTC). */
export function nextResetAt(): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return reset.toISOString();
}

/**
 * The full state of the quota of a user: the plan, the limit and how much of
 * it has been used today.
 */
export async function getPlanSnapshot(
  userId: string,
  used: number
): Promise<PlanSnapshot> {
  const plan = await getUserPlan(userId);
  const dailyPromptLimit = planFor(plan).dailyPromptLimit;

  return {
    plan,
    label: planFor(plan).label,
    dailyPromptLimit,
    used,
    remaining: Math.max(0, dailyPromptLimit - used),
    premium: isPremiumPlan(plan),
    resetsAt: nextResetAt(),
  };
}
