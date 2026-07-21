import 'server-only';

/**
 * Standardized on Supabase's current API-key naming (publishable/secret),
 * not the legacy anon/service_role names — both are accepted by the
 * Supabase SDK interchangeably (it just takes a key string), so there is
 * no functional difference, but keeping exactly one naming scheme avoids
 * ambiguity about which key goes where. See docs/setup-supabase.md.
 *
 * Server-only, deliberately: `requireEnv` uses dynamic `process.env[name]`
 * lookup, which Next.js can only inline for real `process.env` access at
 * runtime (Node/Edge) — it can NEVER be statically replaced into a client
 * bundle the way a literal `process.env.NEXT_PUBLIC_X` can, and silently
 * resolves to `undefined` in the browser. Client-bundled code must use
 * ./clientEnv.ts instead, which uses literal references for exactly this
 * reason. The `server-only` import below turns any accidental client
 * import of this module into a build-time error instead of a silent
 * runtime failure.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_URL');
}

/** Public, browser-safe key. Subject to RLS at all times. */
export function getSupabasePublishableKey(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

/** Server-only. Bypasses RLS. Never import this module from a Client Component. */
export function getSupabaseSecretKey(): string {
  return requireEnv('SUPABASE_SECRET_KEY');
}
