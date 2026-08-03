'use client';

import { Check, Play, Trash2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PartialReprintDialog } from '@/components/board/PartialReprintDialog';
import { Button } from '@/components/ui/Button';
import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';

/** Start Printing / Complete / Partial / Delete — the same actions available on the board card, for the detail page. */
export function JobDetailActions({ job }: { job: BoardJobWithScreenshotUrl }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);

  function setStatus(status: 'printing' | 'completed') {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Action failed');
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${job.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${job.id}/delete`, { method: 'DELETE' });
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
      <div className="flex flex-wrap items-center gap-2">
        {job.status === 'queued' && (
          <Button type="button" onClick={() => setStatus('printing')} loading={isPending}>
            <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Start Printing
          </Button>
        )}
        {job.status === 'printing' && (
          <>
            <Button type="button" onClick={() => setStatus('completed')} loading={isPending}>
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Complete
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPartialDialogOpen(true)} disabled={isPending}>
              <TriangleAlert className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Partial
            </Button>
          </>
        )}
        <Button type="button" variant="danger" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Delete
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-danger-600">{error}</p>}

      <PartialReprintDialog
        job={job}
        open={partialDialogOpen}
        onClose={() => setPartialDialogOpen(false)}
        onDone={() => {
          setPartialDialogOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
