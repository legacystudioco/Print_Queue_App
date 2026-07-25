'use client';

import type { CreatePrintJobInput, PrintJobWithSlots } from '@print-queue/shared';
import { updatePrintJobSchema } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AmsSlotEditor } from '@/components/ams/AmsSlotEditor';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';

export function EditJobForm({ job }: { job: PrintJobWithSlots }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const slotDefaults = [1, 2, 3, 4].map((n) => {
    const slot = job.amsSlots.find((s) => s.slotNumber === n);
    return {
      isUsed: slot?.isUsed ?? false,
      colorName: slot?.colorName ?? '',
      materialName: slot?.materialName ?? '',
      notes: slot?.notes ?? '',
    };
  }) as CreatePrintJobInput['amsSlots'];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreatePrintJobInput>({
    defaultValues: {
      name: job.name,
      originalFilename: job.originalFilename,
      fileSizeBytes: job.fileSizeBytes,
      notes: job.notes ?? '',
      estimatedDurationSeconds: job.estimatedDurationSeconds,
      externalSpoolConfirmed: true,
      amsSlots: slotDefaults,
    },
  });

  async function onSubmit(values: CreatePrintJobInput) {
    setSubmitError(null);
    const parsed = updatePrintJobSchema.safeParse({
      name: values.name,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
      amsSlots: values.amsSlots,
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
