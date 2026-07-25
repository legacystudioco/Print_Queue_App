'use client';

import { PRINTERS, type AppUser, type PrinterBrand, type PrinterRecord, type PrintJobWithSlots } from '@print-queue/shared';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/States';
import type { JobDisplayFlags } from '@/lib/server/data';
import { isWaitingQueueJob, summarizePrintTime } from '@/lib/client/queueTime';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { QueueCard } from './QueueCard';
import { QueueTimeSummary } from './QueueTimeSummary';

type QueueJob = PrintJobWithSlots & JobDisplayFlags;
type TabValue = 'all' | PrinterBrand;

/** Reorders `current` so the items whose ids appear in `visibleIdsInNewOrder` take on that
 * relative order, leaving every other item's position untouched. */
function applyVisibleOrder(current: QueueJob[], visibleIdsInNewOrder: string[]): QueueJob[] {
  const visibleSet = new Set(visibleIdsInNewOrder);
  const byId = new Map(current.map((j) => [j.id, j]));
  let cursor = 0;
  return current.map((j) => {
    if (!visibleSet.has(j.id)) return j;
    const nextId = visibleIdsInNewOrder[cursor++];
    return (nextId !== undefined ? byId.get(nextId) : undefined) ?? j;
  });
}

export function QueueList({
  initialJobs,
  user,
  printers,
}: {
  initialJobs: QueueJob[];
  user: AppUser;
  printers: PrinterRecord[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // If there's only one configured printer, default straight to its tab so
  // reordering (and everything else) works exactly like the single-printer
  // app did — the "All" tab only matters once there's something to merge.
  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    printers.length === 1 && printers[0] ? printers[0].brand : 'all',
  );

  // The server re-renders and hands us a fresh `initialJobs` array whenever
  // this route's data is refreshed (router.refresh(), including from the
  // realtime subscription below) — but a Client Component's own useState
  // only reads its initializer on mount, so without this the on-screen
  // list (and every total derived from it) would silently go stale after
  // the first load. See requirement 7 in the queue-time-summary feature.
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Print jobs change from several places this page never touches directly
  // (another tab uploading a print, the job edit page, the bridge moving a
  // job into printing/completed) — Realtime is how the queue and its totals
  // stay live without polling. See supabase/migrations/0007_realtime.sql,
  // which enabled this for exactly this purpose.
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

  const visibleJobs = activeTab === 'all' ? jobs : jobs.filter((j) => j.files.some((f) => f.printerBrand === activeTab));

  // A job that leaves the waiting queue (started printing, got skipped/
  // removed/completed elsewhere) can't stay selected — its checkbox is
  // gone, and it's no longer part of what Total/Selected Print Time mean.
  useEffect(() => {
    const waitingIds = new Set(visibleJobs.filter((j) => isWaitingQueueJob(j.status)).map((j) => j.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => waitingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleJobs.map((j) => `${j.id}:${j.status}`).join(',')]);

  // Reordering is only well-defined within one printer's own queue. The
  // active tab maps to exactly one printer (given at most one device per
  // brand) — but a job can appear under a brand tab purely because it has a
  // file for that brand, even while assigned to a different printer (e.g.
  // after "Move To" or "Add Printer File"). Only allow reordering when every
  // visible job is actually that printer's — otherwise a drag could silently
  // fail to match the server's active-queue set.
  const printerIdForTab = activeTab === 'all' ? null : (printers.find((p) => p.brand === activeTab)?.id ?? null);
  const reorderingEnabled = printerIdForTab !== null && visibleJobs.every((j) => j.printerId === printerIdForTab);

  async function persistOrder(nextVisible: QueueJob[]) {
    if (!printerIdForTab) return;
    setJobs((prev) => applyVisibleOrder(prev, nextVisible.map((j) => j.id)));
    setSaving(true);
    const reorderable = nextVisible.filter((j) => j.status === 'queued' || j.status === 'ready');
    try {
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: printerIdForTab, orderedJobIds: reorderable.map((j) => j.id) }),
      });
      if (!res.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function move(jobId: string, direction: 'up' | 'down') {
    const index = visibleJobs.findIndex((j) => j.id === jobId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= visibleJobs.length) return;

    const next = [...visibleJobs];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(swapWith, 0, moved);
    void persistOrder(next);
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...visibleJobs];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    void persistOrder(next);
  }

  function toggleSelected(jobId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  const waitingJobs = visibleJobs.filter((j) => isWaitingQueueJob(j.status));

  function selectAll() {
    setSelectedIds(new Set(waitingJobs.map((j) => j.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...PRINTERS.map((p) => ({ value: p.id as TabValue, label: p.name })),
  ];

  return (
    <div className="space-y-3" aria-busy={saving}>
      <div className="flex gap-1 border-b border-charcoal-100">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={clsx(
              'touch-target rounded-t-lg px-3 text-sm font-bold transition-colors',
              activeTab === tab.value
                ? 'border-b-2 border-accent-500 text-accent-600'
                : 'text-charcoal-400 hover:text-charcoal-600',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          description={
            user.role === 'admin' ? 'Add a print to get started.' : 'Ask an admin to add a print to the queue.'
          }
        />
      ) : visibleJobs.length === 0 ? (
        <EmptyState title="No jobs here" description="No queued jobs have a file for this printer." />
      ) : (
        <>
          <QueueTimeSummary
            totalMinutes={summarizePrintTime(waitingJobs).totalMinutes}
            totalMissingCount={summarizePrintTime(waitingJobs).missingCount}
            eligibleCount={waitingJobs.length}
            selectedCount={selectedIds.size}
            selectedMinutes={summarizePrintTime(waitingJobs.filter((j) => selectedIds.has(j.id))).totalMinutes}
            selectedMissingCount={summarizePrintTime(waitingJobs.filter((j) => selectedIds.has(j.id))).missingCount}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
          />

          {reorderingEnabled && waitingJobs.length > 1 && (
            <p className="hidden text-xs text-slate-400 md:block">
              Drag cards to reorder, or use the up/down buttons.
            </p>
          )}
          {visibleJobs.map((job, i) => {
            const draggable = reorderingEnabled && user.role === 'admin' && (job.status === 'queued' || job.status === 'ready');
            const selectable = isWaitingQueueJob(job.status);
            return (
              <div
                key={job.id}
                draggable={draggable}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => draggable && e.preventDefault()}
                onDrop={() => draggable && handleDrop(i)}
                className={dragIndex === i ? 'opacity-50' : undefined}
              >
                <QueueCard
                  job={job}
                  position={i + 1}
                  user={user}
                  printers={printers}
                  isFirst={i === 0}
                  isLast={i === visibleJobs.length - 1}
                  reorderable={reorderingEnabled}
                  selectable={selectable}
                  selected={selectedIds.has(job.id)}
                  onToggleSelect={() => toggleSelected(job.id)}
                  onMove={(direction) => move(job.id, direction)}
                  onRemoved={() => router.refresh()}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
