'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { JobPickerList } from './JobPickerList';
import type { BoardJob } from '../queue/types';

/**
 * "Move into Job…" — merges a standalone job's plate(s) into an existing
 * job (see POST /api/jobs/[id]/move-into and move_job_into_job, migration
 * 0019). Any existing job can be a target, including one that's already
 * grouped — unlike the "Group Existing Jobs" wizard's candidate list, this
 * is not standalone-only.
 */
export function MoveIntoJobDialog({
  sourceJobId,
  sourceJobName,
  open,
  onClose,
  onDone,
}: {
  sourceJobId: string;
  sourceJobName: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<BoardJob | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!target) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${sourceJobId}/move-into`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetJobId: target.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to move job');
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move into Job">
      <div className="space-y-4">
        <p className="text-sm text-charcoal-500">
          Move <span className="font-semibold">{sourceJobName}</span> into an existing job as a plate. Its screenshot,
          status, and history are preserved.
        </p>
        <JobPickerList
          mode="single"
          excludeJobId={sourceJobId}
          selectedIds={target ? [target.id] : []}
          onToggle={setTarget}
          emptyMessage="No other jobs to move into."
        />

        {submitError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {submitError}
          </p>
        )}

        <Button type="button" size="lg" className="w-full" disabled={!target} loading={submitting} onClick={handleConfirm}>
          Move into {target ? target.customerName : 'Job'}
        </Button>
      </div>
    </Modal>
  );
}
