'use client';

import {
  activePrintJobStatuses,
  getPrinterDefinition,
  type AppUser,
  type PrinterBrand,
  type PrinterRecord,
} from '@print-queue/shared';
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
import { PrinterColumn, type DropState } from './PrinterColumn';
import { QueueHero } from './QueueHero';
import type { QueueJob } from './types';

const COLUMN_ORDER: PrinterBrand[] = ['flashforge', 'bambu', 'snapmaker'];

type OverData = { type?: 'column' | 'card'; brand?: PrinterBrand };
type DialogState = { open: boolean; presetFile?: { brand: PrinterBrand; file: File } };
type DragState = { jobId: string; sourceBrand: PrinterBrand; overBrand: PrinterBrand | null; compatible: boolean };

/** Reorders the members of `printerId`'s column, leaving every other job's position untouched. */
function applyColumnOrder(all: QueueJob[], printerId: string, orderedColumnJobs: QueueJob[]): QueueJob[] {
  const orderedIds = orderedColumnJobs.map((j) => j.id);
  const byId = new Map(all.map((j) => [j.id, j]));
  let cursor = 0;
  return all.map((j) => {
    if (j.printerId !== printerId) return j;
    const nextId = orderedIds[cursor++];
    return (nextId !== undefined ? byId.get(nextId) : undefined) ?? j;
  });
}

