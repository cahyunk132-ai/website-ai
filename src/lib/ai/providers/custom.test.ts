import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ endpoint: null as any }));
vi.mock('../endpointStore', () => ({ getEndpoint: vi.fn(async () => state.endpoint), endpointKey: () => 'private-secret' }));
vi.mock('../endpointTransport', () => ({ endpointJson: vi.fn(async () => ({ choices: [{ message: { content: 'Hello from new endpoint' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } })) }));
vi.mock('../usageTelemetry', () => ({ persistProviderUsage: vi.fn(async () => {}), persistProviderFailure: vi.fn(async () => {}) }));
import { ProviderRouter } from '../router';
import { endpointJson } from '../endpointTransport';
import { customRoute } from './custom';
const id = '01234567-89ab-4def-8123-456789abcdef';
const model = `custom:${id}/vendor/new-model`;
beforeEach(() => {
  vi.clearAllMocks();
  state.endpoint = { id, name: 'New provider', baseUrl: 'https://api.example.com/v1', enabled: true, models: [{ id: 'vendor/new-model', minTier: 2, supportsVision: false }] };
});
describe('custom endpoints in the real chat router', () => {
  it('routes an auto-selected namespaced model to its endpoint and upstream model ID', async () => {
    const result = await new ProviderRouter().completeChat({ model, messages: [{ role: 'user', content: 'Hello' }], maxTier: 2 });
    expect(result.text).toBe('Hello from new endpoint');
    expect(result.provider).toBe(`custom:${id}`);
    expect(endpointJson).toHaveBeenCalledWith('https://api.example.com/v1', '/chat/completions', 'private-secret', expect.objectContaining({ model: 'vendor/new-model', stream: false }), undefined);
  });
  it('returns custom completions through the chat streaming callback', async () => {
    const chunks: any[] = [];
    await new ProviderRouter().streamChat({ model, messages: [], maxTier: 4 }, (chunk) => { chunks.push(chunk); });
    expect(chunks[0].text).toBe('Hello from new endpoint'); expect(chunks[0].done).toBe(true);
  });
  it('enforces tier restrictions inside the router, including missing maxTier', async () => {
    for (const maxTier of [0, undefined] as const) await expect(new ProviderRouter().completeChat({ model, messages: [], maxTier })).rejects.toThrow('Tier');
    expect(endpointJson).not.toHaveBeenCalled();
  });
  it('rejects disabled/deleted endpoints and unlisted models', async () => {
    state.endpoint.enabled = false;
    await expect(new ProviderRouter().completeChat({ model, messages: [], maxTier: 4 })).rejects.toThrow('dinonaktifkan');
    state.endpoint = null;
    await expect(new ProviderRouter().completeChat({ model, messages: [], maxTier: 4 })).rejects.toThrow('tidak ditemukan');
    expect(endpointJson).not.toHaveBeenCalled();
  });
  it('rejects provider mismatch and raw unregistered model IDs', () => {
    expect(() => customRoute(model, 'radox')).toThrow('tidak cocok');
    expect(() => customRoute('vendor/new-model', `custom:${id}`)).toThrow('katalog');
  });
  it('rejects image requests when vision is disabled', async () => {
    await expect(new ProviderRouter().completeChat({ model, maxTier: 4, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,a' } }] as any }] })).rejects.toThrow('gambar');
    expect(endpointJson).not.toHaveBeenCalled();
  });
  it('does not leak upstream errors or silently fall back to another vendor', async () => {
    vi.mocked(endpointJson).mockRejectedValueOnce(new Error('private-secret'));
    await expect(new ProviderRouter().completeChat({ model, maxTier: 4, messages: [] })).rejects.toThrow('Permintaan endpoint gagal');
    expect(endpointJson).toHaveBeenCalledTimes(1);
  });
});
