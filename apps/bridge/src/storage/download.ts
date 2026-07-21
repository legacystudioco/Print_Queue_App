import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BridgeSupabaseClient } from '../lib/supabase.js';

const PRINT_FILES_BUCKET = 'print-files';

/** Downloads a private storage object to a job-scoped temp file, creating TEMP_DIRECTORY if needed. */
export async function downloadPrintFile(
  supabase: BridgeSupabaseClient,
  tempDirectory: string,
  storagePath: string,
  jobId: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(PRINT_FILES_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download ${storagePath} from storage: ${error?.message ?? 'unknown error'}`);
  }

  await fs.mkdir(tempDirectory, { recursive: true });
  const localFilePath = path.join(tempDirectory, `${jobId}-${path.basename(storagePath)}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localFilePath, buffer);

  return localFilePath;
}

export async function cleanupTempFile(localFilePath: string): Promise<void> {
  await fs.rm(localFilePath, { force: true });
}