/** Reassigns `jobId` to `destPrinterId`, inserting it before `insertBeforeId` (or at the end of that printer's jobs if null). */
function moveJobToColumn(all: QueueJob[], jobId: string, destPrinterId: string, insertBeforeId: string | null): QueueJob[] {
  const job = all.find((j) => j.id === jobId);
  if (!job) return all;
  const updatedJob: QueueJob = { ...job, printerId: destPrinterId };
  const rest = all.filter((j) => j.id !== jobId);

  if (insertBeforeId !== null) {
    const insertIndex = rest.findIndex((j) => j.id === insertBeforeId);
    const result = [...rest];
    result.splice(insertIndex === -1 ? rest.length : insertIndex, 0, updatedJob);
    return result;
  }

  let lastIndexOfDest = -1;
  rest.forEach((j, i) => {
    if (j.printerId === destPrinterId) lastIndexOfDest = i;
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

  const hoveredBrand = args.droppableContainers.find((dc) => dc.id === columnCollision.id)?.data.current?.brand as
    | PrinterBrand
    | undefined;

  const cardContainers = args.droppableContainers.filter(
    (container) => container.data.current?.type === 'card' && container.data.current?.brand === hoveredBrand,
  );

  if (cardContainers.length === 0) {
    return [{ id: columnCollision.id }];
  }

  const cardCollisions = closestCenter({ ...args, droppableContainers: cardContainers });
  return cardCollisions.length > 0 ? cardCollisions : [{ id: columnCollision.id }];
};

export function QueueBoard({
  initialJobs,
  user,
  printers,
  printerStatus,
}: {
  initialJobs: QueueJob[];
  user: AppUser;
  printers: PrinterRecord[];
  printerStatus: Record<string, { bridgeOnline: boolean; progressPercent: number | undefined }>;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<PrinterBrand, Set<string>>>({
    bambu: new Set(),
    snapmaker: new Set(),
    flashforge: new Set(),
  });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ open: false });

  const isAdmin = user.role === 'admin';

  // Keep local state in sync with the server-rendered data whenever this
  // route refreshes (router.refresh(), including from the realtime
  // subscription below) — see QueueList's original comment for why this is
  // needed: a Client Component's useState only reads its initializer once.
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (printers.length === 0) return;
    const printerIds = printers.map((p) => p.id);

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`queue-print-jobs-${printerIds.join(',')}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs', filter: `printer_id=in.(${printerIds.join(',')})` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printers.map((p) => p.id).join(','), router]);

  // A job that leaves its column's waiting set (started printing, got
  // removed/completed elsewhere) can't stay selected.
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const brand of COLUMN_ORDER) {
        const printerId = printers.find((p) => p.brand === brand)?.id;
        const waitingIds = new Set(
          jobs.filter((j) => j.printerId === printerId && (j.status === 'queued' || j.status === 'ready')).map((j) => j.id),
        );
        const filtered = new Set([...prev[brand]].filter((id) => waitingIds.has(id)));
        if (filtered.size !== prev[brand].size) {
          next[brand] = filtered;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map((j) => `${j.id}:${j.printerId}:${j.status}`).join(',')]);

  // Forbidden cursor while hovering an incompatible column during a drag.
  useEffect(() => {
    const forbidden = dragState != null && dragState.overBrand != null && !dragState.compatible;
    document.body.style.cursor = forbidden ? 'not-allowed' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [dragState]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistReorder(printerId: string, orderedColumnJobs: QueueJob[]) {
    setSaving(true);
    try {
      const reorderable = orderedColumnJobs.filter((j) => j.status === 'queued' || j.status === 'ready');
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId, orderedJobIds: reorderable.map((j) => j.id) }),
      });
      if (!res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function persistCrossColumnMove(
    jobId: string,
    destPrinterId: string,
    insertBeforeId: string | null,
    jobsSnapshot: QueueJob[],
  ) {
    setSaving(true);
    try {
      const reassignRes = await fetch(`/api/jobs/${jobId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrinterId: destPrinterId }),
      });
      if (!reassignRes.ok) {
        router.refresh();
        return;
      }
      if (insertBeforeId !== null) {
        const destColumnJobs = jobsSnapshot.filter(
          (j) => j.printerId === destPrinterId && (j.status === 'queued' || j.status === 'ready'),
        );
        const reorderRes = await fetch('/api/queue/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerId: destPrinterId, orderedJobIds: destColumnJobs.map((j) => j.id) }),
        });
        if (!reorderRes.ok) router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const job = jobs.find((j) => j.id === event.active.id);
    const sourceBrand = job ? printers.find((p) => p.id === job.printerId)?.brand : undefined;
    if (!job || !sourceBrand) return;
    setDragState({ jobId: job.id, sourceBrand, overBrand: sourceBrand, compatible: true });
  }

  function handleDragOver(event: DragOverEvent) {
    if (!dragState) return;
    const overData = event.over?.data.current as OverData | undefined;
    const overBrand = overData?.brand ?? null;
    if (overBrand === dragState.overBrand) return;

    if (!overBrand) {
      setDragState((prev) => (prev ? { ...prev, overBrand: null, compatible: false } : prev));
      return;
    }

    const job = jobs.find((j) => j.id === dragState.jobId);
    const destPrinter = printers.find((p) => p.brand === overBrand);
    const compatible = !!job && destPrinter != null && job.files.some((f) => f.printerBrand === overBrand);
    setDragState((prev) => (prev ? { ...prev, overBrand, compatible } : prev));
  }

  function handleDragEnd(event: DragEndEvent) {
    const currentDragState = dragState;
    setDragState(null);
    const { active, over } = event;
    if (!over || !currentDragState) return;

    const job = jobs.find((j) => j.id === active.id);
    if (!job) return;

    const overData = over.data.current as OverData | undefined;
    const finalBrand = overData?.brand;
    if (!finalBrand) return;

    if (finalBrand === currentDragState.sourceBrand) {
      const columnJobs = jobs.filter((j) => j.printerId === job.printerId);
      const oldIndex = columnJobs.findIndex((j) => j.id === active.id);
      const newIndex = overData?.type === 'card' ? columnJobs.findIndex((j) => j.id === over.id) : columnJobs.length - 1;
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const reordered = arrayMove(columnJobs, oldIndex, newIndex);
      setJobs((prev) => applyColumnOrder(prev, job.printerId, reordered));
      void persistReorder(job.printerId, reordered);
      return;
    }

    const destPrinter = printers.find((p) => p.brand === finalBrand);
    const compatible = destPrinter != null && job.files.some((f) => f.printerBrand === finalBrand);
    if (!compatible || !destPrinter) return;

    const insertBeforeId = overData?.type === 'card' ? (over.id as string) : null;
    const nextJobs = moveJobToColumn(jobs, job.id, destPrinter.id, insertBeforeId);
    setJobs(nextJobs);
    void persistCrossColumnMove(job.id, destPrinter.id, insertBeforeId, nextJobs);
  }

  function toggleSelect(brand: PrinterBrand, jobId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev[brand]);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return { ...prev, [brand]: next };
    });
  }

  function selectAll(brand: PrinterBrand, printerId: string | undefined) {
    const ids = jobs.filter((j) => j.printerId === printerId && (j.status === 'queued' || j.status === 'ready')).map((j) => j.id);
    setSelectedIds((prev) => ({ ...prev, [brand]: new Set(ids) }));
  }

  function clearSelection(brand: PrinterBrand) {
    setSelectedIds((prev) => ({ ...prev, [brand]: new Set() }));
  }

  function openDialog(presetFile?: { brand: PrinterBrand; file: File }) {
    setDialogState({ open: true, presetFile });
  }

  function closeDialog() {
    setDialogState({ open: false });
  }

  const draggedJob = useMemo(() => (dragState ? jobs.find((j) => j.id === dragState.jobId) ?? null : null), [dragState, jobs]);

  return (
    <div aria-busy={saving}>
      <QueueHero onAddClick={() => openDialog()} canAdd={isAdmin} />

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
              const brand = (over?.data.current as OverData | undefined)?.brand;
              if (!job || !brand) return '';
              return `${job.name} is over the ${getPrinterDefinition(brand).name} column.`;
            },
            onDragEnd({ active, over }) {
              const job = jobs.find((j) => j.id === active.id);
              if (!job) return '';
              const brand = (over?.data.current as OverData | undefined)?.brand;
              if (!brand) return `${job.name} drop cancelled.`;
              return `${job.name} moved to the ${getPrinterDefinition(brand).name} column.`;
            },
            onDragCancel({ active }) {
              const job = jobs.find((j) => j.id === active.id);
              return job ? `Moving ${job.name} was cancelled.` : '';
            },
          },
        }}
      >
        <div className="flex flex-col divide-y divide-charcoal-200 md:h-[calc(100vh-22rem)] md:min-h-[32rem] md:flex-row md:divide-x md:divide-y-0">
          {COLUMN_ORDER.map((brand) => {
            const printer = printers.find((p) => p.brand === brand) ?? null;
            const columnJobs = jobs.filter((j) => j.printerId === printer?.id);
            const currentJob =
              columnJobs.find((j) => (activePrintJobStatuses as readonly string[]).includes(j.status)) ?? null;
            const status = printer ? printerStatus[printer.id] : undefined;
            const dropState: DropState =
              !dragState || dragState.overBrand !== brand || brand === dragState.sourceBrand
                ? 'none'
                : dragState.compatible
                  ? 'valid'
                  : 'invalid';

            return (
              <PrinterColumn
                key={brand}
                brand={brand}
                printer={printer}
                bridgeOnline={status?.bridgeOnline ?? false}
                jobs={columnJobs}
                currentJob={currentJob}
                progressPercent={status?.progressPercent}
                user={user}
                selectedIds={selectedIds[brand]}
                onToggleSelect={(jobId) => toggleSelect(brand, jobId)}
                onSelectAll={() => selectAll(brand, printer?.id)}
                onClearSelection={() => clearSelection(brand)}
                onRemoved={() => router.refresh()}
                dropState={dropState}
                onAddClick={() => openDialog()}
                onFileDrop={(file) => openDialog({ brand, file })}
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

      <AddJobDialog open={dialogState.open} onClose={closeDialog} printers={printers} presetFile={dialogState.presetFile} />
    </div>
  );
}
