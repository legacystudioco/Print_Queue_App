// Vitest runs outside Next.js's webpack pipeline, which is what normally
// turns the real "server-only" package into a build-time guard. This stub
// makes it a no-op under test instead of throwing unconditionally.
export {};
