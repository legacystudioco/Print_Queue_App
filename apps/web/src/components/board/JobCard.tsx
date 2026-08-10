'use client';

import { deriveJobStatus, formatPrintTime, summarizePlateCounts, summarizePlateTime, type AppUser, type Business } from '@print-queue/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { BookmarkPlus, ChevronDown, FolderInput, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { AddPlateDialog } from './AddPlateDialog';
import { EditPlateDialog } from './EditPlateDialog';
import { MoveIntoJobDialog } from './MoveIntoJobDialog';
import { PlateRow } from './PlateRow';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import type { BoardJob, BoardPlate } from '../queue/types';

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
  const [expanded, setExpanded] = useState(false);
  const [addPlateOpen, setAddPlateOpen] = useState(false);
  const [editingPlate, setEditingPlate] = useState<BoardPlate | null>(null);
  const [moveIntoJobOpen, setMoveIntoJobOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const isStandalone = job.plates.length === 1;
  const draggable = isAdmin && job.completedAt === null;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    disabled: !draggable,
    data: { type: 'card', business },
  });

  const status = deriveJobStatus(job.plates.map((p) => p.status));
  const counts = summarizePlateCounts(job.plates);
  const time = summarizePlateTime(job.plates);
  const remaining = counts.total - counts.completed;

  function handleDeleteCustomer() {
    if (!window.confirm(`Delete "${job.customerName}" and all ${counts.total} of its plates? This cannot be undone.`))
      return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Delete failed');
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
        status === 'printing' ? 'border-l-4 border-l-accent-500' : 'border-l-4 border-l-transparent',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        {draggable ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${job.customerName}`}
            className="touch-target -ml-1 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-charcoal-300 hover:text-charcoal-600 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
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
              {job.customerName}
            </Link>
            <StatusBadge status={status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-7 text-xs text-charcoal-500">
            <span className="font-semibold">
              {counts.completed} / {counts.total} plates complete
            </span>
            <span>{remaining} remaining</span>
            {(time.remainingMinutes > 0 || time.missingCount > 0) && (
              <span>~{formatPrintTime(time.remainingMinutes)} remaining</span>
            )}
          </div>
          {job.notes && <p className="truncate pl-7 text-xs text-charcoal-400">{job.notes}</p>}
        </div>
      </div>

      {error && <p className="pl-7 text-xs font-medium text-danger-600">{error}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-charcoal-100 pt-2 pl-7">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-charcoal-600 hover:text-accent-600"
        >
          <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
          {expanded ? 'Collapse' : 'Expand'}
        </button>

        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAddPlateOpen(true)}
              title="Add plate"
              aria-label={`Add a plate to ${job.customerName}`}
              className="touch-target inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-charcoal-300 px-2.5 text-xs font-bold tracking-wide text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Add Plate
            </button>
            <Link
              href={`/jobs/${job.id}/edit`}
              aria-label={`Edit ${job.customerName}`}
              title="Edit customer"
              className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
            >
              <Pencil className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setSaveAsTemplateOpen(true)}
              aria-label={`Save ${job.customerName} as a template`}
              title="Save as Template"
              className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
            >
              <BookmarkPlus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
            {isStandalone && (
              <button
                type="button"
                onClick={() => setMoveIntoJobOpen(true)}
                aria-label={`Move ${job.customerName} into another job`}
                title="Move into Job…"
                className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
              >
                <FolderInput className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={handleDeleteCustomer}
              disabled={isPending}
              aria-label={`Delete ${job.customerName}`}
              title="Delete customer"
              className="touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-danger-500/60 text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="space-y-1.5 pl-7">
          {job.plates.map((plate) => (
            <PlateRow
              key={plate.id}
              plate={plate}
              isAdmin={isAdmin}
              onChanged={onChanged}
              onEdit={() => setEditingPlate(plate)}
              canRemoveFromJob={!isStandalone}
            />
          ))}
        </div>
      )}

      <AddPlateDialog
        jobId={job.id}
        open={addPlateOpen}
        onClose={() => setAddPlateOpen(false)}
        onDone={() => {
          setAddPlateOpen(false);
          onChanged();
        }}
      />
      {editingPlate && (
        <EditPlateDialog
          plate={editingPlate}
          open={editingPlate !== null}
          onClose={() => setEditingPlate(null)}
          onDone={() => {
            setEditingPlate(null);
            onChanged();
          }}
        />
      )}
      {isStandalone && (
        <MoveIntoJobDialog
          sourceJobId={job.id}
          sourceJobName={job.customerName}
          open={moveIntoJobOpen}
          onClose={() => setMoveIntoJobOpen(false)}
          onDone={() => {
            setMoveIntoJobOpen(false);
            onChanged();
          }}
        />
      )}
      <SaveAsTemplateDialog job={job} open={saveAsTemplateOpen} onClose={() => setSaveAsTemplateOpen(false)} />
    </Card>
  );
}
