/**
 * Hyunk AI Hub - Session Token Utilities (Runtime Agnostic)
 *
 * This module is intentionally dependency-free (no `node:crypto`, no `next/headers`)
 * so it can be safely bundled into the Next.js Edge Runtime (middleware) as well as
 * the Node.js server runtime (route handlers).
 *
 * Tokens are HMAC-SHA256 signed payloads encoded as `base64url(payload).hex(hmac)`.
 */

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatarUrl?: string;
  createdAt: string;
}

export const SESSION_COOKIE_NAME = 'hyunk_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const textEncoder = new TextEncoder();

/**
 * Resolves the HMAC signing secret.
 * Priority: APP_ENCRYPTION_KEY -> SUPABASE_SERVICE_ROLE_KEY -> development fallback.
 */
export function getSigningSecret(): string {
  return (
    process.env.APP_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'hyunk-ai-hub-auth-secret-key-2026'
  );
}

function getSubtleCrypto(): SubtleCrypto {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!globalCrypto || !globalCrypto.subtle) {
    throw new Error('WebCrypto SubtleCrypto is not available in this runtime.');
  }
  return globalCrypto.subtle;
}

/**
 * Computes a hex encoded HMAC-SHA256 signature using the Web Crypto API.
 */
async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await subtle.sign('HMAC', key, textEncoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison (length-safe).
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function base64UrlEncode(input: string): string {
  const bytes = textEncoder.encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Creates a signed, tamper-proof session token.
 */
export async function createSessionToken(user: UserSession): Promise<string> {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const base64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Hex(getSigningSecret(), base64);
  return `${base64}.${signature}`;
}

/**
 * Verifies and decodes a session token. Returns null when invalid, tampered or expired.
 */
export async function verifySessionToken(token: string): Promise<UserSession | null> {
  if (!token || !token.includes('.')) return null;

  try {
    const separatorIndex = token.lastIndexOf('.');
    const base64 = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    if (!base64 || !signature) return null;

    const expectedSig = await hmacSha256Hex(getSigningSecret(), base64);
    if (!timingSafeEqualStr(signature, expectedSig)) {
      return null;
    }

    const parsed = JSON.parse(base64UrlDecode(base64));
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.exp && Date.now() > parsed.exp) {
      return null; // Expired
    }

    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role || 'user',
      avatarUrl: parsed.avatarUrl,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts a raw session token from a cookie header string or an authorization header.
 */
export function extractSessionToken(headers: {
  get(name: string): string | null;
}): string | null {
  const authHeader = headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) return bearerToken;
  }

  const cookieHeader = headers.get('cookie');
  if (cookieHeader) {
    const cookiesList = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookiesList) {
      if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
        const val = c.substring(SESSION_COOKIE_NAME.length + 1).trim();
        if (val) return val;
      }
    }
  }

  return null;
}
