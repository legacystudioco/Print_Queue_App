'use client';

import { updatePlateSchema } from '@print-queue/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { Modal } from '@/components/ui/Modal';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { buildScreenshotPath, deleteJobScreenshot, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';
import type { BoardPlate } from '../queue/types';

interface EditPlateFormValues {
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

/**
 * Edit an existing plate — same careful upload-before-delete screenshot
 * swap sequence as EditJobForm (see that component's comment): upload the
 * replacement to a brand-new path, save the record, only then delete the
 * previous object, so nothing is ever orphaned in storage.
 */
export function EditPlateDialog({
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
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditPlateFormValues>({
    defaultValues: {
      plateName: plate.plateName,
      colors: plate.colors ?? '',
      notes: plate.notes ?? '',
      estimatedDurationSeconds: plate.estimatedDurationSeconds,
    },
  });

  function handleClose() {
    setScreenshot(null);
    setUploadProgress(null);
    setSubmitError(null);
    reset();
    onClose();
  }

  async function onSubmit(values: EditPlateFormValues) {
    setSubmitError(null);

    let newStoragePath: string | undefined;

    if (screenshot) {
      newStoragePath = buildScreenshotPath(plate.id, screenshot.name);
      try {
        setUploadProgress(0);
        await uploadJobScreenshot({ file: screenshot, storagePath: newStoragePath, onProgress: setUploadProgress });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to upload screenshot');
        setUploadProgress(null);
        return;
      }
    }

    const parsed = updatePlateSchema.safeParse({
      plateName: values.plateName,
      colors: values.colors,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
      ...(newStoragePath ? { screenshotPath: newStoragePath } : {}),
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
      setUploadProgress(null);
      if (newStoragePath) void deleteJobScreenshot(newStoragePath);
      return;
    }

    const res = await fetch(`/api/plates/${plate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSubmitError(body.error ?? 'Failed to save changes');
      setUploadProgress(null);
      if (newStoragePath) void deleteJobScreenshot(newStoragePath);
      return;
    }

    if (newStoragePath && plate.screenshotPath) {
      const result = await deleteJobScreenshot(plate.screenshotPath);
      if (!result.ok) {
        console.error('Failed to delete previous screenshot', plate.screenshotPath, result.error);
      }
    }

    handleClose();
    onDone();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Edit Plate">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <ImageDropZone
          label={plate.screenshotUrl ? 'Replace screenshot' : 'Add screenshot'}
          hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
          helpText="Leave unchanged to keep the current screenshot."
          file={screenshot}
          onFileChange={setScreenshot}
          existingImageUrl={plate.screenshotUrl}
          imageAlt={screenshot ? `Selected replacement screenshot for ${plate.plateName}` : `Current screenshot for ${plate.plateName}`}
          uploading={uploadProgress != null}
          uploadProgress={uploadProgress}
        />

        <div>
          <label htmlFor="edit-plate-name" className="mb-1 block text-sm font-medium text-slate-700">
            Plate name
          </label>
          <input
            id="edit-plate-name"
            type="text"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('plateName')}
          />
          {errors.plateName && <p className="mt-1 text-sm text-danger-600">{errors.plateName.message}</p>}
        </div>

        <div>
          <label htmlFor="edit-plate-colors" className="mb-1 block text-sm font-medium text-slate-700">
            Colors / materials — optional
          </label>
          <input
            id="edit-plate-colors"
            type="text"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('colors')}
          />
        </div>

        <PrintTimeFields control={control} idPrefix="edit-plate-time" />

        <div>
          <label htmlFor="edit-plate-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Notes — optional
          </label>
          <textarea
            id="edit-plate-notes"
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
          Save Changes
        </Button>
      </form>
    </Modal>
  );
}
