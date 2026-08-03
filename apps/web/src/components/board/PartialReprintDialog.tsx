'use client';

import { businessLabels, formatPrintTime, screenshotFileSizeSchema } from '@print-queue/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { buildScreenshotPath, isAcceptedScreenshotName, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';
import type { BoardJob } from '../queue/types';

/**
 * The Partial workflow (see the product spec): clicking "Partial" on a
 * printing job always marks it Partial — it stays in History with that
 * status, original data intact. This dialog then asks whether to create a
 * follow-up reprint job for just the failed parts; if so, it copies
 * business/colors/notes/estimated time from the source job and only asks
 * for a new screenshot showing the failed parts.
 */
export function PartialReprintDialog({
  job,
  open,
  onClose,
  onDone,
}: {
  job: BoardJob;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [createReprint, setCreateReprint] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setCreateReprint(true);
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

    if (createReprint && !file) {
      setSubmitError('Upload a screenshot of the failed parts, or uncheck "Create a follow-up reprint job"');
      return;
    }

    setSubmitting(true);
    try {
      const statusRes = await fetch(`/api/jobs/${job.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'partial' }),
      });
      if (!statusRes.ok) {
        const body = await statusRes.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to mark job Partial');
      }

      if (createReprint && file) {
        const newJobId = crypto.randomUUID();
        const storagePath = buildScreenshotPath(newJobId, file.name);
        setProgress(0);
        await uploadJobScreenshot({ file, storagePath, onProgress: setProgress });

        const reprintRes = await fetch(`/api/jobs/${job.id}/partial-reprint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshotPath: storagePath }),
        });
        if (!reprintRes.ok) {
          const body = await reprintRes.json().catch(() => ({}));
          throw new Error(body.error ?? 'Job marked Partial, but the reprint could not be created');
        }
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
    <Modal open={open} onClose={handleClose} title={`Mark "${job.name}" Partial`}>
      <div className="space-y-4">
        <p className="text-sm text-charcoal-600">
          The original job stays in History as Partial. You can optionally queue a follow-up job for just the
          parts that failed.
        </p>

        <label className="flex items-center gap-2 text-sm font-medium text-charcoal-900">
          <input
            type="checkbox"
            checked={createReprint}
            onChange={(e) => setCreateReprint(e.target.checked)}
            className="h-4 w-4 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
          />
          Create a follow-up reprint job
        </label>

        {createReprint && (
          <div className="space-y-3 rounded-xl border border-charcoal-200 p-3">
            <div>
              <label htmlFor="reprint-screenshot" className="mb-1 block text-sm font-medium text-charcoal-700">
                Screenshot of the failed parts
              </label>
              <input
                id="reprint-screenshot"
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

            <div className="space-y-1 text-xs text-charcoal-500">
              <p className="font-semibold uppercase tracking-wide text-charcoal-400">Copied to the reprint</p>
              <p>Business: {businessLabels[job.business]}</p>
              <p>Colors: {job.colors || '—'}</p>
              <p>Notes: {job.notes || '—'}</p>
              <p>
                Est. time:{' '}
                {job.estimatedDurationSeconds
                  ? formatPrintTime(Math.round(job.estimatedDurationSeconds / 60))
                  : '—'}
              </p>
            </div>
          </div>
        )}

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
            {createReprint ? 'Mark Partial & Queue Reprint' : 'Mark Partial'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
