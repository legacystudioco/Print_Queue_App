'use client';

import { addPlateSchema } from '@print-queue/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { Modal } from '@/components/ui/Modal';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface AddPlateFormValues {
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

/** "Add plate" from an existing customer card — adds one plate to a job that already exists, without recreating the customer. */
export function AddPlateDialog({
  jobId,
  open,
  onClose,
  onDone,
}: {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddPlateFormValues>({
    defaultValues: { plateName: '', colors: '', notes: '', estimatedDurationSeconds: undefined },
  });

  function handleClose() {
    setScreenshot(null);
    setUploadProgress(null);
    setSubmitError(null);
    reset();
    onClose();
  }

  async function onSubmit(values: AddPlateFormValues) {
    setSubmitError(null);

    if (!screenshot) {
      setSubmitError('Add a screenshot of the build plate');
      return;
    }

    const pathToken = crypto.randomUUID();
    const storagePath = buildScreenshotPath(pathToken, screenshot.name);

    const parsed = addPlateSchema.safeParse({
      plateName: values.plateName,
      screenshotPath: storagePath,
      colors: values.colors,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    try {
      setUploadProgress(0);
      await uploadJobScreenshot({ file: screenshot, storagePath, onProgress: setUploadProgress });

      const res = await fetch(`/api/jobs/${jobId}/plates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to add plate');
      }

      handleClose();
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
      setUploadProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Plate">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <ImageDropZone
          label="Add a screenshot of the build plate"
          hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
          file={screenshot}
          onFileChange={setScreenshot}
          imageAlt="Selected build plate screenshot"
          uploading={uploadProgress != null}
          uploadProgress={uploadProgress}
        />

        <div>
          <label htmlFor="add-plate-name" className="mb-1 block text-sm font-medium text-slate-700">
            Plate name
          </label>
          <input
            id="add-plate-name"
            type="text"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('plateName')}
          />
          {errors.plateName && <p className="mt-1 text-sm text-danger-600">{errors.plateName.message}</p>}
        </div>

        <div>
          <label htmlFor="add-plate-colors" className="mb-1 block text-sm font-medium text-slate-700">
            Colors / materials — optional
          </label>
          <input
            id="add-plate-colors"
            type="text"
            placeholder="e.g. Black PLA, Gold PETG"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('colors')}
          />
        </div>

        <PrintTimeFields control={control} idPrefix="add-plate-time" />

        <div>
          <label htmlFor="add-plate-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Notes — optional
          </label>
          <textarea
            id="add-plate-notes"
            rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            {...register('notes')}
          />
        </div>

        {submitError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {submitError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Add Plate
        </Button>
      </form>
    </Modal>
  );
}
