import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ row: null as any, error: null as any, written: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
  const chain: any = {
    select: () => chain, eq: () => chain, order: () => chain,
    update: (row: any) => { state.written = row; return chain; },
    insert: (row: any) => { state.written = row; return chain; },
    delete: () => chain,
    maybeSingle: async () => ({ data: state.row, error: state.error }),
    single: async () => ({ data: { id: '01234567-89ab-4def-8123-456789abcdef', ...state.written }, error: state.error }),
    then: (resolve: any) => resolve({ data: state.row ? [state.row] : [], error: state.error }),
  }; return chain;
} }) }));
import { saveEndpoint, endpointKey, endpointKeys, endpointKeyId, publicEndpoint, endpointModels } from './endpointStore';
import { encryptSecret } from '../crypto';
const input = { name: 'Example', baseUrl: 'https://api.example.com/v1', apiKey: 'new-secret-value', enabled: true, models: [{ id: 'example-model', minTier: 2 as const, supportsVision: true }] };
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://db.example.com'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key'); vi.stubEnv('APP_ENCRYPTION_KEY', 'test-encryption-secret');
  state.row = null; state.error = null; state.written = null;
});
afterEach(() => vi.unstubAllEnvs());
describe('persistent encrypted admin endpoints', () => {
  it('encrypts credentials and never returns the ciphertext or raw key to a client', async () => {
    const safe = await saveEndpoint(input);
    expect(state.written.encrypted_key).not.toContain(input.apiKey);
    expect(endpointKey(state.written)).toBe(input.apiKey);
    expect(safe).not.toHaveProperty('encrypted_key');
    expect(safe).not.toHaveProperty('apiKey');
    expect(JSON.stringify(safe)).not.toContain(input.apiKey);
  });
  it('retains the existing key when editing the same URL with no key supplied', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('old-secret') };
    await saveEndpoint({ ...input, apiKey: undefined }, 'old');
    expect(state.written.encrypted_key).toBe(state.row.encrypted_key);
  });
  it('requires a replacement key when the destination changes', async () => {
    state.row = { ...input, id: 'old', baseUrl: 'https://old.example.com/v1', encrypted_key: encryptSecret('old-secret') };
    await expect(saveEndpoint({ ...input, apiKey: undefined }, 'old')).rejects.toThrow('API key baru');
    expect(state.written).toBeNull();
  });
  it('reports database persistence failures instead of claiming in-memory success', async () => {
    state.error = { message: 'missing table' };
    await expect(saveEndpoint(input)).rejects.toThrow('database');
  });
  it('fails closed without service role or encryption configuration', async () => {
    vi.stubEnv('APP_ENCRYPTION_KEY', '');
    await expect(saveEndpoint(input)).rejects.toThrow('APP_ENCRYPTION_KEY');
    vi.stubEnv('APP_ENCRYPTION_KEY', 'present'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(saveEndpoint(input)).rejects.toThrow('service-role');
  });
  it('creates a multi-key pool, encrypts every key, and deduplicates input', async () => {
    const { apiKey, ...base } = input;
    const safe = await saveEndpoint({ ...base, apiKeys: ['secret-one', 'secret-two', 'secret-one'] });
    expect(endpointKeys(state.written)).toEqual(['secret-one', 'secret-two']);
    expect(safe.keyCount).toBe(2);
    expect(safe.keys).toHaveLength(2);
    expect(safe).not.toHaveProperty('encrypted_keys');
    for (const key of ['secret-one', 'secret-two']) expect(JSON.stringify(safe)).not.toContain(key);
  });
  it('appends new keys to a legacy endpoint without losing the original key', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('legacy-key') };
    await saveEndpoint({ ...input, apiKey: undefined, apiKeys: ['new-key', 'legacy-key'] }, 'old');
    expect(endpointKeys(state.written)).toEqual(['legacy-key', 'new-key']);
  });
  it('removes a specific key without re-entering the remaining secrets', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('key-one'), encrypted_keys: ['key-one', 'key-two'].map(encryptSecret) };
    await saveEndpoint({ ...input, apiKey: undefined, removeKeyIds: [endpointKeyId('key-one')] }, 'old');
    expect(endpointKeys(state.written)).toEqual(['key-two']);
    expect(endpointKey(state.written)).toBe('key-two');
  });
  it('rejects deleting the last key or replacing a pool with nothing', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('only-key') };
    await expect(saveEndpoint({ ...input, apiKey: undefined, removeKeyIds: [endpointKeyId('only-key')] }, 'old')).rejects.toThrow('minimal satu');
    await expect(saveEndpoint({ ...input, apiKey: undefined, keyMode: 'replace' }, 'old')).rejects.toThrow('minimal satu');
  });
  it('discards all old keys when the endpoint destination changes', async () => {
    state.row = { ...input, id: 'old', baseUrl: 'https://old.example.com/v1', encrypted_key: encryptSecret('old-key'), encrypted_keys: ['old-key', 'another-old-key'].map(encryptSecret) };
    await saveEndpoint({ ...input, apiKey: undefined, apiKeys: ['new-key'] }, 'old');
    expect(endpointKeys(state.written)).toEqual(['new-key']);
  });
  it('allows explicitly replacing the pool', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('old-key') };
    await saveEndpoint({ ...input, apiKey: undefined, apiKeys: ['replacement-key'], keyMode: 'replace' }, 'old');
    expect(endpointKeys(state.written)).toEqual(['replacement-key']);
  });
  it('rejects more than 50 unique keys after merging', async () => {
    state.row = { ...input, id: 'old', encrypted_key: encryptSecret('old-key'), encrypted_keys: Array.from({ length: 50 }, (_, i) => encryptSecret(`secret-key-${i}`)) };
    await expect(saveEndpoint({ ...input, apiKey: undefined, apiKeys: ['new-key'] }, 'old')).rejects.toThrow('50');
  });
  it('publishes model metadata without endpoints or keys and hides disabled models', () => {
    const row = { ...input, id: '01234567-89ab-4def-8123-456789abcdef', encrypted_key: encryptSecret(input.apiKey), updated_at: '' };
    const models = endpointModels([row]);
    expect(models[0].provider).toBe(`custom:${row.id}`);
    expect(models[0].minTier).toBe(2); expect(models[0].supportsVision).toBe(true);
    expect(JSON.stringify(models)).not.toContain(input.apiKey);
    expect(JSON.stringify(models)).not.toContain(input.baseUrl);
    expect(endpointModels([{ ...row, enabled: false }])).toEqual([]);
    expect(publicEndpoint(row)).not.toHaveProperty('encrypted_key');
  });
});
