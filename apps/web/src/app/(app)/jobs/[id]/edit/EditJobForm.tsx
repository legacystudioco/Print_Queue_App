'use client';

import { updateBoardJobSchema } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, isAcceptedScreenshotName, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';
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
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
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

  function handleScreenshotChange(selected: File | null) {
    setScreenshotError(null);
    if (!selected) {
      setScreenshot(null);
      return;
    }
    if (!isAcceptedScreenshotName(selected.name)) {
      setScreenshotError('File must be an image (.png, .jpg, .jpeg, .webp, .heic)');
      return;
    }
    setScreenshot(selected);
  }

  async function onSubmit(values: EditJobFormValues) {
    setSubmitError(null);

    let screenshotPath: string | undefined;
    try {
      if (screenshot) {
        screenshotPath = buildScreenshotPath(job.id, screenshot.name);
        setUploadProgress(0);
        await uploadJobScreenshot({ file: screenshot, storagePath: screenshotPath, onProgress: setUploadProgress });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to upload screenshot');
      setUploadProgress(null);
      return;
    }

    const parsed = updateBoardJobSchema.safeParse({
      name: values.name,
      colors: values.colors,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
      ...(screenshotPath ? { screenshotPath } : {}),
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
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
      return;
    }

    router.push(`/jobs/${job.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <label htmlFor="screenshot" className="mb-1 block text-sm font-medium text-slate-700">
          Screenshot
        </label>
        {job.screenshotUrl && !screenshot && (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not worth Next/Image's remote-loader machinery
          <img
            src={job.screenshotUrl}
            alt=""
            className="mb-2 h-32 w-32 rounded-lg border border-slate-200 object-cover"
          />
        )}
        <input
          id="screenshot"
          type="file"
          accept="image/*"
          onChange={(e) => handleScreenshotChange(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">Leave blank to keep the current screenshot.</p>
        {screenshotError && <p className="mt-1 text-sm text-danger-600">{screenshotError}</p>}
        {uploadProgress != null && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
      </div>

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
