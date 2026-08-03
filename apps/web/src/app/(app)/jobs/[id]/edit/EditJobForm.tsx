'use client';

import { updateBoardJobSchema } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, deleteJobScreenshot, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';
import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';

interface EditJobFormValues {
  name: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

export function EditJobForm({ job }: { job: BoardJobWithScreenshotUrl }) {
  const router = useRouter();
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditJobFormValues>({
    defaultValues: {
      name: job.name,
      colors: job.colors ?? '',
      notes: job.notes ?? '',
      estimatedDurationSeconds: job.estimatedDurationSeconds,
    },
  });

  /**
   * Save sequence (see the image drag-and-drop spec this implements):
   * 1. A replacement, if any, was already just a local preview until now.
   * 2. Upload it to a brand-new, unique storage path — never the job's
   *    current path, so the still-live old object is never overwritten.
   * 3. Update the job record to point at the new path.
   * 4. Only once that succeeds, delete the previous screenshot object.
   * 5. If the update fails, delete the newly-uploaded object instead and
   *    leave the job pointing at its original screenshot.
   * Either way, nothing is ever orphaned in storage.
   */
  async function onSubmit(values: EditJobFormValues) {
    setSubmitError(null);

    let newStoragePath: string | undefined;

    if (screenshot) {
      newStoragePath = buildScreenshotPath(job.id, screenshot.name);
      try {
        setUploadProgress(0);
        await uploadJobScreenshot({ file: screenshot, storagePath: newStoragePath, onProgress: setUploadProgress });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to upload screenshot');
        setUploadProgress(null);
        return;
      }
    }

    const parsed = updateBoardJobSchema.safeParse({
      name: values.name,
      colors: values.colors,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
      ...(newStoragePath ? { screenshotPath: newStoragePath } : {}),
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
      setUploadProgress(null);
      // Nothing was saved, but the new image may already be sitting in
      // storage from the upload above — don't leave it orphaned.
      if (newStoragePath) void deleteJobScreenshot(newStoragePath);
      return;
    }

    const res = await fetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSubmitError(body.error ?? 'Failed to save changes');
      setUploadProgress(null);
      // The DB update didn't take — roll back the newly-uploaded object;
      // the job keeps pointing at its original screenshot untouched.
      if (newStoragePath) void deleteJobScreenshot(newStoragePath);
      return;
    }

    // Saved successfully — now that no job record points at it anymore,
    // remove the old screenshot. Best-effort: a failure here doesn't
    // revert the save that already succeeded, just gets logged so it can
    // be cleaned up later.
    if (newStoragePath && job.screenshotPath) {
      const result = await deleteJobScreenshot(job.screenshotPath);
      if (!result.ok) {
        console.error('Failed to delete previous screenshot', job.screenshotPath, result.error);
      }
    }

    router.push(`/jobs/${job.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <ImageDropZone
        label={job.screenshotUrl ? 'Replace screenshot' : 'Add screenshot'}
        hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
        helpText="Leave unchanged to keep the current screenshot."
        file={screenshot}
        onFileChange={setScreenshot}
        existingImageUrl={job.screenshotUrl}
        imageAlt={screenshot ? `Selected replacement screenshot for ${job.name}` : `Current screenshot for ${job.name}`}
        uploading={uploadProgress != null}
        uploadProgress={uploadProgress}
        autoFocus={!job.screenshotUrl}
      />

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
          Job name
        </label>
        <input
          id="name"
          type="text"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          {...register('name')}
        />
        {errors.name && <p className="mt-1 text-sm text-danger-600">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="colors" className="mb-1 block text-sm font-medium text-slate-700">
          Colors / materials — optional
        </label>
        <input
          id="colors"
          type="text"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          {...register('colors')}
        />
      </div>

      <PrintTimeFields control={control} error={errors.estimatedDurationSeconds?.message} />

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-slate-700">
          Notes — optional
        </label>
        <textarea
          id="notes"
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
  );
}
