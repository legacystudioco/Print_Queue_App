/**
 * Env var access for browser-bundle code that isn't Supabase-specific — see
 * lib/supabase/clientEnv.ts for why this must be a literal
 * `process.env.NEXT_PUBLIC_X` reference, not dynamic indexing.
 */
export function getVapidPublicKey(): string {
  const value = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  }
  return value;
}
