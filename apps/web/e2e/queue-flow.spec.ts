import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Full-stack end-to-end test: admin queues two jobs, operator starts the
 * first one through the checklist, a real bridge process (PRINTER_ADAPTER=mock)
 * carries it through to completion, and the queue advances — with no
 * automatic start of the second job.
 *
 * Requires a live Supabase project seeded with an admin + operator account
 * (see docs/testing.md) AND a bridge process already running in mock mode
 * against that same project. Skipped entirely unless the E2E_* env vars are
 * set, since none of that infrastructure exists in a plain `pnpm test` run.
 */
const requiredEnv = [
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_OPERATOR_EMAIL',
  'E2E_OPERATOR_PASSWORD',
];
const canRun = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe('full print queue lifecycle', () => {
  test.skip(!canRun, `Set ${requiredEnv.join(', ')} (and run a mock bridge) to enable this test.`);

  test('admin queues jobs, operator starts one, bridge carries it to completion', async ({
    page,
    browser,
  }) => {
    const adminEmail = process.env.E2E_ADMIN_EMAIL!;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD!;
    const operatorEmail = process.env.E2E_OPERATOR_EMAIL!;
    const operatorPassword = process.env.E2E_OPERATOR_PASSWORD!;

    const jobNameA = `E2E Job A ${Date.now()}`;
    const jobNameB = `E2E Job B ${Date.now()}`;

    // 1. Admin logs in.
    await page.goto('/login');
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // 2 & 3. Admin uploads two jobs and configures AMS instructions.
    for (const name of [jobNameA, jobNameB]) {
      await page.goto('/queue/add');
      await page
        .locator('#file')
        .setInputFiles(path.join(__dirname, 'fixtures/test-print.gcode.3mf'));
      await page.locator('#name').fill(name);
      // Mark AMS slot 1 as used with a color so validation passes.
      await page.getByText('Slot 1').locator('..').getByLabel('Used').check();
      await page
        .getByPlaceholder('Color (e.g. Orange)')
        .first()
        .fill('Orange');
      await page.getByRole('button', { name: 'Add to Queue' }).click();
      await expect(page).toHaveURL(/\/queue$/);
    }

    // 4. Queue shows both jobs.
    await expect(page.getByText(jobNameA)).toBeVisible();
    await expect(page.getByText(jobNameB)).toBeVisible();

    // 5. Operator logs in (fresh context so we don't share the admin session).
    const operatorContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto('/login');
    await operatorPage.getByLabel('Email').fill(operatorEmail);
    await operatorPage.getByLabel('Password').fill(operatorPassword);
    await operatorPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(operatorPage).toHaveURL(/\/dashboard/);

    // 6. Operator opens the next-print screen.
    await operatorPage.goto('/start-next');
    await expect(operatorPage.getByText(jobNameA)).toBeVisible();

    // 7. Operator completes all three confirmations.
    await operatorPage.getByLabel('Previous print has been removed').check();
    await operatorPage.getByLabel('Build plate is installed and clear').check();
    await operatorPage.getByLabel('AMS slots match the setup shown above').check();

    // 8. Operator starts the first job.
    await operatorPage.getByRole('button', { name: `Start ${jobNameA}` }).click();

    // 9 & 10. Mock bridge claims the command and the job moves to printing.
    await expect(async () => {
      await operatorPage.goto(`/queue`);
      await expect(operatorPage.getByText(jobNameA)).toBeVisible();
    }).toPass({ timeout: 30_000 });

    // 11. Nudge the mock bridge to finish the print now rather than waiting
    // out its full simulated duration.
    await execFileAsync('pnpm', ['--filter', 'bridge', 'sim', 'complete']);

    // 12 & 13. First job moves to history, second job becomes next.
    await expect(async () => {
      await operatorPage.goto('/history');
      await expect(operatorPage.getByText(jobNameA)).toBeVisible();
    }).toPass({ timeout: 30_000 });

    await operatorPage.goto('/start-next');
    await expect(operatorPage.getByText(jobNameB)).toBeVisible();

    // 14. No automatic print started for job B.
    await operatorPage.goto('/dashboard');
    await expect(operatorPage.getByText('Nothing printing right now.')).toBeVisible();

    await operatorContext.close();
  });
});
