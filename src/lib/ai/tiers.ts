/**
 * Hyunk AI Hub - Role & Tier definitions
 *
 * A role decides three things at once:
 *   1. how many AI requests the account may send per day,
 *   2. how long the output of a single request may be,
 *   3. which models the account may use.
 *
 * The role is stored in `public.user_roles` (manual override by an admin),
 * falls back to `user_metadata.role` and finally to the subscription plan.
 * The tier is derived from the role:
 *
 *   admin    -> tier 4 (unlimited, every model)
 *   free     -> tier 0
 *   premium1 -> tier 1
 *   premium2 -> tier 2
 *   premium3 -> tier 3
 *   premium4 -> tier 4
 *
 * The module is dependency free so it can be used by the server *and* by the
 * browser components (model selector, tier badge, premium panel).
 */

/** The role of an account. */
export type UserRole = 'admin' | 'free' | 'premium1' | 'premium2' | 'premium3' | 'premium4';

/** The access level of a role: 0 = free, 1 - 4 = premium. */
export type Tier = 0 | 1 | 2 | 3 | 4;

export interface TierConfig {
  name: string;
  tier: Tier;
  /** Maximum number of AI requests per day. */
  dailyRequestLimit: number;
  /** Maximum number of output tokens per request. */
  maxTokensPerRequest: number;
  /** Maximum number of history messages that are sent to the model. */
  maxContextMessages: number;
  description: string;
  /** Emoji badge of the tier. */
  badge: string;
}

/** Every role of the system, ordered from the lowest to the highest tier. */
export const USER_ROLES: readonly UserRole[] = [
  'free',
  'premium1',
  'premium2',
  'premium3',
  'premium4',
  'admin',
];

/** The roles an administrator may assign to an account. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  'free',
  'premium1',
  'premium2',
  'premium3',
  'premium4',
  'admin',
];

/**
 * Reads a positive number from the environment. `Infinity` is used as the
 * fallback of the admin tier and must survive the conversion.
 */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return parsed > 0 ? Infinity : fallback;
  if (parsed < 0) return fallback;
  return Math.floor(parsed);
}

/** `premium1` -> `PREMIUM1`, used to build the environment variable names. */
function envPrefix(role: UserRole): string {
  return role.toUpperCase();
}

/**
 * The tier configuration of every role.
 *
 * The daily limits can be tuned per deployment:
 *   FREE_DAILY_REQUEST_LIMIT, PREMIUM1_DAILY_REQUEST_LIMIT, ...
 *   FREE_MAX_TOKENS, PREMIUM2_MAX_TOKENS, ...
 *   FREE_MAX_CONTEXT_MESSAGES, ...
 */
export const TIER_CONFIGS: Record<UserRole, TierConfig> = {
  admin: {
    name: 'Admin',
    tier: 4,
    dailyRequestLimit: envNumber('ADMIN_DAILY_REQUEST_LIMIT', Infinity),
    maxTokensPerRequest: envNumber(`${envPrefix('admin')}_MAX_TOKENS`, 32000),
    maxContextMessages: envNumber(`${envPrefix('admin')}_MAX_CONTEXT_MESSAGES`, 100),
    description: 'Unlimited access',
    badge: '👑',
  },
  free: {
    name: 'Free',
    tier: 0,
    dailyRequestLimit: envNumber(`${envPrefix('free')}_DAILY_REQUEST_LIMIT`, 20),
    maxTokensPerRequest: envNumber(`${envPrefix('free')}_MAX_TOKENS`, 2048),
    maxContextMessages: envNumber(`${envPrefix('free')}_MAX_CONTEXT_MESSAGES`, 10),
    description: 'Model gratis dan hemat biaya',
    badge: '🆓',
  },
  premium1: {
    name: 'Premium 1',
    tier: 1,
    dailyRequestLimit: envNumber(`${envPrefix('premium1')}_DAILY_REQUEST_LIMIT`, 100),
    maxTokensPerRequest: envNumber(`${envPrefix('premium1')}_MAX_TOKENS`, 4096),
    maxContextMessages: envNumber(`${envPrefix('premium1')}_MAX_CONTEXT_MESSAGES`, 30),
    description: 'Semua model Free + beberapa model tambahan',
    badge: '⭐',
  },
  premium2: {
    name: 'Premium 2',
    tier: 2,
    dailyRequestLimit: envNumber(`${envPrefix('premium2')}_DAILY_REQUEST_LIMIT`, 200),
    maxTokensPerRequest: envNumber(`${envPrefix('premium2')}_MAX_TOKENS`, 8192),
    maxContextMessages: envNumber(`${envPrefix('premium2')}_MAX_CONTEXT_MESSAGES`, 50),
    description: 'Semua model Premium 1 + lebih banyak pilihan',
    badge: '⭐⭐',
  },
  premium3: {
    name: 'Premium 3',
    tier: 3,
    dailyRequestLimit: envNumber(`${envPrefix('premium3')}_DAILY_REQUEST_LIMIT`, 500),
    maxTokensPerRequest: envNumber(`${envPrefix('premium3')}_MAX_TOKENS`, 16000),
    maxContextMessages: envNumber(`${envPrefix('premium3')}_MAX_CONTEXT_MESSAGES`, 80),
    description: 'Semua model Premium 2 + model kelas tinggi',
    badge: '⭐⭐⭐',
  },
  premium4: {
    name: 'Premium 4',
    tier: 4,
    dailyRequestLimit: envNumber(`${envPrefix('premium4')}_DAILY_REQUEST_LIMIT`, 1000),
    maxTokensPerRequest: envNumber(`${envPrefix('premium4')}_MAX_TOKENS`, 32000),
    maxContextMessages: envNumber(`${envPrefix('premium4')}_MAX_CONTEXT_MESSAGES`, 100),
    description: 'Seluruh model yang diizinkan',
    badge: '💎',
  },
};

/**
 * The tier configuration of a role. Unknown roles fall back to the free tier.
 */
export function getTierConfig(role: string): TierConfig {
  return TIER_CONFIGS[role as UserRole] ?? TIER_CONFIGS.free;
}

/** True when the value is one of the known roles. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** True when the role is the administrator role. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

/** The tier of a role (0 - 4). */
export function getTierForRole(role: string | null | undefined): Tier {
  if (!role) return 0;
  return getTierConfig(role).tier;
}

/** The lowest role that still has the given tier. */
export function roleForTier(tier: number): UserRole {
  const wanted = Math.max(0, Math.min(4, Math.floor(tier)));
  const match = USER_ROLES.find((role) => getTierForRole(role) === wanted);
  return match ?? 'free';
}

/**
 * The role a user needs for a model. `admin` always has access to everything.
 */
export function roleForModel(minTier: number): UserRole {
  return roleForTier(minTier);
}

/**
 * True when a role may use a model that requires `minTier`.
 * The administrator may use every model.
 */
export function canAccessTier(role: string | null | undefined, minTier: number): boolean {
  if (isAdminRole(role)) return true;
  return getTierForRole(role) >= minTier;
}

/**
 * The name of the role a user needs for a model, e.g. "Premium 2".
 */
export function tierLabel(minTier: number): string {
  return TIER_CONFIGS[roleForModel(minTier)].name;
}

/**
 * A JSON safe view of a tier configuration (`Infinity` is not valid JSON).
 */
export function serializeTierConfig(config: TierConfig) {
  return {
    ...config,
    dailyRequestLimit: Number.isFinite(config.dailyRequestLimit)
      ? config.dailyRequestLimit
      : null,
    unlimited: !Number.isFinite(config.dailyRequestLimit),
  };
}
