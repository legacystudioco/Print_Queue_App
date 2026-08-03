import {
  ACCEPTED_SCREENSHOT_EXTENSIONS,
  ACCEPTED_SCREENSHOT_MIME_TYPES,
  screenshotFileNameSchema,
  screenshotFileSizeSchema,
} from '@print-queue/shared';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const JOB_SCREENSHOTS_BUCKET = 'job-screenshots';

/** Sanitizes an arbitrary uploaded filename into a safe storage-path segment. */
function sanitizeFileName(rawName: string): string {
  const trimmed = rawName.trim();
  const withoutPath = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

/**
 * A short unique token per upload so a replacement (Edit Job) never
 * collides with the still-live object at the job's old path — the old
 * object is only deleted *after* the new one is uploaded and the job
 * record is updated to point at it, so the two paths must never match.
 */
function buildScreenshotPathToken(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export function buildScreenshotPath(jobId: string, originalFilename: string) {
  return `${jobId}/${buildScreenshotPathToken()}-${sanitizeFileName(originalFilename)}`;
}

export function isAcceptedScreenshotName(filename: string): boolean {
  return screenshotFileNameSchema.safeParse(filename).success;
}

/**
 * Validates a candidate screenshot file against both its filename extension
 * and (when the browser actually reports one) its MIME type, plus the
 * shared size limit — returns a human-readable error, or null if the file
 * is acceptable. MIME is checked only when `file.type` is non-empty: many
 * browsers/OSes report an empty type for HEIC/HEIF, so an empty type falls
 * back to trusting the extension check rather than rejecting a legitimate
 * photo.
 */
export function validateScreenshotFile(file: File): string | null {
  const extensionOk = isAcceptedScreenshotName(file.name);
  const mimeOk = !file.type || ACCEPTED_SCREENSHOT_MIME_TYPES.includes(file.type.toLowerCase());
  if (!extensionOk || !mimeOk) {
    return `File must be an image (${ACCEPTED_SCREENSHOT_EXTENSIONS.join(', ')})`;
  }
  const sizeCheck = screenshotFileSizeSchema.safeParse(file.size);
  if (!sizeCheck.success) {
    return sizeCheck.error.issues[0]?.message ?? 'Image is too large';
  }
  return null;
}

export interface ScreenshotFilePick {
  file: File | null;
  error: string | null;
}

/**
 * Picks the first valid screenshot out of a native drop's FileList (or a
 * plain array) — a job supports exactly one screenshot, so any extra
 * dropped files are silently ignored beyond a message explaining why.
 * Used by both ImageDropZone's own drop handler and the board columns'
 * lighter "drop here to create a job" targets, so the one-image rule and
 * validation logic live in exactly one place.
 */
export function pickScreenshotFile(files: FileList | File[]): ScreenshotFilePick {
  const list = Array.from(files);
  if (list.length === 0) return { file: null, error: null };

  if (list.length > 1) {
    const firstValid = list.find((candidate) => validateScreenshotFile(candidate) === null);
    return firstValid
      ? { file: firstValid, error: 'Only one screenshot is used per job — the first valid image was selected.' }
      : { file: null, error: 'Only one screenshot is used per job, and none of the dropped files were a supported image.' };
  }

  const only = list[0]!;
  const error = validateScreenshotFile(only);
  return error ? { file: null, error } : { file: only, error: null };
}

/**
 * Best-effort, pre-drop guess at whether a native drag carries an
 * unsupported file type, using `DataTransferItem.type` (the only thing the
 * browser exposes before drop, for security reasons — no filename or
 * content). An empty type (common for HEIC, or when the OS doesn't know)
 * is treated as "could be valid" rather than flagged, since real validation
 * always re-runs on drop via `validateScreenshotFile`.
 */
export function dataTransferLooksInvalid(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  const fileItems = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === 'file');
  if (fileItems.length === 0) return false;
  return fileItems.every((item) => item.type && !ACCEPTED_SCREENSHOT_MIME_TYPES.includes(item.type.toLowerCase()));
}

/**
 * Deletes a screenshot object from storage — used to clean up after a
 * replaced or failed upload (see EditJobForm's save sequence). Never
 * throws; callers treat failure as best-effort/log-only.
 */
export async function deleteJobScreenshot(storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(JOB_SCREENSHOTS_BUCKET).remove([storagePath]);
  return error ? { ok: false, error: error.message } : { ok: true };
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
