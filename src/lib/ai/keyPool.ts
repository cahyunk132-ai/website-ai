/**
 * Hyunk AI Hub - Multi-Credential Key Pool & Intelligent Key Rotation Manager
 * Manages pools of API keys per provider (Radox AI & Intern InkStone).
 * Supports automatic rotation, rate-limit cooldowns, quota exhaustion failover,
 * and encrypted storage at rest. Never exposes raw secrets to the client.
 */

import crypto from 'crypto';
import { ProviderId } from './types';
import { maskApiKey } from '../crypto';
import { getProviderApiKeys, addProviderApiKey, removeProviderApiKey } from '../storage';

export interface KeyPoolItem {
  id: string;
  provider: ProviderId;
  key: string;
  maskedKey: string;
  source: 'env' | 'database';
  isHealthy: boolean;
  lastError?: string;
  cooldownUntil?: number; // timestamp in ms
  usageCount: number;
  lastUsedAt?: string;
}

export interface ClientSafeKeyItem {
  id: string;
  provider: ProviderId;
  maskedKey: string;
  source: 'env' | 'database';
  isHealthy: boolean;
  isCoolingDown: boolean;
  cooldownSeconds: number;
  lastError?: string;
  usageCount: number;
  lastUsedAt?: string;
}

class KeyPoolManager {
  private inMemoryKeys: Map<ProviderId, KeyPoolItem[]> = new Map();
  private rotationPointers: Map<ProviderId, number> = new Map();
  private initialized: boolean = false;
  private refreshedAt = 0;

  constructor() {
    this.inMemoryKeys.set('radox', []);
    this.inMemoryKeys.set('inkstone', []);
    this.rotationPointers.set('radox', 0);
    this.rotationPointers.set('inkstone', 0);
  }

  hasConfiguredKeys(provider: ProviderId): boolean {
    return (this.inMemoryKeys.get(provider)?.length || 0) > 0;
  }

