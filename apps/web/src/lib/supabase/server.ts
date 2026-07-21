import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Server client for use in Server Components, Server Actions, and Route
 * Handlers. Uses the anon key and the caller's session cookie, so RLS
 * applies exactly as it would in the browser.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component with no response to write to;
          // middleware handles session refresh in that case instead.
        }
      },
    },
  });
}
