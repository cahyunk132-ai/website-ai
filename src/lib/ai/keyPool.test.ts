import { describe, it, expect, beforeEach } from 'vitest';
import { keyPoolManager } from './keyPool';

describe('KeyPoolManager - Multi-Credential Key Pools & Rotation', () => {
  beforeEach(async () => {
    await keyPoolManager.refreshPool();
  });

  it('supports adding multiple keys to Radox and InkStone pools', async () => {
    const radoxAdded = await keyPoolManager.addKeys('radox', 'rdx_test_key_alpha, rdx_test_key_beta');
    expect(radoxAdded).toBe(2);

    const inkAdded = await keyPoolManager.addKeys('inkstone', 'ink_test_key_one\nink_test_key_two');
    expect(inkAdded).toBe(2);

    const radoxKeys = await keyPoolManager.listKeysForClient('radox');
    expect(radoxKeys.length).toBeGreaterThanOrEqual(2);

    const inkKeys = await keyPoolManager.listKeysForClient('inkstone');
    expect(inkKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('rotates across available keys in round-robin fashion', async () => {
    await keyPoolManager.addKeys('radox', 'rdx_rot_1, rdx_rot_2');

    const key1 = await keyPoolManager.getKeyForRequest('radox');
    const key2 = await keyPoolManager.getKeyForRequest('radox');

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    // In round-robin, two consecutive calls should yield different keys when multiple are available
    expect(key1?.key).not.toBe(key2?.key);
  });

  it('provides an alternate key when a key encounters quota exhaustion or rate limit', async () => {
    await keyPoolManager.addKeys('inkstone', 'ink_failover_primary, ink_failover_secondary');

    const primaryKey = await keyPoolManager.getKeyForRequest('inkstone');
    expect(primaryKey).toBeDefined();

    // Report quota error on primary key
    keyPoolManager.reportKeyError('inkstone', primaryKey!.id, { isQuota: true, message: 'Balance is zero' });

    // Request alternate key
    const altKey = await keyPoolManager.getAlternativeKey('inkstone', primaryKey!.id);
    expect(altKey).toBeDefined();
    expect(altKey?.id).not.toBe(primaryKey?.id);
    expect(altKey?.isHealthy).toBe(true);
  });

  it('safely masks API keys for client display without exposing secrets', async () => {
    const safeKeys = await keyPoolManager.listKeysForClient('radox');
    for (const k of safeKeys) {
      expect((k as any).key).toBeUndefined(); // Raw secret must never be in client object
      expect(k.maskedKey).toContain('****');
      expect(k.provider).toBe('radox');
    }
  });
});
