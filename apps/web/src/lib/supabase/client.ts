'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { getSupabasePublishableKey, getSupabaseUrl } from './env';

/** Browser client — uses the publishable key only. Subject to RLS at all times. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey());
}
