import 'server-only';

/** Bridge heartbeats every HEARTBEAT_INTERVAL_MS (20-30s); allow 1.5x slack. */
export const BRIDGE_ONLINE_THRESHOLD_MS = 45_000;

export function isBridgeOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < BRIDGE_ONLINE_THRESHOLD_MS;
}
