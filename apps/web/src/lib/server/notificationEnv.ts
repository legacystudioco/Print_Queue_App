import 'server-only';

/** Same rationale as lib/supabase/env.ts's requireEnv — server-only, dynamic env lookup. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Same value as lib/client/env.ts's getVapidPublicKey — duplicated (not imported) so server code never reaches into a browser-bundle module. */
export function getVapidPublicKey(): string {
  return requireEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
}

export function getVapidPrivateKey(): string {
  return requireEnv('VAPID_PRIVATE_KEY');
}

export function getVapidSubject(): string {
  return requireEnv('VAPID_SUBJECT');
}

/** Shared secret the bridge sends on POST /api/notifications/dispatch — proves the request came from our own bridge, not the public internet. */
export function getNotifyWebhookSecret(): string {
  return requireEnv('NOTIFY_WEBHOOK_SECRET');
}
