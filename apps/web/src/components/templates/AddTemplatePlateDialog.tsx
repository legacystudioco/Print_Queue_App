'use client';

import { addTemplatePlateSchema } from '@print-queue/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { Modal } from '@/components/ui/Modal';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface AddTemplatePlateFormValues {
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

/** "Add Plate" on the template detail page — mirrors AddPlateDialog, but the screenshot is optional and uploads directly to templates/{id}/... */
export function AddTemplatePlateDialog({
  templateId,
  open,
  onClose,
  onDone,
}: {
  templateId: string;
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
  } = useForm<AddTemplatePlateFormValues>({
    defaultValues: { plateName: '', colors: '', notes: '', estimatedDurationSeconds: undefined },
  });

  function handleClose() {
    setScreenshot(null);
    setUploadProgress(null);
    setSubmitError(null);
    reset();
    onClose();
  }

  async function onSubmit(values: AddTemplatePlateFormValues) {
    setSubmitError(null);

    let storagePath: string | null = null;

    try {
      if (screenshot) {
        storagePath = buildScreenshotPath(`templates/${templateId}`, screenshot.name);
        setUploadProgress(0);
        await uploadJobScreenshot({ file: screenshot, storagePath, onProgress: setUploadProgress });
      }

      const parsed = addTemplatePlateSchema.safeParse({
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

      const res = await fetch(`/api/templates/${templateId}/plates`, {
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
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Plate">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <ImageDropZone
          label="Add a screenshot of the build plate — optional"
          hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
          file={screenshot}
          onFileChange={setScreenshot}
          imageAlt="Selected build plate screenshot"
          uploading={uploadProgress != null}
          uploadProgress={uploadProgress}
        />

        <div>
          <label htmlFor="add-template-plate-name" className="mb-1 block text-sm font-medium text-slate-700">
            Plate name
          </label>
          <input
            id="add-template-plate-name"
            type="text"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('plateName')}
          />
          {errors.plateName && <p className="mt-1 text-sm text-danger-600">{errors.plateName.message}</p>}
        </div>

        <div>
          <label htmlFor="add-template-plate-colors" className="mb-1 block text-sm font-medium text-slate-700">
            Colors / materials — optional
          </label>
          <input
            id="add-template-plate-colors"
            type="text"
            placeholder="e.g. Black, White, TEAM COLOR"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('colors')}
          />
        </div>

        <PrintTimeFields control={control} idPrefix="add-template-plate-time" />

        <div>
          <label htmlFor="add-template-plate-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Notes — optional
          </label>
          <textarea
            id="add-template-plate-notes"
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
