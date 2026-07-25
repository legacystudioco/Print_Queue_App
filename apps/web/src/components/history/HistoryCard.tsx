'use client';

import { formatPrintTime, type JobFileRecord, type PrintJobRecord } from '@print-queue/shared';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { StatusBadge, jobDisplayStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import { JobFileList } from '@/components/job/JobFileList';
import type { JobDisplayFlags } from '@/lib/server/data';

type RequeueState = 'idle' | 'requeuing' | 'done' | 'error';

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return '—';
  return formatPrintTime(Math.round(ms / 60000));
}

export function HistoryCard({
  job,
  creatorName,
  isAdmin,
  fileAvailable,
}: {
  job: PrintJobRecord & { files: JobFileRecord[] } & JobDisplayFlags;
  creatorName: string;
  isAdmin: boolean;
  fileAvailable: boolean;
}) {
  const [state, setState] = useState<RequeueState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleRequeue() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState('requeuing');
    setMessage(null);

    try {
      const res = await fetch(`/api/jobs/${job.id}/requeue`, { method: 'POST' });
      const body: unknown = await res.json().catch(() => ({}));
      const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

      if (!res.ok) {
        setState('error');
        setMessage(typeof record.error === 'string' ? record.error : 'Could not requeue this job.');
        return;
      }

      setState('done');
      setMessage('Job added back to the queue.');
    } catch {
      setState('error');
      setMessage('Could not requeue this job.');
    } finally {
      resetTimer.current = setTimeout(() => setState('idle'), 4000);
    }
  }

  return (
    <Card className="space-y-1">
      <Link href={`/jobs/${job.id}`} className="block space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">{job.name}</p>
          <StatusBadge status={jobDisplayStatus(job.status, job)} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            Started <LocalTime iso={job.startedAt} />
          </span>
          <span>Duration {formatDuration(job.startedAt, job.completedAt)}</span>
          <span>By {creatorName}</span>
        </div>
        <JobFileList files={job.files} />
      </Link>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 border-t border-charcoal-100 pt-3">
          <Button
            variant="secondary"
            size="md"
            onClick={handleRequeue}
            disabled={!fileAvailable || state === 'requeuing'}
            loading={state === 'requeuing'}
          >
            {state === 'idle' && (
              <>
                <RefreshCw className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Requeue
              </>
            )}
            {state === 'requeuing' && 'Requeuing…'}
            {state === 'done' && (
              <>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Requeued
              </>
            )}
            {state === 'error' && (
              <>
                <XCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Failed to requeue
              </>
            )}
          </Button>
          {!fileAvailable && state === 'idle' && (
            <p className="break-words text-xs text-charcoal-400">Original print file is no longer available.</p>
          )}
          {state === 'done' && message && <p className="break-words text-xs font-medium text-success-600">{message}</p>}
          {state === 'error' && message && <p className="break-words text-xs font-medium text-danger-600">{message}</p>}
        </div>
      )}
    </Card>
  );
}
