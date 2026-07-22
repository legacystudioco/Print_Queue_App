'use client';

import type { AppUser, PrintJobWithSlots } from '@print-queue/shared';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { AmsSummary } from '@/components/ams/AmsSummary';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { JobDisplayFlags } from '@/lib/server/data';

export function QueueCard({
  job,
  position,
  user,
  isFirst,
  isLast,
  onMove,
  onRemoved,
}: {
  job: PrintJobWithSlots & JobDisplayFlags;
  position: number;
  user: AppUser;
  isFirst: boolean;
  isLast: boolean;
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
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {position}
          </span>
          <div>
            <Link href={`/jobs/${job.id}`} className="font-semibold text-slate-900 hover:underline">
              {job.name}
            </Link>
            <p className="text-xs text-slate-500">{job.originalFilename}</p>
          </div>
        </div>
        <StatusBadge status={jobDisplayStatus(job.status, job)} />
      </div>

      <AmsSummary slots={job.amsSlots} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {job.estimatedDurationSeconds && (
          <span>~{Math.round(job.estimatedDurationSeconds / 60)} min</span>
        )}
        {job.notes && <span className="italic">{job.notes}</span>}
      </div>

      {error && <p className="text-xs text-danger-600">{error}</p>}

      {isAdmin && !isActive && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={() => onMove('up')}
            disabled={isFirst || isPending}
            className="touch-target rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-30"
            aria-label="Move up"
          >
            ↑ Up
          </button>
          <button
            onClick={() => onMove('down')}
            disabled={isLast || isPending}
            className="touch-target rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-30"
            aria-label="Move down"
          >
            ↓ Down
          </button>
          <Link
            href={`/jobs/${job.id}/edit`}
            className="touch-target rounded-lg border border-slate-300 px-3 text-sm leading-[46px]"
          >
            Edit
          </Link>
          <button
            onClick={() => callAction(`/api/jobs/${job.id}/skip`)}
            disabled={isPending}
            className="touch-target rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={() => callAction(`/api/jobs/${job.id}/delete`, 'DELETE')}
            disabled={isPending}
            className="touch-target rounded-lg border border-danger-500/40 px-3 text-sm text-danger-600 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}

      {isAdmin && job.status === 'failed' && (
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={() => callAction(`/api/jobs/${job.id}/retry`)}
            disabled={isPending}
            className="touch-target rounded-lg bg-amber-100 px-3 text-sm font-medium text-amber-800 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
    </Card>
  );
}
