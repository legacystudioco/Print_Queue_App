'use client';

import { formatPrintTime, type AppUser, type PrintJobWithSlots } from '@print-queue/shared';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, Pencil, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { AmsSummary } from '@/components/ams/AmsSummary';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { JobDisplayFlags } from '@/lib/server/data';

const rowButton =
  'touch-target inline-flex items-center gap-1.5 rounded-lg border border-charcoal-300 px-3 text-sm font-semibold text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30 disabled:hover:border-charcoal-300 disabled:hover:bg-transparent';

export function QueueCard({
  job,
  position,
  user,
  isFirst,
  isLast,
  selectable,
  selected,
  onToggleSelect,
  onMove,
  onRemoved,
}: {
  job: PrintJobWithSlots & JobDisplayFlags;
  position: number;
  user: AppUser;
  isFirst: boolean;
  isLast: boolean;
  /** True only for waiting (queued/ready) jobs — matches Total Queue Time's scope. See lib/client/queueTime.ts. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user.role === 'admin';
  const isActive = job.status !== 'queued' && job.status !== 'ready';

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

  return (
    <Card
      className={clsx(
        'space-y-3 transition-shadow hover:shadow-panel-lift',
        // The one card in the list actually doing something gets called out
        // with the accent color — everything else stays neutral on purpose.
        isActive ? 'border-l-4 border-l-accent-500' : 'border-l-4 border-l-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select ${job.name} for time calculation`}
              className="mt-1.5 h-5 w-5 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
            />
          )}
          <span
            className={clsx(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-extrabold tabular-nums',
              isActive ? 'bg-accent-500 text-white' : 'bg-charcoal-800 text-white',
            )}
          >
            {position}
          </span>
          <div className="min-w-0">
            <Link
              href={`/jobs/${job.id}`}
              className="block truncate text-base font-bold tracking-tight text-charcoal-900 hover:text-accent-600"
            >
              {job.name}
            </Link>
            <p className="truncate font-mono text-[11px] text-charcoal-400">{job.originalFilename}</p>
          </div>
        </div>
        <StatusBadge status={jobDisplayStatus(job.status, job)} className="shrink-0" />
      </div>

      <div className="border-t border-charcoal-100 pt-3">
        <AmsSummary slots={job.amsSlots} />
      </div>

      {(job.estimatedDurationSeconds || job.notes) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal-500">
          {job.estimatedDurationSeconds && (
            <span className="font-semibold">~{formatPrintTime(Math.round(job.estimatedDurationSeconds / 60))}</span>
          )}
          {job.notes && <span className="italic text-charcoal-400">{job.notes}</span>}
        </div>
      )}

      {error && <p className="text-xs font-medium text-danger-600">{error}</p>}

      {isAdmin && !isActive && (
        <div className="flex flex-wrap gap-2 border-t border-charcoal-100 pt-3">
          <button
            onClick={() => onMove('up')}
            disabled={isFirst || isPending}
            className={rowButton}
            aria-label="Move up"
          >
            <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Up
          </button>
          <button
            onClick={() => onMove('down')}
            disabled={isLast || isPending}
            className={rowButton}
            aria-label="Move down"
          >
            <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Down
          </button>
          <Link href={`/jobs/${job.id}/edit`} className={clsx(rowButton, 'leading-none')}>
            <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Edit
          </Link>
          <button onClick={() => callAction(`/api/jobs/${job.id}/skip`)} disabled={isPending} className={rowButton}>
            <SkipForward className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Skip
          </button>
          <button
            onClick={() => callAction(`/api/jobs/${job.id}/delete`, 'DELETE')}
            disabled={isPending}
            className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-danger-500/60 px-3 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Remove
          </button>
        </div>
      )}

      {isAdmin && job.status === 'failed' && (
        <div className="flex gap-2 border-t border-charcoal-100 pt-3">
          <button
            onClick={() => callAction(`/api/jobs/${job.id}/retry`)}
            disabled={isPending}
            className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 text-sm font-bold text-accent-700 transition-colors hover:bg-accent-100 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </Card>
  );
}
