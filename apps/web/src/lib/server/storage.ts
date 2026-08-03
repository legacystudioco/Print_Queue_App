import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRINT_FILES_BUCKET } from '../client/uploadPrintFile';
import { JOB_SCREENSHOTS_BUCKET } from '../client/uploadJobScreenshot';
import type { Database } from '../supabase/database.types';

type Client = SupabaseClient<Database>;

/** Generalized form of `printFileExists`, checking a bucket-relative storage path. */
async function objectExists(supabase: Client, bucket: string, storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : storagePath.slice(0, lastSlash);
  const fileName = lastSlash === -1 ? storagePath : storagePath.slice(lastSlash + 1);

  const { data, error } = await supabase.storage.from(bucket).list(dir, {
    search: fileName,
    limit: 1,
  });

  if (error) {
    console.warn('objectExists: storage list failed — treating as missing', {
      bucket,
      storagePath,
      error: error.message,
    });
    return false;
  }

  return (data ?? []).some((entry) => entry.name === fileName);
}

/**
 * True if a job's screenshot still exists in the job-screenshots bucket.
 * Used to gate History's Requeue action, which reuses the original
 * screenshot rather than asking for one again — see
 * requeueBoardJobFromHistory in lib/server/queue.ts.
 */
export async function screenshotExists(supabase: Client, storagePath: string): Promise<boolean> {
  return objectExists(supabase, JOB_SCREENSHOTS_BUCKET, storagePath);
}

/** Batched form of screenshotExists for rendering a whole list (e.g. History) without one request-per-item. */
export async function getScreenshotAvailability(
  supabase: Client,
  storagePaths: string[],
): Promise<Map<string, boolean>> {
  const uniquePaths = [...new Set(storagePaths)];
  const entries = await Promise.all(
    uniquePaths.map(async (storagePath) => [storagePath, await screenshotExists(supabase, storagePath)] as const),
  );
  return new Map(entries);
}

/**
 * True if a job's sliced file still exists in the print-files bucket
 * (archived printer-automation era — kept only so the archived Requeue
 * code path, if ever restored, still has this to call). A print_jobs
 * row's storage_path can outlive the object it points at.
 */
export async function printFileExists(supabase: Client, storagePath: string): Promise<boolean> {
  return objectExists(supabase, PRINT_FILES_BUCKET, storagePath);
}

/** Batched form of printFileExists — archived alongside it (see above). */
export async function getPrintFileAvailability(
  supabase: Client,
  storagePaths: string[],
): Promise<Map<string, boolean>> {
  const uniquePaths = [...new Set(storagePaths)];
  const entries = await Promise.all(
    uniquePaths.map(async (storagePath) => [storagePath, await printFileExists(supabase, storagePath)] as const),
  );
  return new Map(entries);
}
