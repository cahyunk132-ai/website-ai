import { randomInt } from 'node:crypto';
import { EndpointHttpError } from './endpointTransport';

/** Randomize the starting key across serverless instances. Try each key at most
 * once, only for explicit credential/quota/rate-limit HTTP responses. Never
 * retry ambiguous network/5xx failures that might duplicate billable work.
 */
export async function withEndpointKeys<T>(keys: string[], request: (key: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const unique = [...new Set(keys)];
  if (!unique.length) throw new Error('Endpoint tidak memiliki API key.');
  const start = randomInt(unique.length);
  const deadline = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let attempt = 0; attempt < unique.length; attempt++) {
    combined.throwIfAborted();
    try { return await request(unique[(start + attempt) % unique.length], combined); }
    catch (error) {
      if (combined.aborted || !(error instanceof EndpointHttpError) || ![401, 402, 403, 429].includes(error.status) || attempt === unique.length - 1) throw error;
    }
  }
  throw new Error('Semua API key endpoint gagal.');
}
