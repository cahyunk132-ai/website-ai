import { describe, it, expect } from 'vitest';
import {
  TIER_CONFIGS,
  USER_ROLES,
  ASSIGNABLE_ROLES,
  getTierConfig,
  getTierForRole,
  isUserRole,
  isAdminRole,
  canAccessTier,
  roleForModel,
  roleForTier,
  tierLabel,
  serializeTierConfig,
} from './tiers';

describe('role & tier definitions', () => {
  it('knows the six roles of the system', () => {
    expect(USER_ROLES).toEqual(['free', 'premium1', 'premium2', 'premium3', 'premium4', 'admin']);
    expect(ASSIGNABLE_ROLES).toContain('premium4');
    expect(ASSIGNABLE_ROLES).toContain('admin');
  });

  it('uses the limits of the specification', () => {
    expect(TIER_CONFIGS.admin.dailyRequestLimit).toBe(Infinity);
    expect(TIER_CONFIGS.admin.maxTokensPerRequest).toBe(32000);
    expect(TIER_CONFIGS.admin.maxContextMessages).toBe(100);
    expect(TIER_CONFIGS.admin.badge).toBe('👑');

    expect(TIER_CONFIGS.free.tier).toBe(0);
    expect(TIER_CONFIGS.free.dailyRequestLimit).toBe(20);
    expect(TIER_CONFIGS.free.maxTokensPerRequest).toBe(2048);
    expect(TIER_CONFIGS.free.maxContextMessages).toBe(10);

    expect(TIER_CONFIGS.premium1.tier).toBe(1);
    expect(TIER_CONFIGS.premium1.dailyRequestLimit).toBe(100);
    expect(TIER_CONFIGS.premium1.maxTokensPerRequest).toBe(4096);
    expect(TIER_CONFIGS.premium1.maxContextMessages).toBe(30);

    expect(TIER_CONFIGS.premium2.tier).toBe(2);
    expect(TIER_CONFIGS.premium2.dailyRequestLimit).toBe(200);
    expect(TIER_CONFIGS.premium2.maxTokensPerRequest).toBe(8192);
    expect(TIER_CONFIGS.premium2.maxContextMessages).toBe(50);

    expect(TIER_CONFIGS.premium3.tier).toBe(3);
    expect(TIER_CONFIGS.premium3.dailyRequestLimit).toBe(500);
    expect(TIER_CONFIGS.premium3.maxTokensPerRequest).toBe(16000);
    expect(TIER_CONFIGS.premium3.maxContextMessages).toBe(80);

    expect(TIER_CONFIGS.premium4.tier).toBe(4);
    expect(TIER_CONFIGS.premium4.dailyRequestLimit).toBe(1000);
    expect(TIER_CONFIGS.premium4.maxTokensPerRequest).toBe(32000);
    expect(TIER_CONFIGS.premium4.maxContextMessages).toBe(100);
  });

  it('falls back to the free tier for an unknown role', () => {
    expect(getTierConfig('does-not-exist')).toBe(TIER_CONFIGS.free);
    expect(getTierConfig('')).toBe(TIER_CONFIGS.free);
    expect(getTierConfig('admin')).toBe(TIER_CONFIGS.admin);
  });

  it('maps a role to its tier', () => {
    expect(getTierForRole('free')).toBe(0);
    expect(getTierForRole('premium1')).toBe(1);
    expect(getTierForRole('premium2')).toBe(2);
    expect(getTierForRole('premium3')).toBe(3);
    expect(getTierForRole('premium4')).toBe(4);
    expect(getTierForRole('admin')).toBe(4);
    expect(getTierForRole('user')).toBe(0);
    expect(getTierForRole(null)).toBe(0);
  });

  it('validates the roles', () => {
    expect(isUserRole('premium3')).toBe(true);
    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('user')).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('premium4')).toBe(false);
  });

  it('lets a tier use every model of a lower tier', () => {
    expect(canAccessTier('free', 0)).toBe(true);
    expect(canAccessTier('free', 1)).toBe(false);
    expect(canAccessTier('premium2', 1)).toBe(true);
    expect(canAccessTier('premium2', 2)).toBe(true);
    expect(canAccessTier('premium2', 3)).toBe(false);
    expect(canAccessTier('premium4', 4)).toBe(true);
  });

  it('gives the administrator access to every model', () => {
    expect(canAccessTier('admin', 0)).toBe(true);
    expect(canAccessTier('admin', 4)).toBe(true);
  });

  it('names the role a model needs', () => {
    expect(tierLabel(0)).toBe('Free');
    expect(tierLabel(1)).toBe('Premium 1');
    expect(tierLabel(2)).toBe('Premium 2');
    expect(tierLabel(3)).toBe('Premium 3');
    expect(tierLabel(4)).toBe('Premium 4');
    expect(roleForModel(3)).toBe('premium3');
    expect(roleForTier(2)).toBe('premium2');
    // A tier above 4 is clamped.
    expect(roleForTier(9)).toBe('premium4');
  });

  it('serializes the unlimited limit for the browser', () => {
    const serialized = serializeTierConfig(TIER_CONFIGS.admin);
    expect(serialized.dailyRequestLimit).toBeNull();
    expect(serialized.unlimited).toBe(true);

    const free = serializeTierConfig(TIER_CONFIGS.free);
    expect(free.dailyRequestLimit).toBe(20);
    expect(free.unlimited).toBe(false);
  });
});
