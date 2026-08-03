'use client';

import { businessLabels, businesses, type AppUser, type Business } from '@print-queue/shared';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AddJobDialog } from './AddJobDialog';
import { BoardColumn, type DropState } from './BoardColumn';
import { QueueHero } from '../queue/QueueHero';
import type { BoardJob } from '../queue/types';

const COLUMN_ORDER: readonly Business[] = businesses;

type OverData = { type?: 'column' | 'card'; business?: Business };
type DragState = { jobId: string; sourceBusiness: Business; overBusiness: Business | null };

/** Reorders the members of `business`'s column, leaving every other job's position untouched. */
function applyColumnOrder(all: BoardJob[], business: Business, orderedColumnJobs: BoardJob[]): BoardJob[] {
  const orderedIds = orderedColumnJobs.map((j) => j.id);
  const byId = new Map(all.map((j) => [j.id, j]));
  let cursor = 0;
  return all.map((j) => {
    if (j.business !== business) return j;
    const nextId = orderedIds[cursor++];
    return (nextId !== undefined ? byId.get(nextId) : undefined) ?? j;
  });
}

/** Reassigns `jobId` to `destBusiness`, inserting it before `insertBeforeId` (or at the end of that column if null). */
function moveJobToColumn(all: BoardJob[], jobId: string, destBusiness: Business, insertBeforeId: string | null): BoardJob[] {
  const job = all.find((j) => j.id === jobId);
  if (!job) return all;
  const updatedJob: BoardJob = { ...job, business: destBusiness };
  const rest = all.filter((j) => j.id !== jobId);

  if (insertBeforeId !== null) {
    const insertIndex = rest.findIndex((j) => j.id === insertBeforeId);
    const result = [...rest];
    result.splice(insertIndex === -1 ? rest.length : insertIndex, 0, updatedJob);
    return result;
  }

  let lastIndexOfDest = -1;
  rest.forEach((j, i) => {
    if (j.business === destBusiness) lastIndexOfDest = i;
  });
  const result = [...rest];
  result.splice(lastIndexOfDest + 1, 0, updatedJob);
  return result;
}

/** Column containers first, then the hovered column's own cards — keeps the pointer from "jumping" to a card in an unrelated column. */
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const columnCollision = pointerCollisions.find(
    (c) => args.droppableContainers.find((dc) => dc.id === c.id)?.data.current?.type === 'column',
  );

  if (!columnCollision) {
    return closestCenter(args);
  }

  const hoveredBusiness = args.droppableContainers.find((dc) => dc.id === columnCollision.id)?.data.current
    ?.business as Business | undefined;

  const cardContainers = args.droppableContainers.filter(
    (container) => container.data.current?.type === 'card' && container.data.current?.business === hoveredBusiness,
  );

  if (cardContainers.length === 0) {
    return [{ id: columnCollision.id }];
  }

  const cardCollisions = closestCenter({ ...args, droppableContainers: cardContainers });
  return cardCollisions.length > 0 ? cardCollisions : [{ id: columnCollision.id }];
};

