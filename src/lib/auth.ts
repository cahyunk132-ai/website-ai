/**
 * Hyunk AI Hub - Authentication & Session Management Layer
 * Supports Supabase Auth (with admin auto-confirm) and secure local cryptographic fallback.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  UserSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from './sessionToken';

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken };
export type { UserSession };

interface LocalStoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  createdAt: string;
}

// In-memory local user store fallback.
// Kept on `globalThis` so that every route bundle shares the same store
// (Next.js bundles each route handler separately).
const MEMORY_USERS_KEY = Symbol.for('hyunk-ai-hub.memory-users');
const globalScope = globalThis as unknown as Record<symbol, Map<string, LocalStoredUser> | undefined>;
if (!globalScope[MEMORY_USERS_KEY]) {
  globalScope[MEMORY_USERS_KEY] = new Map<string, LocalStoredUser>();
}
const memoryUsers = globalScope[MEMORY_USERS_KEY] as Map<string, LocalStoredUser>;

/**
 * Default accounts that must exist in Supabase Auth so that the documented
 * credentials keep working after a cold start (in-memory maps are wiped).
 */
export const DEFAULT_USER_ACCOUNTS = [
  {
    email: 'admin@hyunkai.com',
    password: 'Password123!',
    name: 'Admin Hyunk',
    role: 'admin' as const,
  },
  {
    email: 'demo@hyunkai.com',
    password: 'demo1234',
    name: 'Demo User',
    role: 'user' as const,
  },
];

// Initialize default admin and demo user in local memory store
function ensureDefaultUsers() {
  if (memoryUsers.size === 0) {
    for (const account of DEFAULT_USER_ACCOUNTS) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(account.password, salt, 64).toString('hex');
      memoryUsers.set(account.email, {
        id: account.email === 'admin@hyunkai.com'
          ? '6a2ed95e-ddfb-4845-8ccd-29aaddc0e4ee'
          : 'demo-user-hyunk-001',
        email: account.email,
        name: account.name,
        passwordHash: hash,
        salt,
        role: account.role,
        createdAt: new Date().toISOString(),
      });
    }
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

// Guards the one-time seeding of the default accounts per server instance.
let defaultUsersSeeded = false;

/**
 * Ensures the default admin/demo accounts exist inside Supabase Auth.
 *
 * The in-memory `memoryUsers` map is wiped on every cold start (Vercel/serverless),
 * which would otherwise break the documented default credentials in production.
 * This function seeds the accounts once per process and keeps the local store in
 * sync with the real Supabase user ids (needed for UUID based foreign keys).
 */
export async function ensureDefaultUsersInSupabase(): Promise<void> {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) return;
  if (defaultUsersSeeded) return;

  defaultUsersSeeded = true;

  try {
    const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      defaultUsersSeeded = false;
      console.warn('[Auth] Unable to list Supabase users for default seeding:', error.message);
      return;
    }

    const existingUsers = data?.users || [];
    const existingByEmail = new Map(
      existingUsers
        .filter((u) => u.email)
        .map((u) => [u.email!.toLowerCase(), u])
    );

    for (const account of DEFAULT_USER_ACCOUNTS) {
      const existing = existingByEmail.get(account.email);

      if (!existing) {
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { name: account.name, role: account.role },
        });

        if (createError || !created?.user) {
          console.warn(
            `[Auth] Failed to seed default account ${account.email}:`,
            createError?.message || 'unknown error'
          );
          continue;
        }

        syncLocalUserId(account.email, created.user.id, account.name, account.role);
        continue;
      }

      // Account already exists: align the local fallback store with the real UUID.
      syncLocalUserId(account.email, existing.id, account.name, account.role);
    }
  } catch (err: any) {
    defaultUsersSeeded = false;
    console.warn('[Auth] Default user seeding failed:', err?.message || String(err));
  }
}

/**
 * Keeps the local (memory) user record aligned with the authoritative Supabase user id.
 */
function syncLocalUserId(
  email: string,
  supabaseUserId: string,
  name: string,
  role: 'admin' | 'user'
): void {
  const existing = memoryUsers.get(email);
  if (!existing) return;
  if (existing.id === supabaseUserId) return;
  memoryUsers.set(email, {
    ...existing,
    id: supabaseUserId,
    name: name || existing.name,
    role: role || existing.role,
  });
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
  await ensureDefaultUsersInSupabase();

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

  const token = await createSessionToken(sessionUser);
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
  await ensureDefaultUsersInSupabase();

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
        const token = await createSessionToken(sessionUser);
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
      const token = await createSessionToken(sessionUser);
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
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Retrieves the current session from an incoming Request object (Cookie or Authorization header)
 */
/**
 * Resolves the id of a locally stored account from its email address.
 *
 * Used by the premium panel when no database is configured, so an
 * administrator can still change the plan of the seeded demo account.
 */
export function findLocalUserIdByEmail(email: string): string | null {
  ensureDefaultUsers();
  const found = memoryUsers.get(email.trim().toLowerCase());
  return found?.id ?? null;
}

export async function getSessionFromRequest(request: Request): Promise<UserSession | null> {
  try {
    // 1. Check Authorization header
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7).trim();
      const user = await verifySessionToken(bearerToken);
      if (user) return user;
    }

    // 2. Check Cookie header
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookiesList = cookieHeader.split(';').map((c) => c.trim());
      for (const c of cookiesList) {
        if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
          const val = c.substring(SESSION_COOKIE_NAME.length + 1).trim();
          const user = await verifySessionToken(val);
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
