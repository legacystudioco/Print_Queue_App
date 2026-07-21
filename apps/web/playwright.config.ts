import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests exercise the full stack (web app + Supabase) and
 * therefore need a real Supabase project (local or hosted) seeded with an
 * admin and operator account — see docs/testing.md. They are NOT run as
 * part of `pnpm test`; run them explicitly with `pnpm test:e2e` once
 * E2E_BASE_URL / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_OPERATOR_EMAIL /
 * E2E_OPERATOR_PASSWORD are set.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
