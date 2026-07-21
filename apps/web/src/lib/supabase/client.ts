'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/** Browser client — uses the anon key only. Subject to RLS at all times. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
