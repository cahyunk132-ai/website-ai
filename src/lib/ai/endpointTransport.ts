import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as httpFetch } from 'undici';

export function validateEndpointUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) {
    throw new Error('Endpoint harus HTTPS publik pada port 443, tanpa username, password, query, atau fragment.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host) || !host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|test|invalid)$/.test(host)) {
    throw new Error('Gunakan hostname HTTPS publik, bukan alamat IP atau jaringan lokal.');
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

/** Reject all private answers and pin the validated DNS results to the socket.
 * No redirects: a provider can never forward its Authorization header elsewhere.
 */
export async function endpointJson(baseUrl: string, path: '/models' | '/chat/completions', apiKey: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const url = validateEndpointUrl(baseUrl);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error('DNS endpoint mengarah ke alamat non-publik; koneksi ditolak.');
  }
  const dispatcher = new Agent({ connect: { lookup: ((_hostname: string, options: any, callback: any) => {
    const selected = addresses.filter((entry) => !options.family || entry.family === options.family);
    if (!selected.length) return callback(new Error('No validated address for this family'));
    if (options.all) callback(null, selected);
    else callback(null, selected[0].address, selected[0].family);
  }) as any } });
  try {
    const timeout = AbortSignal.timeout(60_000);
    const response = await httpFetch(`${url.toString().replace(/\/+$/, '')}${path}`, {
      dispatcher, redirect: 'error',
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Do not relay an upstream response body: it may echo credentials.
      throw new Error(`Endpoint mengembalikan HTTP ${response.status}.`);
    }
    if (!response.body) throw new Error('Endpoint tidak mengembalikan data.');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Respons endpoint melebihi 4 MiB.'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await dispatcher.close();
  }
}
