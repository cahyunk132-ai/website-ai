import { describe, it, expect, vi } from 'vitest';
vi.mock('node:crypto', async (original) => ({ ...await original<typeof import('node:crypto')>(), randomInt: () => 0 }));
import { withEndpointKeys } from './endpointKeyPool';
import { EndpointHttpError } from './endpointTransport';

describe('per-endpoint API key pool', () => {
  it.each([401, 402, 403, 429])('tries the next key after explicit HTTP %s', async (status) => {
    const request = vi.fn().mockRejectedValueOnce(new EndpointHttpError(status)).mockResolvedValueOnce('ok');
    expect(await withEndpointKeys(['key-one', 'key-two'], request)).toBe('ok');
    expect(request.mock.calls.map((call) => call[0])).toEqual(['key-one', 'key-two']);
    expect(request.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
  it('does not retry a key twice and deduplicates inputs', async () => {
    const request = vi.fn().mockRejectedValue(new EndpointHttpError(429));
    await expect(withEndpointKeys(['key-one', 'key-one', 'key-two'], request)).rejects.toThrow('429');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([400, 404, 500, 503])('does not replay a request on HTTP %s', async (status) => {
    const request = vi.fn().mockRejectedValue(new EndpointHttpError(status));
    await expect(withEndpointKeys(['key-one', 'key-two'], request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not replay ambiguous network errors', async () => {
    const request = vi.fn().mockRejectedValue(new Error('network disconnected'));
    await expect(withEndpointKeys(['key-one', 'key-two'], request)).rejects.toThrow('network');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('honours cancellation before making any request', async () => {
    const controller = new AbortController(); controller.abort();
    const request = vi.fn();
    await expect(withEndpointKeys(['key-one', 'key-two'], request, controller.signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects an empty pool', async () => {
    await expect(withEndpointKeys([], vi.fn())).rejects.toThrow('API key');
  });
});
