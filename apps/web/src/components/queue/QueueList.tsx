'use client';

import type { AppUser, PrintJobWithSlots } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/States';
import { QueueCard } from './QueueCard';

export function QueueList({
  initialJobs,
  user,
}: {
  initialJobs: PrintJobWithSlots[];
  user: AppUser;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [saving, setSaving] = useState(false);

  async function persistOrder(next: PrintJobWithSlots[]) {
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

  const reorderableCount = jobs.filter((j) => j.status === 'queued' || j.status === 'ready').length;

  return (
    <div className="space-y-3" aria-busy={saving}>
      {reorderableCount > 1 && (
        <p className="hidden text-xs text-slate-400 md:block">
          Drag cards to reorder, or use the up/down buttons.
        </p>
      )}
      {jobs.map((job, i) => {
        const draggable = user.role === 'admin' && (job.status === 'queued' || job.status === 'ready');
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
              onMove={(direction) => move(job.id, direction)}
              onRemoved={() => router.refresh()}
            />
          </div>
        );
      })}
    </div>
  );
}
