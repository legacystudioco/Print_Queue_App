import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JOB_SCREENSHOTS_BUCKET } from '../client/uploadJobScreenshot';
import type { Database } from '../supabase/database.types';

type Client = SupabaseClient<Database>;

/**
 * Copies a screenshot to a new storage object — used every time a screenshot
 * crosses a template/job boundary (or is duplicated within a template), so
 * the new record gets an independent object rather than sharing the source's
 * path. See migration 0020_job_templates.sql's header comment for why this
 * matters: it's what makes every template delete/archive path safe without
 * reference counting. Throws on failure — callers should not proceed to the
 * DB write with a half-copied screenshot.
 */
export async function copyScreenshot(admin: Client, fromPath: string, toPath: string): Promise<void> {
  const { error } = await admin.storage.from(JOB_SCREENSHOTS_BUCKET).copy(fromPath, toPath);
  if (error) throw new Error(`Failed to copy screenshot: ${error.message}`);
}

/**
 * Best-effort cleanup of screenshots this request copied, called only when
 * the DB write that was supposed to consume them fails — mirrors the
 * existing non-throwing `deleteJobScreenshot` client helper's risk
 * tolerance (DB atomicity comes from the RPC; this is tidy-up only, never
 * something a request should fail over).
 */
export async function deleteScreenshotsBestEffort(admin: Client, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(JOB_SCREENSHOTS_BUCKET).remove(paths);
  if (error) {
    console.warn('deleteScreenshotsBestEffort: failed to remove screenshot(s)', { paths, error: error.message });
  }
}
