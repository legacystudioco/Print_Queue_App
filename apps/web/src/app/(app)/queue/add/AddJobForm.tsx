'use client';

import { businessLabels, businesses, createBoardJobSchema, type Business } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface AddJobFormValues {
  name: string;
  business: Business;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

/** A screenshot dropped directly onto a board column — see ProductionBoard/BoardColumn. */
export interface AddJobPresetFile {
  business: Business;
  file: File;
  /** e.g. "only one screenshot is used per job" when the drop carried extra files. */
  notice?: string;
}

/** Strips a filename's extension, e.g. "plate-5.png" -> "plate-5". */
function stripExtension(filename: string) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? filename : filename.slice(0, lastDot);
}

export function AddJobForm({
  onSuccess,
  presetFile,
}: {
  onSuccess?: () => void;
  /** Pre-selects a business and pre-fills the screenshot — set when a file was dropped directly onto a board column. */
  presetFile?: AddJobPresetFile;
}) {
  const router = useRouter();
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(presetFile?.notice ?? null);
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
      business: presetFile?.business ?? businesses[0],
      colors: '',
      notes: '',
      estimatedDurationSeconds: undefined,
    },
  });

  // A file dropped directly on a board column arrives here already
  // validated (see BoardColumn's native drop handling, which shares the
  // same pickScreenshotFile logic ImageDropZone uses) — feed it through
  // the same path a manual pick/drop inside the dialog would take,
  // including the filename -> name autofill. Mount-only: this dialog is
  // remounted fresh each time it opens (see AddJobDialog/Modal).
  useEffect(() => {
    if (presetFile) handleScreenshotChange(presetFile.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScreenshotChange(selected: File | null) {
    setScreenshot(selected);
    if (selected && !watch('name')) {
      setValue('name', stripExtension(selected.name));
    }
  }

  async function onSubmit(values: AddJobFormValues) {
    setSubmitError(null);

    if (!screenshot) {
      setSubmitError('Add a screenshot of the build plate');
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
        <ImageDropZone
          label="Add a screenshot of the build plate"
          hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
          file={screenshot}
          onFileChange={(selected) => {
            setPresetNotice(null);
            handleScreenshotChange(selected);
          }}
          imageAlt="Selected build plate screenshot"
          uploading={uploadProgress != null}
          uploadProgress={uploadProgress}
        />
        {presetNotice && <p className="mt-1 text-xs font-medium text-charcoal-500">{presetNotice}</p>}
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