  private generateKeyId(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 12);
  }

  /**
   * Parses keys from environment variables supporting comma, semicolon, space, or newline delimiters.
   */
  private parseEnvKeys(rawEnv?: string): string[] {
    if (!rawEnv) return [];
    return rawEnv
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 5);
  }

  /**
   * Initializes or refreshes the pool from environment variables and encrypted storage.
   */
  async refreshPool(): Promise<void> {
    const providers: ProviderId[] = ['radox', 'inkstone'];

    for (const provider of providers) {
      const existingList = this.inMemoryKeys.get(provider) || [];
      const healthyMap = new Map<string, { isHealthy: boolean; cooldownUntil?: number; usageCount: number; lastUsedAt?: string }>();
      for (const item of existingList) {
        healthyMap.set(item.id, {
          isHealthy: item.isHealthy,
          cooldownUntil: item.cooldownUntil,
          usageCount: item.usageCount,
          lastUsedAt: item.lastUsedAt,
        });
      }

      // 1. Collect from Environment
      const envSingle = provider === 'radox' ? process.env.RADOX_API_KEY : process.env.INKSTONE_API_KEY;
      const envMulti = provider === 'radox' ? process.env.RADOX_API_KEYS : process.env.INKSTONE_API_KEYS;

      const envRawList = [
        ...this.parseEnvKeys(envSingle),
        ...this.parseEnvKeys(envMulti),
      ];

      // 2. Collect from Database / Storage
      let dbRawList: string[] = [];
      try {
        dbRawList = await getProviderApiKeys(provider);
      } catch {
        dbRawList = [];
      }

      const mergedKeys: KeyPoolItem[] = [];
      const seenRawKeys = new Set<string>();

      // Process ENV keys
      for (const raw of envRawList) {
        if (seenRawKeys.has(raw)) continue;
        seenRawKeys.add(raw);
        const id = this.generateKeyId(raw);
        const prev = healthyMap.get(id);

        mergedKeys.push({
          id,
          provider,
          key: raw,
          maskedKey: maskApiKey(raw),
          source: 'env',
          isHealthy: prev ? prev.isHealthy : true,
          cooldownUntil: prev ? prev.cooldownUntil : undefined,
          usageCount: prev ? prev.usageCount : 0,
          lastUsedAt: prev?.lastUsedAt,
        });
      }

      // Process DB keys
      for (const raw of dbRawList) {
        if (seenRawKeys.has(raw)) continue;
        seenRawKeys.add(raw);
        const id = this.generateKeyId(raw);
        const prev = healthyMap.get(id);

        mergedKeys.push({
          id,
          provider,
          key: raw,
          maskedKey: maskApiKey(raw),
          source: 'database',
          isHealthy: prev ? prev.isHealthy : true,
          cooldownUntil: prev ? prev.cooldownUntil : undefined,
          usageCount: prev ? prev.usageCount : 0,
          lastUsedAt: prev?.lastUsedAt,
        });
      }

      this.inMemoryKeys.set(provider, mergedKeys);
    }

    this.initialized = true;
    this.refreshedAt = Date.now();
  }

  /**
   * Ensures the pool is loaded at least once.
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized || Date.now() - this.refreshedAt > 30_000) {
      await this.refreshPool();
    }
  }

  /**
   * Selects the next eligible API key for a provider using round-robin rotation.
   * If customApiKey is supplied, wraps and returns it directly.
   */
  async getKeyForRequest(provider: ProviderId, customApiKey?: string): Promise<KeyPoolItem | null> {
    if (customApiKey) {
      return {
        id: this.generateKeyId(customApiKey),
        provider,
        key: customApiKey,
        maskedKey: maskApiKey(customApiKey),
        source: 'database',
        isHealthy: true,
        usageCount: 1,
      };
    }

    await this.ensureInitialized();
    const pool = this.inMemoryKeys.get(provider) || [];
    if (pool.length === 0) return null;

    const now = Date.now();
    // Filter out keys currently in cooldown
    const eligibleKeys = pool.filter((k) => !k.cooldownUntil || k.cooldownUntil <= now);

    if (eligibleKeys.length === 0) {
      // If all keys are in cooldown, pick the one that cools down earliest
      const sorted = [...pool].sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
      return sorted[0];
    }

    // Round-robin selection across eligible keys
    const currentPointer = this.rotationPointers.get(provider) || 0;
    const selected = eligibleKeys[currentPointer % eligibleKeys.length];
    this.rotationPointers.set(provider, (currentPointer + 1) % eligibleKeys.length);

    selected.usageCount += 1;
    selected.lastUsedAt = new Date().toISOString();

    return selected;
  }

  /**
   * Returns an alternative key from the same provider's pool when the current key fails.
   */
  async getAlternativeKey(provider: ProviderId, failedKeyId: string): Promise<KeyPoolItem | null> {
    await this.ensureInitialized();
    const pool = this.inMemoryKeys.get(provider) || [];
    const now = Date.now();

    // Look for another key that is not the failed one and not in cooldown
    const alternatives = pool.filter(
      (k) => k.id !== failedKeyId && (!k.cooldownUntil || k.cooldownUntil <= now)
    );

    if (alternatives.length > 0) {
      const selected = alternatives[0];
      selected.usageCount += 1;
      selected.lastUsedAt = new Date().toISOString();
      return selected;
    }

    return null;
  }

  /**
   * Reports successful usage of a key, restoring health.
   */
  reportKeySuccess(provider: ProviderId, keyId: string): void {
    const pool = this.inMemoryKeys.get(provider) || [];
    const item = pool.find((k) => k.id === keyId);
    if (item) {
      item.isHealthy = true;
      item.cooldownUntil = undefined;
      item.lastError = undefined;
    }
  }

  /**
   * Reports an error on a key (Rate Limit or Quota Exhaustion), placing it in temporary cooldown.
   */
  reportKeyError(
    provider: ProviderId,
    keyId: string,
    options: { isRateLimit?: boolean; isQuota?: boolean; message?: string }
  ): void {
    const pool = this.inMemoryKeys.get(provider) || [];
    const item = pool.find((k) => k.id === keyId);
    if (!item) return;

    item.lastError = options.message || 'Key encountered an error';
    const now = Date.now();

    if (options.isRateLimit) {
      // 30 seconds cooldown for rate limit
      item.cooldownUntil = now + 30_000;
      item.isHealthy = false;
    } else if (options.isQuota) {
      // 10 minutes cooldown for quota exhaustion
      item.cooldownUntil = now + 600_000;
      item.isHealthy = false;
    } else {
      // 15 seconds cooldown for generic network errors
      item.cooldownUntil = now + 15_000;
    }
  }

  /**
   * Adds one or more API keys to the provider's pool (stored encrypted).
   */
  async addKeys(provider: ProviderId, rawKeysInput: string): Promise<number> {
    const parsed = this.parseEnvKeys(rawKeysInput);
    if (parsed.length === 0) return 0;

    let addedCount = 0;
    for (const key of parsed) {
      await addProviderApiKey(provider, key);
      addedCount++;
    }

    await this.refreshPool();
    return addedCount;
  }

  /**
   * Removes a key from the pool by ID or masked key.
   */
  async removeKey(provider: ProviderId, keyId: string): Promise<boolean> {
    await this.ensureInitialized();
    const pool = this.inMemoryKeys.get(provider) || [];
    const item = pool.find((k) => k.id === keyId);
    if (!item) return false;

    if (item.source === 'database') {
      await removeProviderApiKey(provider, item.key);
    }

    await this.refreshPool();
    return true;
  }

  /**
   * Returns safe key metadata for frontend display (no plaintext secrets).
   */
  async listKeysForClient(provider: ProviderId): Promise<ClientSafeKeyItem[]> {
    await this.ensureInitialized();
    const pool = this.inMemoryKeys.get(provider) || [];
    const now = Date.now();

    return pool.map((item) => {
      const isCoolingDown = Boolean(item.cooldownUntil && item.cooldownUntil > now);
      const cooldownSeconds = isCoolingDown
        ? Math.ceil((item.cooldownUntil! - now) / 1000)
        : 0;

      return {
        id: item.id,
        provider: item.provider,
        maskedKey: item.maskedKey,
        source: item.source,
        isHealthy: item.isHealthy && !isCoolingDown,
        isCoolingDown,
        cooldownSeconds,
        lastError: item.lastError,
        usageCount: item.usageCount,
        lastUsedAt: item.lastUsedAt,
      };
    });
  }

  /**
   * Checks if the provider has at least one configured key.
   */
  async isConfigured(provider: ProviderId): Promise<boolean> {
    await this.ensureInitialized();
    const pool = this.inMemoryKeys.get(provider) || [];
    return pool.length > 0;
  }
}

export const keyPoolManager = new KeyPoolManager();
