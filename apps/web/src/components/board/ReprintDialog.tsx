'use client';

import { screenshotFileSizeSchema } from '@print-queue/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { buildScreenshotPath, isAcceptedScreenshotName, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';
import type { BoardPlate } from '../queue/types';

/**
 * Standalone "Reprint" action for a plate that's already Partial (see
 * PartialReprintDialog for the combined mark-Partial-and-reprint flow used
 * from `printing`). Copies colors/notes/estimated time from the source
 * plate under the same customer — only a new screenshot is required.
 */
export function ReprintDialog({
  plate,
  open,
  onClose,
  onDone,
}: {
  plate: BoardPlate;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setFile(null);
    setFileError(null);
    setProgress(null);
    setSubmitError(null);
    onClose();
  }

  function handleFileChange(selected: File | null) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!isAcceptedScreenshotName(selected.name)) {
      setFileError('File must be an image (.png, .jpg, .jpeg, .webp, .heic)');
      return;
    }
    if (!screenshotFileSizeSchema.safeParse(selected.size).success) {
      setFileError('Image is larger than the 20 MB limit');
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!file) {
      setSubmitError('Upload a screenshot for the reprint');
      return;
    }

    setSubmitting(true);
    try {
      const pathToken = crypto.randomUUID();
      const storagePath = buildScreenshotPath(pathToken, file.name);
      setProgress(0);
      await uploadJobScreenshot({ file, storagePath, onProgress: setProgress });

      const res = await fetch(`/api/plates/${plate.id}/reprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshotPath: storagePath }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create reprint');
      }

      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Reprint "${plate.plateName}"`}>
      <div className="space-y-4">
        <p className="text-sm text-charcoal-600">
          Creates &ldquo;{plate.plateName} - Reprint&rdquo; under the same customer, copying colors, notes, and
          estimated time.
        </p>

        <div>
          <label htmlFor="new-reprint-screenshot" className="mb-1 block text-sm font-medium text-charcoal-700">
            Screenshot
          </label>
          <input
            id="new-reprint-screenshot"
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full rounded-xl border border-charcoal-300 p-2 text-sm"
          />
          {fileError && <p className="mt-1 text-sm text-danger-600">{fileError}</p>}
          {progress != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-charcoal-100">
              <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {submitError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {submitError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={submitting}>
            Create Reprint
          </Button>
        </div>
      </div>
    </Modal>
  );
}
