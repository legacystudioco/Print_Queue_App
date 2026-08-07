'use client';

import { formatPrintTime, plateStatusGlyphs, plateStatusLabels } from '@print-queue/shared';
import { clsx } from 'clsx';
import { Check, Copy, FolderOutput, ImageOff, Pencil, Play, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import { PartialReprintDialog } from './PartialReprintDialog';
import { ReprintDialog } from './ReprintDialog';
import { ScreenshotLightbox } from './ScreenshotLightbox';
import type { BoardPlate } from '../queue/types';

const iconButton =
  'touch-target inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30 disabled:hover:border-charcoal-300 disabled:hover:bg-transparent';

/** One plate line item inside an expanded JobCard/HistoryCard — the unit every plate action (start/complete/partial/edit/delete/duplicate/reprint/requeue) applies to. */
export function PlateRow({
  plate,
  isAdmin,
  onChanged,
  onEdit,
  showRequeue = false,
  screenshotAvailable = true,
  canRemoveFromJob = false,
}: {
  plate: BoardPlate;
  isAdmin: boolean;
  onChanged: () => void;
  /** Opens the edit-plate dialog for this plate — owned by the parent so only one edit dialog exists per card. */
  onEdit: () => void;
  /** History only: offers "Requeue" (duplicate back to queued) for a terminal (completed/partial) plate. */
  showRequeue?: boolean;
  /** History only: disables Requeue when the original screenshot object no longer exists in storage. */
  screenshotAvailable?: boolean;
  /** Offers "Remove from Job" (split this plate back into its own standalone job) — only when its job has other plates. */
  canRemoveFromJob?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requeueState, setRequeueState] = useState<'idle' | 'requeuing' | 'done'>('idle');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const [reprintDialogOpen, setReprintDialogOpen] = useState(false);

  function callAction(path: string, body?: unknown) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        setError(responseBody.error ?? 'Action failed');
        return;
      }
      onChanged();
    });
  }

  function handleDuplicate() {
    callAction(`/api/plates/${plate.id}/duplicate`);
  }

  function handleRemoveFromJob() {
    callAction(`/api/plates/${plate.id}/remove-from-job`);
  }

  function handleRequeue() {
    setError(null);
    setRequeueState('requeuing');
    startTransition(async () => {
      const res = await fetch(`/api/plates/${plate.id}/requeue`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not requeue this plate.');
        setRequeueState('idle');
        return;
      }
      setRequeueState('done');
      onChanged();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/plates/${plate.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Delete failed');
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-charcoal-100 p-2">
      <div className="flex items-start gap-2.5">
        {plate.screenshotUrl ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Enlarge screenshot for ${plate.plateName}`}
            className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50"
          >
            <Image src={plate.screenshotUrl} alt="" fill className="object-cover" unoptimized />
          </button>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              aria-hidden="true"
              className={clsx(
                'text-sm font-bold',
                plate.status === 'completed' && 'text-success-600',
                plate.status === 'printing' && 'text-accent-600',
                plate.status === 'partial' && 'text-brand-600',
                plate.status === 'queued' && 'text-charcoal-300',
              )}
            >
              {plateStatusGlyphs[plate.status]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-charcoal-900">{plate.plateName}</span>
            <span className="sr-only">{plateStatusLabels[plate.status]}</span>
            {plate.estimatedDurationSeconds ? (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-charcoal-500">
                {formatPrintTime(Math.round(plate.estimatedDurationSeconds / 60))}
              </span>
            ) : null}
          </div>
          {plate.colors && <p className="truncate text-xs text-charcoal-500">{plate.colors}</p>}
          {plate.notes && <p className="truncate text-xs text-charcoal-400">{plate.notes}</p>}
        </div>
      </div>

      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {plate.status === 'queued' && (
            <button
              type="button"
              onClick={() => callAction(`/api/plates/${plate.id}/status`, { status: 'printing' })}
              disabled={isPending}
              className="touch-target inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-2.5 text-xs font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Start Printing
            </button>
          )}

          {plate.status === 'printing' && (
            <>
              <button
                type="button"
                onClick={() => setPartialDialogOpen(true)}
                disabled={isPending}
                title="Partial"
                className={clsx(iconButton, 'border-brand-400 text-brand-700 hover:bg-brand-50')}
              >
                <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => callAction(`/api/plates/${plate.id}/status`, { status: 'completed' })}
                disabled={isPending}
                className="touch-target inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-success-600 px-2.5 text-xs font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:shadow-panel-lift disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                Complete
              </button>
            </>
          )}

          {plate.status === 'partial' && (
            <button
              type="button"
              onClick={() => setReprintDialogOpen(true)}
              disabled={isPending}
              title="Reprint"
              className={clsx(iconButton, 'border-brand-400 text-brand-700 hover:bg-brand-50')}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}

          {showRequeue && (plate.status === 'completed' || plate.status === 'partial') && (
            <button
              type="button"
              onClick={handleRequeue}
              disabled={!screenshotAvailable || isPending || requeueState !== 'idle'}
              title={screenshotAvailable ? 'Requeue' : 'Original screenshot is no longer available'}
              className="touch-target inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-charcoal-300 px-2.5 text-xs font-bold tracking-wide text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              {requeueState === 'done' ? 'Requeued' : requeueState === 'requeuing' ? 'Requeuing…' : 'Requeue'}
            </button>
          )}

          <button type="button" onClick={onEdit} title="Edit" aria-label={`Edit ${plate.plateName}`} className={iconButton}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleDuplicate}
            disabled={isPending}
            title="Duplicate"
            aria-label={`Duplicate ${plate.plateName}`}
            className={iconButton}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>

          {canRemoveFromJob && (
            <button
              type="button"
              onClick={handleRemoveFromJob}
              disabled={isPending}
              title="Remove from Job"
              aria-label={`Remove ${plate.plateName} from its job`}
              className={iconButton}
            >
              <FolderOutput className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Delete"
            aria-label={`Delete ${plate.plateName}`}
            className={clsx(iconButton, 'border-danger-500/60 text-danger-600 hover:bg-danger-50')}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      )}

      {plate.screenshotUrl && (
        <ScreenshotLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          screenshotUrl={plate.screenshotUrl}
          jobName={plate.plateName}
        />
      )}
      <PartialReprintDialog
        plate={plate}
        open={partialDialogOpen}
        onClose={() => setPartialDialogOpen(false)}
        onDone={() => {
          setPartialDialogOpen(false);
          onChanged();
        }}
      />
      <ReprintDialog
        plate={plate}
        open={reprintDialogOpen}
        onClose={() => setReprintDialogOpen(false)}
        onDone={() => {
          setReprintDialogOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}
