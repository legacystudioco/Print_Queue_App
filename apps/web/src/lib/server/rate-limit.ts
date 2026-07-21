import 'server-only';

/**
 * Minimal in-memory sliding-window rate limiter for sensitive routes
 * (start-next, retry, printer commands). This is a two-person household
 * app on Vercel — a per-instance in-memory limiter is sufficient to blunt
 * accidental double-taps/scripting and is NOT a substitute for a shared
 * store in a multi-instance deployment. If Vercel cold-starts a new
 * instance the window resets, which is an acceptable tradeoff here.
 */
const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= limit) {
    const oldestInWindow = existing[0] ?? now;
    hits.set(key, existing);
    return { allowed: false, remaining: 0, retryAfterMs: oldestInWindow + windowMs - now };
  }

  existing.push(now);
  hits.set(key, existing);
  return { allowed: true, remaining: limit - existing.length };
}
