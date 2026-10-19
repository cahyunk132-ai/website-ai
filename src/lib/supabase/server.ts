/**
 * Hyunk AI Hub - Server Supabase Provider
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function createServerSupabaseClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Can be ignored if called from Server Component
        }
      },
    },
  });
}

/**
 * Creates a service-role (admin) Supabase client for server side only operations.
 *
 * Used for operations that are performed on behalf of an authenticated application
 * user (quota accounting, folder persistence, ...). The service role bypasses RLS,
 * which is required because this application uses its own signed session cookie
 * instead of a Supabase Auth session.
 *
 * Falls back to the anon client when no service role key is configured so that
 * local development keeps working (RLS then applies as usual).
 */
export function createServerSupabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return createServerSupabaseClient();
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
