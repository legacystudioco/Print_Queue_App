/**
 * Env var access for code that runs in the browser bundle.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` by literal, static
 * text-replacement at build time — it does NOT evaluate `process.env` as a
 * real object in client code. Dynamic access like `process.env[name]`
 * (see ../env.ts, which is for server-only code) can never be replaced
 * this way and silently resolves to `undefined` in production client
 * bundles. Every reference here must therefore be a direct, literal
 * `process.env.NEXT_PUBLIC_X` expression — no helper indirection through
 * a variable name.
 *
 * This module must never import or reference server-only variables
 * (SUPABASE_SECRET_KEY, APP_URL) — only the two NEXT_PUBLIC_ values that
 * are genuinely safe to ship to the browser.
 */

export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  return value;
}

export function getSupabasePublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return value;
}
