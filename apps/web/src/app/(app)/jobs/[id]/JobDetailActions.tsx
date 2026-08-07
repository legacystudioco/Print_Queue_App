'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import type { BoardJob } from '@/components/queue/types';

/** Delete Customer — the one job-level (not plate-level) destructive action left on the detail page; Edit lives in the header, plate actions live in JobDetailPlates. */
export function JobDetailActions({ job }: { job: BoardJob }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(`Delete "${job.customerName}" and all ${job.plates.length} of its plates? This cannot be undone.`))
      return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Delete failed');
        return;
      }
      router.push('/queue');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="danger" onClick={handleDelete} disabled={isPending}>
        <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Delete Customer
      </Button>
      {error && <p className="text-sm font-medium text-danger-600">{error}</p>}
    </div>
  );
}
