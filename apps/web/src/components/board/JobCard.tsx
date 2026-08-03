'use client';

import { formatPrintTime, type AppUser, type Business } from '@print-queue/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { Check, GripVertical, ImageOff, Pencil, Play, Trash2, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ScreenshotLightbox } from './ScreenshotLightbox';
import { PartialReprintDialog } from './PartialReprintDialog';
import type { BoardJob } from '../queue/types';

const iconButton =
  'touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30 disabled:hover:border-charcoal-300 disabled:hover:bg-transparent';

export function JobCard({
  job,
  business,
  position,
  user,
  onChanged,
}: {
  job: BoardJob;
  /** The column this card currently belongs to — carried in dnd-kit's sortable data for drag routing. */
  business: Business;
  position: number;
  user: AppUser;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const draggable = isAdmin && job.status === 'queued';

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    disabled: !draggable,
    data: { type: 'card', business },
  });

  async function callAction(path: string, body?: unknown) {
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

  async function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        setError(responseBody.error ?? 'Delete failed');
        return;
      }
      onChanged();
    });
  }

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'space-y-2 p-3 transition-shadow hover:shadow-panel-lift',
        job.status === 'printing' ? 'border-l-4 border-l-accent-500' : 'border-l-4 border-l-transparent',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        {draggable ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${job.name}`}
            className="touch-target -ml-1 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-charcoal-300 hover:text-charcoal-600 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}

        {job.screenshotUrl ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Enlarge screenshot for ${job.name}`}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50"
          >
            <Image src={job.screenshotUrl} alt="" fill className="object-cover" unoptimized />
          </button>
        ) : (
          <Link
            href={`/jobs/${job.id}/edit`}
            aria-label={`Add a screenshot for ${job.name}`}
            title="Add a screenshot"
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300 transition-colors hover:border-accent-400 hover:text-accent-600"
          >
            <ImageOff className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-charcoal-800 text-[11px] font-extrabold tabular-nums text-white">
              {position}
            </span>
            <Link
              href={`/jobs/${job.id}`}
              className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-charcoal-900 hover:text-accent-600"
            >
              {job.name}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pl-7">
            <StatusBadge status={job.status} />
            {job.colors && <span className="truncate text-xs text-charcoal-500">{job.colors}</span>}
          </div>
          {job.notes && <p className="truncate pl-7 text-xs text-charcoal-400">{job.notes}</p>}
        </div>
      </div>

      {error && <p className="pl-7 text-xs font-medium text-danger-600">{error}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-charcoal-100 pt-2 pl-7">
        <span className="text-xs font-semibold text-charcoal-500">
          {job.estimatedDurationSeconds ? `~${formatPrintTime(Math.round(job.estimatedDurationSeconds / 60))}` : ''}
        </span>

        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <Link href={`/jobs/${job.id}/edit`} aria-label={`Edit ${job.name}`} title="Edit" className={iconButton}>
              <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>

            {job.status === 'queued' && (
              <button
                type="button"
                onClick={() => callAction(`/api/jobs/${job.id}/status`, { status: 'printing' })}
                disabled={isPending}
                className="touch-target inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 text-xs font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                Start Printing
              </button>
            )}

            {job.status === 'printing' && (
              <>
                <button
                  type="button"
                  onClick={() => setPartialDialogOpen(true)}
                  disabled={isPending}
                  title="Partial"
                  className={clsx(iconButton, 'border-brand-400 text-brand-700 hover:bg-brand-50')}
                >
                  <TriangleAlert className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => callAction(`/api/jobs/${job.id}/status`, { status: 'completed' })}
                  disabled={isPending}
                  className="touch-target inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-success-600 px-3 text-xs font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:shadow-panel-lift disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  Complete
                </button>
              </>
            )}

            <button
              onClick={handleDelete}
              disabled={isPending}
              aria-label={`Delete ${job.name}`}
              title="Delete"
              className={clsx(iconButton, 'border-danger-500/60 text-danger-600 hover:bg-danger-50')}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {job.screenshotUrl && (
        <ScreenshotLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          screenshotUrl={job.screenshotUrl}
          jobName={job.name}
        />
      )}
      <PartialReprintDialog
        job={job}
        open={partialDialogOpen}
        onClose={() => setPartialDialogOpen(false)}
        onDone={() => {
          setPartialDialogOpen(false);
          onChanged();
        }}
      />
    </Card>
  );
}
