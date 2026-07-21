import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  it('allows requests up to the limit and then blocks', () => {
    const key = `test-${crypto.randomUUID()}`;
    const opts = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(key, opts).allowed).toBe(true);
    expect(checkRateLimit(key, opts).allowed).toBe(true);
    expect(checkRateLimit(key, opts).allowed).toBe(true);

    const fourth = checkRateLimit(key, opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks separate keys independently', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const keyA = `test-a-${crypto.randomUUID()}`;
    const keyB = `test-b-${crypto.randomUUID()}`;

    expect(checkRateLimit(keyA, opts).allowed).toBe(true);
    expect(checkRateLimit(keyB, opts).allowed).toBe(true);
    expect(checkRateLimit(keyA, opts).allowed).toBe(false);
  });

  it('allows requests again once the window has passed', () => {
    vi.useFakeTimers();
    try {
      const key = `test-window-${crypto.randomUUID()}`;
      const opts = { limit: 1, windowMs: 1000 };

      expect(checkRateLimit(key, opts).allowed).toBe(true);
      expect(checkRateLimit(key, opts).allowed).toBe(false);

      vi.advanceTimersByTime(1001);

      expect(checkRateLimit(key, opts).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
