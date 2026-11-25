import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url?: string;
  serviceRoleKey?: string;
}

/**
 * Server-only Supabase client. Uses the service role key, which bypasses RLS.
 * Never import this from a browser component or expose the key through
 * `NEXT_PUBLIC_*`.
 */
export function createSupabaseClient(config: SupabaseConfig = {}): SupabaseClient {
  const url = config.url ?? process.env.SUPABASE_URL;
  const serviceRoleKey = config.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type CompanionSupabaseClient = SupabaseClient;
