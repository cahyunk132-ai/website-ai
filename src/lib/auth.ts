/**
 * Hyunk AI Hub - Authentication & Session Management Layer
 * Supports Supabase Auth (with admin auto-confirm) and secure local cryptographic fallback.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatarUrl?: string;
  createdAt: string;
}

interface LocalStoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export const SESSION_COOKIE_NAME = 'hyunk_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Secret key for signing session tokens
function getSigningSecret(): string {
  return process.env.APP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'hyunk-ai-hub-auth-secret-key-2026';
}

// In-memory local user store fallback
const memoryUsers = new Map<string, LocalStoredUser>();

// Initialize default admin and demo user in local memory store
function ensureDefaultUsers() {
  if (memoryUsers.size === 0) {
    const adminSalt = crypto.randomBytes(16).toString('hex');
    const adminHash = crypto.scryptSync('Password123!', adminSalt, 64).toString('hex');
    memoryUsers.set('admin@hyunkai.com', {
      id: '6a2ed95e-ddfb-4845-8ccd-29aaddc0e4ee',
      email: 'admin@hyunkai.com',
      name: 'Admin Hyunk',
      passwordHash: adminHash,
      salt: adminSalt,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });

    const demoSalt = crypto.randomBytes(16).toString('hex');
    const demoHash = crypto.scryptSync('demo1234', demoSalt, 64).toString('hex');
    memoryUsers.set('demo@hyunkai.com', {
      id: 'demo-user-hyunk-001',
      email: 'demo@hyunkai.com',
      name: 'Demo User',
      passwordHash: demoHash,
      salt: demoSalt,
      role: 'user',
      createdAt: new Date().toISOString(),
    });
  }
}

ensureDefaultUsers();

// Password hashing helpers
function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

/**
 * Creates a signed, tamper-proof session token
 */
export function createSessionToken(user: UserSession): string {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const jsonStr = JSON.stringify(payload);
  const base64 = Buffer.from(jsonStr, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(base64)
    .digest('hex');

  return `${base64}.${signature}`;
}

/**
 * Verifies and decodes a session token
 */
export function verifySessionToken(token: string): UserSession | null {
  if (!token || !token.includes('.')) return null;

  try {
    const [base64, signature] = token.split('.');
    if (!base64 || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(base64)
      .digest('hex');

    // Constant-time comparison
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(base64, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);

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
 * Helper to get a Supabase Admin Client
 */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createSupabaseClient(url, anonKey);
}

/**
 * Registers a new user.
 * Uses Supabase admin createUser (auto-confirmed) if available, with local cryptographic fallback.
 */
export async function registerUser(
  emailInput: string,
  passwordInput: string,
  nameInput?: string
): Promise<{ user: UserSession; token: string }> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;
  const name = (nameInput || email.split('@')[0] || 'User').trim();

  if (!email || !email.includes('@')) {
    throw new Error('Format email tidak valid.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password minimal harus 6 karakter.');
  }

  ensureDefaultUsers();

  let userId: string = crypto.randomUUID();
  let role: 'admin' | 'user' = 'user';
  if (email.includes('admin')) {
    role = 'admin';
  }

  // 1. Attempt Supabase Admin Registration
  const adminClient = getSupabaseAdmin();
  if (adminClient) {
    try {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          throw new Error('Email ini sudah terdaftar. Silakan login.');
        }
        // If other error, log and fallback
        console.warn('Supabase admin.createUser warning:', error.message);
      } else if (data?.user) {
        userId = data.user.id;
      }
    } catch (err: any) {
      if (err.message && err.message.includes('sudah terdaftar')) {
        throw err;
      }
      console.warn('Supabase registration fallback triggered:', err.message);
    }
  }

  // 2. Also register in local memory store
  if (memoryUsers.has(email)) {
    throw new Error('Email ini sudah terdaftar di sistem. Silakan login.');
  }

  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();
  memoryUsers.set(email, {
    id: userId,
    email,
    name,
    passwordHash: hash,
    salt,
    role,
    createdAt: now,
  });

  const sessionUser: UserSession = {
    id: userId,
    email,
    name,
    role,
    createdAt: now,
  };

  const token = createSessionToken(sessionUser);
  return { user: sessionUser, token };
}

/**
 * Authenticates a user with email and password.
 */
export async function loginUser(
  emailInput: string,
  passwordInput: string
): Promise<{ user: UserSession; token: string }> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;

  if (!email || !password) {
    throw new Error('Email dan password wajib diisi.');
  }

  ensureDefaultUsers();

  // 1. Try Supabase Anon Sign In
  const anonClient = getSupabaseAnon();
  if (anonClient) {
    try {
      const { data, error } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.user) {
        const u = data.user;
        const name = u.user_metadata?.name || email.split('@')[0];
        const role = u.user_metadata?.role || (email.includes('admin') ? 'admin' : 'user');
        const sessionUser: UserSession = {
          id: u.id,
          email: u.email || email,
          name,
          role,
          createdAt: u.created_at || new Date().toISOString(),
        };
        const token = createSessionToken(sessionUser);
        return { user: sessionUser, token };
      }
    } catch (err: any) {
      // Fallback to local check
    }
  }

  // 2. Check Local Fallback Store
  const localUser = memoryUsers.get(email);
  if (localUser) {
    const isMatch = verifyPassword(password, localUser.passwordHash, localUser.salt);
    if (isMatch) {
      const sessionUser: UserSession = {
        id: localUser.id,
        email: localUser.email,
        name: localUser.name,
        role: localUser.role,
        createdAt: localUser.createdAt,
      };
      const token = createSessionToken(sessionUser);
      return { user: sessionUser, token };
    }
  }

  throw new Error('Email atau password salah.');
}

/**
 * Retrieves the current session from Next.js server cookies
 */
export async function getSessionFromCookies(): Promise<UserSession | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Retrieves the current session from an incoming Request object (Cookie or Authorization header)
 */
export async function getSessionFromRequest(request: Request): Promise<UserSession | null> {
  try {
    // 1. Check Authorization header
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7).trim();
      const user = verifySessionToken(bearerToken);
      if (user) return user;
    }

    // 2. Check Cookie header
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookiesList = cookieHeader.split(';').map((c) => c.trim());
      for (const c of cookiesList) {
        if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
          const val = c.substring(SESSION_COOKIE_NAME.length + 1).trim();
          const user = verifySessionToken(val);
          if (user) return user;
        }
      }
    }

    // 3. Fallback to cookies() helper
    return await getSessionFromCookies();
  } catch {
    return null;
  }
}

/**
 * Builds HTTP response headers with the session cookie set
 */
export function buildSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${
    isProd ? '; Secure' : ''
  }`;
}

/**
 * Builds HTTP response headers to clear the session cookie
 */
export function buildClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
