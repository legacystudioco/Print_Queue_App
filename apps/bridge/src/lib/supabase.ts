import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import type { BridgeConfig } from '../config.js';
import type { Database } from './database.types.js';

export type BridgeSupabaseClient = ReturnType<typeof createBridgeSupabaseClient>;

/**
 * Secret-key client — the bridge always bypasses RLS by design (see
 * docs/security.md). The bridge is a plain Node.js process (not bundled
 * through Next.js, unlike the web app), and @supabase/supabase-js always
 * constructs a Realtime client internally even though the bridge never
 * subscribes to anything — on Node <22 that throws immediately unless a
 * WebSocket implementation is supplied explicitly. `ws`'s types don't
 * exactly match @supabase/realtime-js's WebSocketLikeConstructor (a
 * known friction point between the two packages), hence the cast — `ws`
 * is otherwise a drop-in runtime implementation here.
 */
export function createBridgeSupabaseClient(config: BridgeConfig) {
  return createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });
}
