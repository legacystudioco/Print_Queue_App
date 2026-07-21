import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env';

/**
 * Service-role client. Bypasses RLS entirely — never import this from a
 * Client Component and never send its results straight to the browser
 * without re-checking authorization yourself. Restricted to trusted
 * server-side code paths: route handlers / server actions that have
 * already validated the caller's role.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
