'use client';

import { businessLabels, businesses, saveJobAsTemplateSchema, type Business } from '@print-queue/shared';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { BoardJob } from '../queue/types';

/**
 * "Save as Template" — the fastest path from an existing production job to
 * a reusable template. Every plate is checked by default; deselecting one
 * excludes it from the template. Only production-neutral fields are
 * copied — see POST /api/jobs/[id]/save-as-template's comment.
 */
export function SaveAsTemplateDialog({
  job,
  open,
  onClose,
}: {
  job: BoardJob;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(job.customerName);
  const [description, setDescription] = useState('');
  const [defaultBusiness, setDefaultBusiness] = useState<Business>(job.business);
  const [selectedPlateIds, setSelectedPlateIds] = useState<string[]>(job.plates.map((p) => p.id));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setName(job.customerName);
    setDescription('');
    setDefaultBusiness(job.business);
    setSelectedPlateIds(job.plates.map((p) => p.id));
    setSubmitError(null);
    onClose();
  }

  function togglePlate(plateId: string) {
    setSelectedPlateIds((prev) => (prev.includes(plateId) ? prev.filter((id) => id !== plateId) : [...prev, plateId]));
  }

  async function handleConfirm() {
    setSubmitError(null);

    const templateId = crypto.randomUUID();
    const parsed = saveJobAsTemplateSchema.safeParse({
      templateId,
      name,
      description: description || null,
      defaultBusiness,
      plateIds: selectedPlateIds,
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save template');
      }

      handleClose();
      router.push(`/templates/${templateId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Save as Template">
      <div className="space-y-5">
        <div>
          <label htmlFor="save-template-name" className="mb-1 block text-sm font-medium text-slate-700">
            Template name
          </label>
          <input
            id="save-template-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>

        <div>
          <label htmlFor="save-template-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description — optional
          </label>
          <textarea
            id="save-template-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="save-template-business" className="mb-1 block text-sm font-medium text-slate-700">
            Default business
          </label>
          <select
            id="save-template-business"
            value={defaultBusiness}
            onChange={(e) => setDefaultBusiness(e.target.value as Business)}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            {businesses.map((b) => (
              <option key={b} value={b}>
                {businessLabels[b]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-charcoal-400">
            Plates to include ({selectedPlateIds.length} of {job.plates.length})
          </p>
          <div className="space-y-1.5">
            {job.plates.map((plate) => (
              <label
                key={plate.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-charcoal-200 p-2 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50"
              >
                <input
                  type="checkbox"
                  checked={selectedPlateIds.includes(plate.id)}
                  onChange={() => togglePlate(plate.id)}
                  className="h-5 w-5 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
                />
                {plate.screenshotUrl && (
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
                    <Image src={plate.screenshotUrl} alt="" fill className="object-cover" unoptimized />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-charcoal-900">{plate.plateName}</span>
              </label>
            ))}
          </div>
        </div>

        {submitError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {submitError}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={name.trim().length === 0 || selectedPlateIds.length === 0}
          loading={submitting}
          onClick={handleConfirm}
        >
          Save Template
        </Button>
      </div>
    </Modal>
  );
}
