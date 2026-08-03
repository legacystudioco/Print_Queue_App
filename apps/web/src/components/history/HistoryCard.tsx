'use client';

import { businessLabels } from '@print-queue/shared';
import { CheckCircle2, ImageOff, RefreshCw, XCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LocalTime } from '@/components/ui/LocalTime';
import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';

type RequeueState = 'idle' | 'requeuing' | 'done' | 'error';

export function HistoryCard({
  job,
  creatorName,
  isAdmin,
  screenshotAvailable,
}: {
  job: BoardJobWithScreenshotUrl;
  creatorName: string;
  isAdmin: boolean;
  screenshotAvailable: boolean;
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
      <Link href={`/jobs/${job.id}`} className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
          {job.screenshotUrl ? (
            <Image src={job.screenshotUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-charcoal-300">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-slate-900">{job.name}</p>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{businessLabels[job.business]}</span>
            <span>
              Completed <LocalTime iso={job.completedAt} />
            </span>
            <span>By {creatorName}</span>
          </div>
        </div>
      </Link>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 border-t border-charcoal-100 pt-3">
          <Button
            variant="secondary"
            size="md"
            onClick={handleRequeue}
            disabled={!screenshotAvailable || state === 'requeuing'}
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
          {!screenshotAvailable && state === 'idle' && (
            <p className="break-words text-xs text-charcoal-400">Original screenshot is no longer available.</p>
          )}
          {state === 'done' && message && <p className="break-words text-xs font-medium text-success-600">{message}</p>}
          {state === 'error' && message && <p className="break-words text-xs font-medium text-danger-600">{message}</p>}
        </div>
      )}
    </Card>
  );
}
