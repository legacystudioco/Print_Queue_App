'use client';

import type { AppUser, PrintJobWithSlots } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/States';
import type { JobDisplayFlags } from '@/lib/server/data';
import { isWaitingQueueJob, summarizePrintTime } from '@/lib/client/queueTime';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { QueueCard } from './QueueCard';
import { QueueTimeSummary } from './QueueTimeSummary';

type QueueJob = PrintJobWithSlots & JobDisplayFlags;

export function QueueList({
  initialJobs,
  user,
  printerId,
}: {
  initialJobs: QueueJob[];
  user: AppUser;
  printerId: string;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`queue-print-jobs-${printerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs', filter: `printer_id=eq.${printerId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [printerId, router]);

  // A job that leaves the waiting queue (started printing, got skipped/
  // removed/completed elsewhere) can't stay selected — its checkbox is
  // gone, and it's no longer part of what Total/Selected Print Time mean.
  useEffect(() => {
    const waitingIds = new Set(jobs.filter((j) => isWaitingQueueJob(j.status)).map((j) => j.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => waitingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  async function persistOrder(next: QueueJob[]) {
    setJobs(next);
    setSaving(true);
    const reorderable = next.filter((j) => j.status === 'queued' || j.status === 'ready');
    try {
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedJobIds: reorderable.map((j) => j.id) }),
      });
      if (!res.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function move(jobId: string, direction: 'up' | 'down') {
    const index = jobs.findIndex((j) => j.id === jobId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= jobs.length) return;

    const next = [...jobs];
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
    const next = [...jobs];
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

  const waitingJobs = jobs.filter((j) => isWaitingQueueJob(j.status));

  function selectAll() {
    setSelectedIds(new Set(waitingJobs.map((j) => j.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="Queue is empty"
        description={
          user.role === 'admin'
            ? 'Add a print to get started.'
            : 'Ask an admin to add a print to the queue.'
        }
      />
    );
  }

  const reorderableCount = waitingJobs.length;
  const { totalMinutes, missingCount: totalMissingCount } = summarizePrintTime(waitingJobs);
  const selectedJobs = waitingJobs.filter((j) => selectedIds.has(j.id));
  const { totalMinutes: selectedMinutes, missingCount: selectedMissingCount } = summarizePrintTime(selectedJobs);

  return (
    <div className="space-y-3" aria-busy={saving}>
      <QueueTimeSummary
        totalMinutes={totalMinutes}
        totalMissingCount={totalMissingCount}
        eligibleCount={waitingJobs.length}
        selectedCount={selectedJobs.length}
        selectedMinutes={selectedMinutes}
        selectedMissingCount={selectedMissingCount}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
      />

      {reorderableCount > 1 && (
        <p className="hidden text-xs text-slate-400 md:block">
          Drag cards to reorder, or use the up/down buttons.
        </p>
      )}
      {jobs.map((job, i) => {
        const draggable = user.role === 'admin' && (job.status === 'queued' || job.status === 'ready');
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
              isFirst={i === 0}
              isLast={i === jobs.length - 1}
              selectable={selectable}
              selected={selectedIds.has(job.id)}
              onToggleSelect={() => toggleSelected(job.id)}
              onMove={(direction) => move(job.id, direction)}
              onRemoved={() => router.refresh()}
            />
          </div>
        );
      })}
    </div>
  );
}
