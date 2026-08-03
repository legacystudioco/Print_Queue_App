'use client';

import { formatPrintTime, type AppUser, type PrinterBrand } from '@print-queue/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { GripVertical, Pencil, Play, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AmsSummary } from '@/components/ams/AmsSummary';
import { Card } from '@/components/ui/Card';
import { CompatibilityIcons } from './CompatibilityIcons';
import type { QueueJob } from './types';

const iconButton =
  'touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30 disabled:hover:border-charcoal-300 disabled:hover:bg-transparent';

export function QueueCard({
  job,
  brand,
  position,
  user,
  isFirstInQueue,
  startHref,
  waitingJobIds,
  selectable,
  selected,
  onToggleSelect,
  onRemoved,
}: {
  job: QueueJob;
  /** The column this card currently belongs to — carried in dnd-kit's sortable data for drag routing. */
  brand: PrinterBrand;
  position: number;
  user: AppUser;
  /** Whether this card is already next-up — determines Start's behavior (normal vs. bypass-and-promote). */
  isFirstInQueue: boolean;
  startHref: string | null;
  /** This column's current queued/ready job ids, in order — used to promote a non-first job to the front while preserving everyone else's relative order. */
  waitingJobIds: string[];
  /** True only for waiting (queued/ready) jobs — matches Total/Selected Print Time's scope. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user.role === 'admin';
  const isActive = job.status !== 'queued' && job.status !== 'ready';
  const draggable = isAdmin && !isActive;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    disabled: !draggable,
    data: { type: 'card', brand },
  });

  async function callAction(path: string, method = 'POST') {
    setError(null);
    startTransition(async () => {
      const res = await fetch(path, { method });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Action failed');
        return;
      }
      onRemoved();
    });
  }

  function handleStartClick() {
    if (!startHref) return;

    if (isFirstInQueue) {
      router.push(startHref);
      return;
    }

    const confirmed = window.confirm('Start this job now? It will move ahead of the jobs currently before it.');
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      // Promote this job to the front of its printer's queue, preserving
      // the relative order of everyone else, via the same reorder endpoint
      // drag-and-drop uses — then hand off to the existing safety-checklist
      // start flow exactly as the normal (first-job) path already does.
      const orderedJobIds = [job.id, ...waitingJobIds.filter((id) => id !== job.id)];
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: job.printerId, orderedJobIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not start this job');
        return;
      }
      router.push(startHref);
    });
  }

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'space-y-2 p-3 transition-shadow hover:shadow-panel-lift',
        isActive ? 'border-l-4 border-l-accent-500' : 'border-l-4 border-l-transparent',
        isDragging && 'opacity-50',
      )}
    >
      {/* Top section — left: drag handle, checkbox, queue number, name, AMS tags. Right: enlarged printer compatibility. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
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
            {selectable && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                aria-label={`Select ${job.name} for time calculation`}
                className="h-4 w-4 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
              />
            )}
            <span
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-extrabold tabular-nums',
                isActive ? 'bg-accent-500 text-white' : 'bg-charcoal-800 text-white',
              )}
            >
              {position}
            </span>
            <Link
              href={`/jobs/${job.id}`}
              className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-charcoal-900 hover:text-accent-600"
            >
              {job.name}
            </Link>
          </div>
          {job.files.some((f) => f.printerBrand === 'bambu') && (
            <div className="pl-6">
              <AmsSummary slots={job.amsSlots} />
            </div>
          )}
        </div>
        <CompatibilityIcons files={job.files} className="shrink-0" />
      </div>

      {error && <p className="pl-6 text-xs font-medium text-danger-600">{error}</p>}

      {/* Bottom row — duration (bottom-left) / actions (bottom-right) */}
      {(isAdmin && !isActive) || (isAdmin && job.status === 'failed') || job.estimatedDurationSeconds ? (
        <div className="flex items-center justify-between gap-2 border-t border-charcoal-100 pt-2 pl-6">
          <span className="text-xs font-semibold text-charcoal-500">
            {job.estimatedDurationSeconds ? `~${formatPrintTime(Math.round(job.estimatedDurationSeconds / 60))}` : ''}
          </span>

          <div className="flex items-center gap-1.5">
            {isAdmin && !isActive && (
              <>
                <Link
                  href={`/jobs/${job.id}/edit`}
                  aria-label={`Edit ${job.name}`}
                  title="Edit"
                  className={iconButton}
                >
                  <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={handleStartClick}
                  disabled={isPending || !startHref}
                  className="touch-target inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 text-xs font-bold tracking-wide text-white shadow-panel transition-all hover:-translate-y-px hover:bg-accent-600 hover:shadow-panel-lift disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  Start
                </button>
                <button
                  onClick={() => callAction(`/api/jobs/${job.id}/delete`, 'DELETE')}
                  disabled={isPending}
                  aria-label={`Remove ${job.name}`}
                  title="Remove"
                  className={clsx(iconButton, 'border-danger-500/60 text-danger-600 hover:bg-danger-50')}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </>
            )}
            {isAdmin && job.status === 'failed' && (
              <button
                onClick={() => callAction(`/api/jobs/${job.id}/retry`)}
                disabled={isPending}
                aria-label={`Retry ${job.name}`}
                title="Retry"
                className={clsx(iconButton, 'border-accent-300 text-accent-700 hover:bg-accent-50')}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
