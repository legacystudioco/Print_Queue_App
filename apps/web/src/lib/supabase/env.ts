/**
 * Standardized on Supabase's current API-key naming (publishable/secret),
 * not the legacy anon/service_role names — both are accepted by the
 * Supabase SDK interchangeably (it just takes a key string), so there is
 * no functional difference, but keeping exactly one naming scheme avoids
 * ambiguity about which key goes where. See docs/setup-supabase.md.
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
