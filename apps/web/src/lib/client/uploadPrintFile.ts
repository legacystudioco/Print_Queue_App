import { sanitizeFileName } from '@print-queue/shared';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const PRINT_FILES_BUCKET = 'print-files';

export function buildStoragePath(printerId: string, jobId: string, originalFilename: string) {
  return `${printerId}/${jobId}/${sanitizeFileName(originalFilename)}`;
}

/**
 * Uploads directly to Supabase Storage from the browser (bypassing the
 * Next.js server) so large sliced-plate files never touch a serverless
 * function body-size limit. Uses a raw XHR PUT against the Storage REST
 * API so we can report real upload progress — supabase-js's storage
 * client does not expose progress events.
 */
export async function uploadPrintFile({
  file,
  storagePath,
  onProgress,
}: {
  file: File;
  storagePath: string;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to upload a file.');
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PRINT_FILES_BUCKET}/${storagePath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));

    xhr.send(file);
  });
}
