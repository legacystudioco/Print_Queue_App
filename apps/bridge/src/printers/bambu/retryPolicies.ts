/** Small retry-with-backoff helper shared by the Bambu connection/upload/command modules. */
export interface RetryOptions {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, initialDelayMs, maxDelayMs = 10_000 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
