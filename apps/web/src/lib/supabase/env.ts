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

export function getSupabaseAnonKey(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/** Server-only. Never import this module from a Client Component. */
export function getSupabaseServiceRoleKey(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}
