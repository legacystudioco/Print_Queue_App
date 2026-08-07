'use client';

import { updateJobSchema } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import type { BoardJob } from '@/components/queue/types';

interface EditJobFormValues {
  customerName: string;
  notes: string;
}

/** Editing a customer/order — name and order notes. Business changes only via dragging the card between columns; plates are edited individually via EditPlateDialog. */
export function EditJobForm({ job }: { job: BoardJob }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditJobFormValues>({
    defaultValues: {
      customerName: job.customerName,
      notes: job.notes ?? '',
    },
  });

  async function onSubmit(values: EditJobFormValues) {
    setSubmitError(null);

    const parsed = updateJobSchema.safeParse(values);
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
        <label htmlFor="customerName" className="mb-1 block text-sm font-medium text-slate-700">
          Customer name
        </label>
        <input
          id="customerName"
          type="text"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          {...register('customerName')}
        />
        {errors.customerName && <p className="mt-1 text-sm text-danger-600">{errors.customerName.message}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-slate-700">
          Order notes — optional
        </label>
        <textarea
          id="notes"
          rows={3}
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
