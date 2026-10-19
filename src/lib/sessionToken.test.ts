import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSessionToken,
  verifySessionToken,
  extractSessionToken,
  SESSION_COOKIE_NAME,
} from './sessionToken';

const baseUser = {
  id: 'user-1',
  email: 'demo@hyunkai.com',
  name: 'Demo User',
  role: 'free' as const,
  tier: 0 as const,
  createdAt: '2026-10-18T00:00:00.000Z',
};

describe('Session token (edge runtime safe)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a signed session', async () => {
    const token = await createSessionToken(baseUser);
    const user = await verifySessionToken(token);

    expect(user).not.toBeNull();
    expect(user?.id).toBe('user-1');
    expect(user?.email).toBe('demo@hyunkai.com');
    expect(user?.role).toBe('free');
    expect(user?.tier).toBe(0);
  });

  it('keeps the admin role', async () => {
    const token = await createSessionToken({ ...baseUser, role: 'admin', tier: 4 });
    const user = await verifySessionToken(token);
    expect(user?.role).toBe('admin');
    expect(user?.tier).toBe(4);
  });

  it('rejects a tampered payload', async () => {
    const token = await createSessionToken(baseUser);
    const [payload, signature] = token.split('.');
    const tampered = `${payload}x.${signature}`;

    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const previousKey = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
    const token = await createSessionToken(baseUser);

    process.env.APP_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(await verifySessionToken(token)).toBeNull();

    process.env.APP_ENCRYPTION_KEY = previousKey;
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T00:00:00.000Z'));

    const token = await createSessionToken(baseUser);

    vi.setSystemTime(new Date('2026-12-18T00:00:00.000Z'));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verifySessionToken('')).toBeNull();
    expect(await verifySessionToken('not-a-token')).toBeNull();
    expect(await verifySessionToken('a.b')).toBeNull();
  });

  it('extracts the token from a cookie header', () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === 'cookie'
          ? `other=1; ${SESSION_COOKIE_NAME}=abc.def; another=2`
          : null,
    };

    expect(extractSessionToken(headers)).toBe('abc.def');
  });

  it('extracts the token from an authorization header', () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? 'Bearer abc.def' : null,
    };

    expect(extractSessionToken(headers)).toBe('abc.def');
  });

  it('returns null when no credentials are present', () => {
    const headers = { get: () => null };
    expect(extractSessionToken(headers)).toBeNull();
  });
});
