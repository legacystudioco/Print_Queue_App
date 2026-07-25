'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createPrintJobSchema,
  GCODE_3MF_EXTENSION,
  MAX_UPLOAD_SIZE_BYTES,
  type CreatePrintJobInput,
} from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AmsSlotEditor } from '@/components/ams/AmsSlotEditor';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildStoragePath, uploadPrintFile } from '@/lib/client/uploadPrintFile';

const EMPTY_SLOT = { isUsed: false, colorName: '', materialName: '', notes: '' };

export function AddPrintForm({ printerId }: { printerId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePrintJobInput>({
    resolver: zodResolver(createPrintJobSchema),
    defaultValues: {
      name: '',
      originalFilename: '',
      fileSizeBytes: 0,
      notes: '',
      estimatedDurationSeconds: undefined,
      externalSpoolConfirmed: false,
      amsSlots: [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT] as CreatePrintJobInput['amsSlots'],
    },
  });

  const noSlotsUsed = watch('amsSlots')?.every((s) => !s.isUsed);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(GCODE_3MF_EXTENSION)) {
      setFileError(`File must have the ${GCODE_3MF_EXTENSION} extension`);
      setFile(null);
      return;
    }
    if (selected.size > MAX_UPLOAD_SIZE_BYTES) {
      setFileError('File is larger than the 500 MB limit');
      setFile(null);
      return;
    }
    setFile(selected);
    setValue('originalFilename', selected.name, { shouldValidate: true });
    setValue('fileSizeBytes', selected.size, { shouldValidate: true });
    if (!watch('name')) {
      setValue('name', selected.name.replace(/\.gcode\.3mf$/i, ''));
    }
  }

  async function onSubmit(values: CreatePrintJobInput) {
    setSubmitError(null);
    if (!file) {
      setFileError('Select a .gcode.3mf file to upload');
      return;
    }

    try {
      const jobId = crypto.randomUUID();
      const storagePath = buildStoragePath(printerId, jobId, file.name);

      setUploadProgress(0);
      await uploadPrintFile({ file, storagePath, onProgress: setUploadProgress });

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, jobId, printerId, storagePath }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create print job');
      }

      router.push('/queue');
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
      setUploadProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <label htmlFor="file" className="mb-1 block text-sm font-medium text-slate-700">
          Sliced file ({GCODE_3MF_EXTENSION})
        </label>
        <input
          id="file"
          type="file"
          accept=".3mf"
          onChange={handleFileChange}
          className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
        />
        {fileError && <p className="mt-1 text-sm text-danger-600">{fileError}</p>}
        {file && !fileError && (
          <p className="mt-1 text-xs text-slate-500">
            {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
        {uploadProgress !== null && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
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

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">AMS slots</h2>
        <AmsSlotEditor control={control} errors={errors} />
        {noSlotsUsed && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" {...register('externalSpoolConfirmed')} className="h-5 w-5" />
            This print uses an external spool, not the AMS
          </label>
        )}
        {errors.amsSlots?.root?.message && (
          <p className="mt-1 text-sm text-danger-600">{errors.amsSlots.root.message}</p>
        )}
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
