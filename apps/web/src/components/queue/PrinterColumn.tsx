'use client';

import { activePrintJobStatuses, type AppUser, type PrinterBrand, type PrinterRecord } from '@print-queue/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ColumnHeader } from './ColumnHeader';
import { QueueCard } from './QueueCard';
import type { QueueJob } from './types';

export type DropState = 'none' | 'valid' | 'invalid';

export function PrinterColumn({
  brand,
  printer,
  bridgeOnline,
  jobs,
  currentJob,
  progressPercent,
  user,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRemoved,
  dropState,
  onAddClick,
  onFileDrop,
}: {
  brand: PrinterBrand;
  printer: PrinterRecord | null;
  bridgeOnline: boolean;
  jobs: QueueJob[];
  currentJob: QueueJob | null;
  progressPercent: number | undefined;
  user: AppUser;
  selectedIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRemoved: () => void;
  dropState: DropState;
  onAddClick: () => void;
  onFileDrop: (file: File) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${brand}`,
    data: { type: 'column', brand, printerId: printer?.id ?? null },
  });

  const waitingJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'ready');
  const waitingJobIds = waitingJobs.map((j) => j.id);
  const hasActiveJob = jobs.some((j) => (activePrintJobStatuses as readonly string[]).includes(j.status));
  const firstWaitingId = !hasActiveJob ? waitingJobs[0]?.id : undefined;
  const startHref = printer ? `/start-next?printerId=${printer.id}` : null;

  // Derived from selectedIds + this column's own jobs on every render — no
  // second mutable "selected total" to drift out of sync. `jobs` is already
  // scoped to this printer's assignment (see QueueBoard), not merely
  // brand-compatible jobs.
  const selectedJobs = jobs.filter((j) => selectedIds.has(j.id));

  return (
    <div
      data-testid={`column-${brand}`}
      className={clsx(
        'relative flex min-w-0 flex-1 flex-col',
        dropState === 'valid' && 'bg-accent-50/70 ring-2 ring-inset ring-accent-400',
        dropState === 'invalid' && 'cursor-not-allowed',
      )}
    >
      {dropState === 'valid' && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center">
          <span className="rounded-full bg-accent-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-panel-lift">
            Drop to Move
          </span>
        </div>
      )}

      <ColumnHeader
        brand={brand}
        printer={printer}
        bridgeOnline={bridgeOnline}
        currentJob={currentJob}
        progressPercent={progressPercent}
        waitingJobs={waitingJobs}
        selectedJobs={selectedJobs}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />

      <div ref={setNodeRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {jobs.length === 0 ? (
          <EmptyColumnPlaceholder brandName={brand} onOpen={onAddClick} onFileDrop={onFileDrop} />
        ) : (
          <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {jobs.map((job, i) => (
                <QueueCard
                  key={job.id}
                  job={job}
                  brand={brand}
                  position={i + 1}
                  user={user}
                  isFirstInQueue={job.id === firstWaitingId}
                  startHref={startHref}
                  waitingJobIds={waitingJobIds}
                  selectable={job.status === 'queued' || job.status === 'ready'}
                  selected={selectedIds.has(job.id)}
                  onToggleSelect={() => onToggleSelect(job.id)}
                  onRemoved={onRemoved}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function EmptyColumnPlaceholder({
  onOpen,
  onFileDrop,
}: {
  brandName: PrinterBrand;
  onOpen: () => void;
  onFileDrop: (file: File) => void;
}) {
  const [fileDragOver, setFileDragOver] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setFileDragOver(true);
        }
      }}
      onDragLeave={() => setFileDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setFileDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileDrop(file);
      }}
      className={clsx(
        'flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-charcoal-400 transition-colors hover:border-accent-400 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
        fileDragOver ? 'border-accent-500 bg-accent-50 text-accent-600' : 'border-charcoal-200',
      )}
    >
      <Plus className="h-8 w-8" strokeWidth={2} aria-hidden="true" />
      <span className="text-sm font-bold tracking-wide">ADD TO QUEUE</span>
    </button>
  );
}
