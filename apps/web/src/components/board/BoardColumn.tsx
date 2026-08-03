'use client';

import { businessLabels, formatPrintTime, type AppUser, type Business } from '@print-queue/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { summarizePrintTime } from '@/lib/client/queueTime';
import { JobCard } from './JobCard';
import type { BoardJob } from '../queue/types';

export type DropState = 'none' | 'valid';

export function BoardColumn({
  business,
  jobs,
  user,
  onChanged,
  dropState,
  onAddClick,
}: {
  business: Business;
  jobs: BoardJob[];
  user: AppUser;
  onChanged: () => void;
  dropState: DropState;
  onAddClick: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${business}`,
    data: { type: 'column', business },
  });

  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const { totalMinutes, missingCount } = summarizePrintTime(queuedJobs);

  return (
    <div
      data-testid={`column-${business}`}
      className={clsx(
        'relative flex min-w-0 flex-1 flex-col',
        dropState === 'valid' && 'bg-accent-50/70 ring-2 ring-inset ring-accent-400',
      )}
    >
      {dropState === 'valid' && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center">
          <span className="rounded-full bg-accent-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-panel-lift">
            Drop to Move
          </span>
        </div>
      )}

      <div className="flex-shrink-0 space-y-2 border-b border-charcoal-200 bg-white px-3 pb-3 pt-4">
        <h2 className="text-center text-sm font-extrabold uppercase tracking-widest text-charcoal-700">
          {businessLabels[business]}
        </h2>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-widest text-charcoal-400">Queue Time</span>
          <span className="font-extrabold tabular-nums text-charcoal-900">{formatPrintTime(totalMinutes)}</span>
        </div>
        {missingCount > 0 && (
          <p className="-mt-1 text-[11px] text-charcoal-400">
            {missingCount} {missingCount === 1 ? 'job has' : 'jobs have'} no estimate.
          </p>
        )}
      </div>

      <div ref={setNodeRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {jobs.length === 0 ? (
          <EmptyColumnPlaceholder onOpen={onAddClick} />
        ) : (
          <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {jobs.map((job, i) => (
                <JobCard key={job.id} job={job} business={business} position={i + 1} user={user} onChanged={onChanged} />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function EmptyColumnPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-charcoal-200 text-charcoal-400 transition-colors hover:border-accent-400 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
    >
      <Plus className="h-8 w-8" strokeWidth={2} aria-hidden="true" />
      <span className="text-sm font-bold tracking-wide">ADD TO QUEUE</span>
    </button>
  );
}
