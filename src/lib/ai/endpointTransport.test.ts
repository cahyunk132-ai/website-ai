import { describe, it, expect, vi, beforeEach } from 'vitest';
const fake = vi.hoisted(() => ({ lookup: vi.fn(), fetch: vi.fn(), configs: [] as any[], close: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: fake.lookup }));
vi.mock('undici', () => ({ Agent: class { constructor(config: any) { fake.configs.push(config); } close = fake.close; }, fetch: fake.fetch }));
import { validateEndpointUrl, isPublicAddress, endpointJson } from './endpointTransport';
beforeEach(() => {
  vi.clearAllMocks(); fake.configs.length = 0;
  fake.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  fake.fetch.mockResolvedValue({ ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('{"data":[]}')); controller.close(); } }) });
});
describe('endpoint network safety', () => {
  it.each(['127.0.0.1', '10.0.0.2', '172.16.1.2', '192.168.1.2', '169.254.169.254', '100.64.1.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '224.0.0.1'])('rejects non-public IP %s', (address) => { expect(isPublicAddress(address)).toBe(false); });
  it.each(['https://api.example.com:8443/v1', 'http://example.com', 'https://api.example.com/v1?key=secret', 'https://api.example.com/v1#x', 'https://[::1]/v1'])('rejects URL %s', (value) => { expect(() => validateEndpointUrl(value)).toThrow(); });
  it('rejects mixed public/private DNS responses without sending credentials', async () => {
    fake.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.2', family: 4 }]);
    await expect(endpointJson('https://api.example.com/v1', '/models', 'secret')).rejects.toThrow('non-publik');
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('pins the validated address and forbids redirects', async () => {
    await endpointJson('https://api.example.com/v1', '/models', 'secret');
    expect(fake.fetch).toHaveBeenCalledWith('https://api.example.com/v1/models', expect.objectContaining({ redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }));
    const callback = vi.fn(); fake.configs[0].connect.lookup('api.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(fake.lookup).toHaveBeenCalledTimes(1);
    expect(fake.close).toHaveBeenCalled();
  });
  it('never exposes an upstream error body', async () => {
    fake.fetch.mockResolvedValue({ ok: false, status: 401, body: { cancel: vi.fn() } });
    await expect(endpointJson('https://api.example.com/v1', '/models', 'secret')).rejects.toThrow('HTTP 401');
  });
});
