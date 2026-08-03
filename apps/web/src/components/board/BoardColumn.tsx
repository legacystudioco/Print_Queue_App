'use client';

import { businessLabels, formatPrintTime, type AppUser, type Business } from '@print-queue/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { clsx } from 'clsx';
import { AlertCircle, ImagePlus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { dataTransferLooksInvalid, pickScreenshotFile } from '@/lib/client/uploadJobScreenshot';
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
  onFileDrop,
}: {
  business: Business;
  jobs: BoardJob[];
  user: AppUser;
  onChanged: () => void;
  dropState: DropState;
  onAddClick: () => void;
  /** Called with a validated screenshot dropped/picked directly on this column — undefined disables the affordance (e.g. non-admin viewers). */
  onFileDrop?: (file: File, notice: string | null) => void;
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
          <EmptyColumnDropZone business={business} onOpen={onAddClick} onFileDrop={onFileDrop} />
        ) : (
          <>
            <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {jobs.map((job, i) => (
                  <JobCard key={job.id} job={job} business={business} position={i + 1} user={user} onChanged={onChanged} />
                ))}
              </div>
            </SortableContext>
            <AddJobDropStrip business={business} onOpen={onAddClick} onFileDrop={onFileDrop} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Shared native-drag bookkeeping for the column's file-drop targets below.
 * Deliberately separate from @dnd-kit — these react to the browser's native
 * HTML5 drag-and-drop events (a file dragged in from Finder), which never
 * fire during a dnd-kit pointer-based card drag, so the two systems can't
 * conflict.
 */
function useColumnFileDrop(onFileDrop: ((file: File, notice: string | null) => void) | undefined) {
  const dragCounter = useRef(0);
  const [dragState, setDragState] = useState<'none' | 'valid' | 'invalid'>('none');
  const [message, setMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMessage(text: string) {
    setMessage(text);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 5000);
  }

  const disabled = !onFileDrop;

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragCounter.current += 1;
    setDragState(dataTransferLooksInvalid(event.dataTransfer) ? 'invalid' : 'valid');
  }
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }
  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragState('none');
  }
  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragState('none');
    if (disabled) return;

    const { file, error } = pickScreenshotFile(event.dataTransfer.files);
    if (error) showMessage(error);
    if (file) onFileDrop(file, error);
  }

  return { dragState, message, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

function EmptyColumnDropZone({
  business,
  onOpen,
  onFileDrop,
}: {
  business: Business;
  onOpen: () => void;
  onFileDrop?: (file: File, notice: string | null) => void;
}) {
  const { dragState, message, handlers } = useColumnFileDrop(onFileDrop);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Drop a plate screenshot here, or click to add a job for ${businessLabels[business]}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        {...handlers}
        className={clsx(
          'flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
          dragState === 'valid' && 'border-accent-500 bg-accent-50 text-accent-600',
          dragState === 'invalid' && 'border-danger-500 bg-danger-50 text-danger-600',
          dragState === 'none' && 'border-charcoal-200 text-charcoal-400 hover:border-accent-400 hover:text-accent-600',
        )}
      >
        {dragState === 'invalid' ? (
          <AlertCircle className="h-8 w-8" strokeWidth={2} aria-hidden="true" />
        ) : (
          <ImagePlus className="h-8 w-8" strokeWidth={2} aria-hidden="true" />
        )}
        <span className="text-sm font-bold tracking-wide">
          {dragState === 'invalid'
            ? 'Unsupported file type'
            : dragState === 'valid'
              ? 'Drop image to create a job'
              : 'Drop a plate screenshot here'}
        </span>
        {dragState === 'none' && <span className="text-xs font-medium text-charcoal-400">or click to add a job</span>}
      </div>
      {message && (
        <p role="status" className="mt-2 text-center text-xs font-medium text-charcoal-500">
          {message}
        </p>
      )}
    </div>
  );
}

/** Compact, always-visible counterpart to EmptyColumnDropZone for a column that already has jobs. */
function AddJobDropStrip({
  business,
  onOpen,
  onFileDrop,
}: {
  business: Business;
  onOpen: () => void;
  onFileDrop?: (file: File, notice: string | null) => void;
}) {
  const { dragState, message, handlers } = useColumnFileDrop(onFileDrop);

  return (
    <div className="pt-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Add a job for ${businessLabels[business]}, or drop an image to create one`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        {...handlers}
        className={clsx(
          'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-xs font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
          dragState === 'valid' && 'border-accent-500 bg-accent-50 text-accent-600',
          dragState === 'invalid' && 'border-danger-500 bg-danger-50 text-danger-600',
          dragState === 'none' && 'border-charcoal-200 text-charcoal-400 hover:border-accent-400 hover:text-accent-600',
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        {dragState === 'invalid' ? 'Unsupported file type' : dragState === 'valid' ? 'Drop image to create a job' : 'Add Job'}
      </div>
      {message && (
        <p role="status" className="mt-1 text-center text-[11px] font-medium text-charcoal-400">
          {message}
        </p>
      )}
    </div>
  );
}
