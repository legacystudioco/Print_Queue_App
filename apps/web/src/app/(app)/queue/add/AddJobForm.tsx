'use client';

import { businessLabels, businesses, createBoardJobSchema, type Business } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, isAcceptedScreenshotName, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface AddJobFormValues {
  name: string;
  business: Business;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

/** Strips a filename's extension, e.g. "plate-5.png" -> "plate-5". */
function stripExtension(filename: string) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? filename : filename.slice(0, lastDot);
}

export function AddJobForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddJobFormValues>({
    defaultValues: {
      name: '',
      business: businesses[0],
      colors: '',
      notes: '',
      estimatedDurationSeconds: undefined,
    },
  });

  function handleScreenshotChange(selected: File | null) {
    setScreenshotError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!selected) {
      setScreenshot(null);
      return;
    }
    if (!isAcceptedScreenshotName(selected.name)) {
      setScreenshotError('File must be an image (.png, .jpg, .jpeg, .webp, .heic)');
      return;
    }

    setScreenshot(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    if (!watch('name')) {
      setValue('name', stripExtension(selected.name));
    }
  }

  async function onSubmit(values: AddJobFormValues) {
    setSubmitError(null);

    if (!screenshot) {
      setSubmitError('Upload a screenshot of the build plate');
      return;
    }

    const jobId = crypto.randomUUID();
    const storagePath = buildScreenshotPath(jobId, screenshot.name);

    const parsed = createBoardJobSchema.safeParse({
      name: values.name,
      business: values.business,
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

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, jobId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create job');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/queue');
      }
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
      setUploadProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <label htmlFor="screenshot" className="mb-1 block text-sm font-medium text-slate-700">
          Screenshot of the build plate
        </label>
        <input
          id="screenshot"
          type="file"
          accept="image/*"
          onChange={(e) => handleScreenshotChange(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
        />
        {screenshotError && <p className="mt-1 text-sm text-danger-600">{screenshotError}</p>}
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not worth Next/Image's remote-loader machinery
          <img src={previewUrl} alt="" className="mt-2 h-32 w-32 rounded-lg border border-slate-200 object-cover" />
        )}
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
        <label htmlFor="business" className="mb-1 block text-sm font-medium text-slate-700">
          Business
        </label>
        <select
          id="business"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          {...register('business')}
        >
          {businesses.map((business) => (
            <option key={business} value={business}>
              {businessLabels[business]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="colors" className="mb-1 block text-sm font-medium text-slate-700">
          Colors / materials — optional
        </label>
        <input
          id="colors"
          type="text"
          placeholder="e.g. Black PLA, Gold PETG"
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
        Add to Queue
      </Button>
    </form>
  );
}
