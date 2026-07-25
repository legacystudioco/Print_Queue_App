import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRINT_FILES_BUCKET } from '../client/uploadPrintFile';
import type { Database } from '../supabase/database.types';

type Client = SupabaseClient<Database>;

/**
 * True if a job's sliced file still exists in the print-files bucket. A
 * print_jobs row's storage_path can outlive the object it points at (the
 * app's own delete route always removes both together — see
 * api/jobs/[id]/delete — but this doesn't assume that invariant holds for
 * every possible way an object could disappear). Used to gate History's
 * Requeue action, which reuses the original upload rather than asking for
 * the file again — see requeueJobFromHistory in lib/server/queue.ts.
 */
export async function printFileExists(supabase: Client, storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : storagePath.slice(0, lastSlash);
  const fileName = lastSlash === -1 ? storagePath : storagePath.slice(lastSlash + 1);

  const { data, error } = await supabase.storage.from(PRINT_FILES_BUCKET).list(dir, {
    search: fileName,
    limit: 1,
  });

  if (error) {
    console.warn('printFileExists: storage list failed — treating as missing', {
      storagePath,
      error: error.message,
    });
    return false;
  }

  return (data ?? []).some((entry) => entry.name === fileName);
}

/** Batched form of printFileExists for rendering a whole list (e.g. History) without one request-per-item. */
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