export function ProductionBoard({ initialJobs, user }: { initialJobs: BoardJob[]; user: AppUser }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [saving, setSaving] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAdmin = user.role === 'admin';

  // Keep local state in sync with the server-rendered data whenever this
  // route refreshes (router.refresh(), including from the realtime
  // subscription below) — a Client Component's useState only reads its
  // initializer once.
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('production-board-print-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => router.refresh())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistReorder(business: Business, orderedColumnJobs: BoardJob[]) {
    setSaving(true);
    try {
      const reorderable = orderedColumnJobs.filter((j) => j.status === 'queued');
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, orderedJobIds: reorderable.map((j) => j.id) }),
      });
      if (!res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function persistCrossColumnMove(
    jobId: string,
    destBusiness: Business,
    insertBeforeId: string | null,
    jobsSnapshot: BoardJob[],
  ) {
    setSaving(true);
    try {
      const moveRes = await fetch(`/api/jobs/${jobId}/move-business`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: destBusiness }),
      });
      if (!moveRes.ok) {
        router.refresh();
        return;
      }
      if (insertBeforeId !== null) {
        const destColumnJobs = jobsSnapshot.filter((j) => j.business === destBusiness && j.status === 'queued');
        const reorderRes = await fetch('/api/queue/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business: destBusiness, orderedJobIds: destColumnJobs.map((j) => j.id) }),
        });
        if (!reorderRes.ok) router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const job = jobs.find((j) => j.id === event.active.id);
    if (!job) return;
    setDragState({ jobId: job.id, sourceBusiness: job.business, overBusiness: job.business });
  }

  function handleDragOver(event: DragOverEvent) {
    if (!dragState) return;
    const overData = event.over?.data.current as OverData | undefined;
    const overBusiness = overData?.business ?? null;
    if (overBusiness === dragState.overBusiness) return;
    setDragState((prev) => (prev ? { ...prev, overBusiness } : prev));
  }

  function handleDragEnd(event: DragEndEvent) {
    const currentDragState = dragState;
    setDragState(null);
    const { active, over } = event;
    if (!over || !currentDragState) return;

    const job = jobs.find((j) => j.id === active.id);
    if (!job) return;

    const overData = over.data.current as OverData | undefined;
    const finalBusiness = overData?.business;
    if (!finalBusiness) return;

    if (finalBusiness === currentDragState.sourceBusiness) {
      const columnJobs = jobs.filter((j) => j.business === job.business);
      const oldIndex = columnJobs.findIndex((j) => j.id === active.id);
      const newIndex = overData?.type === 'card' ? columnJobs.findIndex((j) => j.id === over.id) : columnJobs.length - 1;
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const reordered = arrayMove(columnJobs, oldIndex, newIndex);
      setJobs((prev) => applyColumnOrder(prev, job.business, reordered));
      void persistReorder(job.business, reordered);
      return;
    }

    const insertBeforeId = overData?.type === 'card' ? (over.id as string) : null;
    const nextJobs = moveJobToColumn(jobs, job.id, finalBusiness, insertBeforeId);
    setJobs(nextJobs);
    void persistCrossColumnMove(job.id, finalBusiness, insertBeforeId, nextJobs);
  }

  const draggedJob = useMemo(() => (dragState ? jobs.find((j) => j.id === dragState.jobId) ?? null : null), [dragState, jobs]);

  return (
    <div aria-busy={saving}>
      <QueueHero onAddClick={() => setDialogOpen(true)} canAdd={isAdmin} />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragState(null)}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              const job = jobs.find((j) => j.id === active.id);
              return job ? `Picked up ${job.name}.` : '';
            },
            onDragOver({ active, over }) {
              const job = jobs.find((j) => j.id === active.id);
              const business = (over?.data.current as OverData | undefined)?.business;
              if (!job || !business) return '';
              return `${job.name} is over the ${businessLabels[business]} column.`;
            },
            onDragEnd({ active, over }) {
              const job = jobs.find((j) => j.id === active.id);
              if (!job) return '';
              const business = (over?.data.current as OverData | undefined)?.business;
              if (!business) return `${job.name} drop cancelled.`;
              return `${job.name} moved to the ${businessLabels[business]} column.`;
            },
            onDragCancel({ active }) {
              const job = jobs.find((j) => j.id === active.id);
              return job ? `Moving ${job.name} was cancelled.` : '';
            },
          },
        }}
      >
        <div className="flex flex-col divide-y divide-charcoal-200 md:h-[calc(100vh-22rem)] md:min-h-[32rem] md:flex-row md:divide-x md:divide-y-0">
          {COLUMN_ORDER.map((business) => {
            const columnJobs = jobs.filter((j) => j.business === business);
            const dropState: DropState =
              dragState && dragState.overBusiness === business && business !== dragState.sourceBusiness
                ? 'valid'
                : 'none';

            return (
              <BoardColumn
                key={business}
                business={business}
                jobs={columnJobs}
                user={user}
                onChanged={() => router.refresh()}
                dropState={dropState}
                onAddClick={() => setDialogOpen(true)}
              />
            );
          })}
        </div>

        <DragOverlay>
          {draggedJob ? (
            <div className="w-72 rounded-xl border border-accent-400 bg-white px-3 py-2 text-sm font-bold text-charcoal-900 shadow-panel-lift">
              {draggedJob.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddJobDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
