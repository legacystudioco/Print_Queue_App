import { screenshotFileNameSchema } from '@print-queue/shared';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const JOB_SCREENSHOTS_BUCKET = 'job-screenshots';

/** Sanitizes an arbitrary uploaded filename into a safe storage-path segment. */
function sanitizeFileName(rawName: string): string {
  const trimmed = rawName.trim();
  const withoutPath = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

export function buildScreenshotPath(jobId: string, originalFilename: string) {
  return `${jobId}/${sanitizeFileName(originalFilename)}`;
}

export function isAcceptedScreenshotName(filename: string): boolean {
  return screenshotFileNameSchema.safeParse(filename).success;
}

/**
 * Uploads a build-plate screenshot directly to Supabase Storage from the
 * browser (bypassing the Next.js server), using a raw XHR PUT against the
 * Storage REST API so we can report real upload progress — same mechanism
 * as the old lib/client/uploadPrintFile.ts, just pointed at the
 * job-screenshots bucket and keyed by job id rather than printer brand.
 */
export async function uploadJobScreenshot({
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
    throw new Error('You must be signed in to upload a screenshot.');
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${JOB_SCREENSHOTS_BUCKET}/${storagePath}`;

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
