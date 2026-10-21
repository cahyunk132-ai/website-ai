import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ user: { id: 'admin1', email: 'admin@example.com', role: 'admin' } as any, role: 'admin' }));
vi.mock('@/lib/auth', () => ({ getSessionFromRequest: vi.fn(async () => state.user) }));
vi.mock('@/lib/roles', () => ({ getEffectiveRole: vi.fn(async () => state.role) }));
vi.mock('@/lib/ai/endpointStore', () => ({
  listEndpoints: vi.fn(async () => []), publicEndpoint: vi.fn((row) => row),
  saveEndpoint: vi.fn(async (input) => ({ id: 'e1', name: input.name, maskedKey: '****' })), deleteEndpoint: vi.fn(async () => {}),
}));
vi.mock('@/lib/ai/endpointTransport', async (original) => ({ ...await original<typeof import('@/lib/ai/endpointTransport')>(), endpointJson: vi.fn(async () => ({ data: [{ id: 'new-model' }] })) }));
import { GET, POST, PATCH, DELETE } from './route';
import { GET as getKeys, POST as addKey, DELETE as removeKey } from '../../settings/route';
import { listEndpoints, saveEndpoint, deleteEndpoint } from '@/lib/ai/endpointStore';
import { endpointJson } from '@/lib/ai/endpointTransport';
const valid = { name: 'New provider', baseUrl: 'https://api.example.com/v1', apiKey: 'secret-api-key', models: [{ id: 'new-model', minTier: 0, supportsVision: false }] };
function req(method: string, data?: unknown, origin?: string) {
  return new NextRequest('https://site.example/api/admin/endpoints', { method, headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
beforeEach(() => { vi.clearAllMocks(); state.user = { id: 'admin1', email: 'admin@example.com', role: 'admin' }; state.role = 'admin'; });
describe('admin endpoint configuration API', () => {
  it.each(['GET', 'POST', 'PATCH', 'DELETE'])('rejects unauthenticated %s', async (method) => {
    state.user = null;
    const response = await ({ GET, POST, PATCH, DELETE }[method]!(req(method, method === 'GET' ? undefined : valid)));
    expect(response.status).toBe(401);
    expect(saveEndpoint).not.toHaveBeenCalled(); expect(listEndpoints).not.toHaveBeenCalled();
  });
  it.each(['GET', 'POST', 'PATCH', 'DELETE'])('rejects non-admin %s even with an old admin session claim', async (method) => {
    state.role = 'premium4';
    const response = await ({ GET, POST, PATCH, DELETE }[method]!(req(method, method === 'GET' ? undefined : valid)));
    expect(response.status).toBe(403);
    expect(saveEndpoint).not.toHaveBeenCalled(); expect(deleteEndpoint).not.toHaveBeenCalled();
  });
  it('also protects the existing built-in key settings API', async () => {
    state.role = 'free';
    for (const [method, handler] of [['GET', getKeys], ['POST', addKey], ['DELETE', removeKey]] as const) {
      expect((await handler(req(method, method === 'GET' ? undefined : { provider: 'radox', apiKey: 'secret' }))).status).toBe(403);
    }
  });
  it('rejects cross-origin writes', async () => {
    expect((await POST(req('POST', valid, 'https://attacker.example'))).status).toBe(403);
    expect(saveEndpoint).not.toHaveBeenCalled();
  });
  it('creates an endpoint and returns no plaintext key', async () => {
    const response = await POST(req('POST', valid));
    expect(response.status).toBe(201);
    expect(saveEndpoint).toHaveBeenCalledWith(expect.objectContaining(valid));
    expect(await response.text()).not.toContain(valid.apiKey);
  });
  it.each(['http://api.example.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://user:password@api.example.com/v1'])('rejects unsafe URL %s', async (baseUrl) => {
    expect((await POST(req('POST', { ...valid, baseUrl }))).status).toBe(400);
    expect(saveEndpoint).not.toHaveBeenCalled();
  });
  it('requires a key for new endpoints', async () => {
    expect((await POST(req('POST', { ...valid, apiKey: undefined }))).status).toBe(400);
  });
  it('supports updating and deleting an existing endpoint', async () => {
    const id = '01234567-89ab-4def-8123-456789abcdef';
    expect((await PATCH(req('PATCH', { ...valid, id }))).status).toBe(200);
    expect(saveEndpoint).toHaveBeenCalledWith(expect.any(Object), id);
    expect((await DELETE(req('DELETE', { id }))).status).toBe(200);
    expect(deleteEndpoint).toHaveBeenCalledWith(id);
  });
  it('tests only explicitly supplied credentials', async () => {
    const response = await POST(req('POST', { action: 'test', endpoint: valid }));
    expect(response.status).toBe(200);
    expect(endpointJson).toHaveBeenCalledWith(valid.baseUrl, '/models', valid.apiKey);
    expect(await response.json()).toEqual({ success: true, modelIds: ['new-model'] });
    expect(saveEndpoint).not.toHaveBeenCalled();
  });
  it('does not echo provider errors or credentials', async () => {
    vi.mocked(endpointJson).mockRejectedValueOnce(new Error(`Rejected ${valid.apiKey}`));
    const response = await POST(req('POST', { action: 'test', endpoint: valid }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(valid.apiKey);
  });
});
