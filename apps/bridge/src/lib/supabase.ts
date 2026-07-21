import { createClient } from '@supabase/supabase-js';
import type { BridgeConfig } from '../config.js';
import type { Database } from './database.types.js';

export type BridgeSupabaseClient = ReturnType<typeof createBridgeSupabaseClient>;

/** Service-role client — the bridge always bypasses RLS by design (see docs/security.md). */
export function createBridgeSupabaseClient(config: BridgeConfig) {
  return createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
