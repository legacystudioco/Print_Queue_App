'use client';

import { businessLabels, businesses, formatPrintTime, summarizePlateCounts, summarizePlateTime, type Business } from '@print-queue/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { JobPickerList } from './JobPickerList';
import type { BoardJob } from '../queue/types';

type Step = 'details' | 'select' | 'preview';

/**
 * "Group Existing Jobs" — merges one or more standalone jobs (each with
 * exactly one plate) into a brand new job, one plate per source job. A
 * 3-step wizard: create the parent job's details, pick the standalone jobs
 * to fold in, then preview totals before confirming (see POST /api/jobs/group
 * and group_jobs_into_new_job, migration 0019).
 */
export function GroupJobsWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('details');
  const [customerName, setCustomerName] = useState('');
  const [business, setBusiness] = useState<Business>(businesses[0]);
  const [notes, setNotes] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<BoardJob[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedIds = selectedJobs.map((job) => job.id);
  const selectedPlates = selectedJobs.flatMap((job) => job.plates);
  const time = summarizePlateTime(selectedPlates);
  const counts = summarizePlateCounts(selectedPlates);

  function handleToggle(job: BoardJob) {
    setSelectedJobs((prev) => (prev.some((j) => j.id === job.id) ? prev.filter((j) => j.id !== job.id) : [...prev, job]));
  }

  function handleToggleAll(jobs: BoardJob[]) {
    setSelectedJobs((prev) => {
      const allSelected = jobs.every((job) => prev.some((j) => j.id === job.id));
      if (allSelected) {
        const ids = new Set(jobs.map((job) => job.id));
        return prev.filter((j) => !ids.has(j.id));
      }
      const prevIds = new Set(prev.map((j) => j.id));
      return [...prev, ...jobs.filter((job) => !prevIds.has(job.id))];
    });
  }

  async function handleConfirm() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/jobs/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: crypto.randomUUID(),
          customerName,
          business,
          notes: notes.trim() || null,
          sourceJobIds: selectedIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to group jobs');
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs font-bold uppercase tracking-widest text-charcoal-400">
        Step {step === 'details' ? 1 : step === 'select' ? 2 : 3} of 3
      </p>

      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="group-customer-name" className="mb-1 block text-sm font-medium text-slate-700">
              Customer / order name
            </label>
            <input
              id="group-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="group-business" className="mb-1 block text-sm font-medium text-slate-700">
              Business
            </label>
            <select
              id="group-business"
              value={business}
              onChange={(e) => setBusiness(e.target.value as Business)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              {businesses.map((b) => (
                <option key={b} value={b}>
                  {businessLabels[b]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="group-notes" className="mb-1 block text-sm font-medium text-slate-700">
              Notes — optional
            </label>
            <textarea
              id="group-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={customerName.trim().length === 0}
            onClick={() => setStep('select')}
          >
            Next: Select Jobs
          </Button>
        </div>
      )}

      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-charcoal-500">
            Pick the existing standalone jobs to fold into <span className="font-semibold">{customerName}</span> as
            plates. Only jobs with exactly one plate can be grouped.
          </p>
          <JobPickerList
            mode="multi"
            standaloneOnly
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            emptyMessage="No standalone jobs available to group."
          />
          <p className="text-xs font-semibold text-charcoal-500">{selectedJobs.length} selected</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setStep('details')}>
              Back
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={selectedJobs.length === 0}
              onClick={() => setStep('preview')}
            >
              Next: Preview
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-charcoal-400">Job</p>
            <p className="text-base font-bold text-charcoal-900">{customerName}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-charcoal-400">
              Plates ({selectedJobs.length})
            </p>
            <ul className="space-y-1">
              {selectedJobs.map((job) => (
                <li key={job.id} className="rounded-lg border border-charcoal-100 px-3 py-2 text-sm text-charcoal-800">
                  {job.customerName}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-charcoal-100 p-3 text-sm">
            <div>
              <p className="text-xs text-charcoal-400">Plates</p>
              <p className="font-bold text-charcoal-900">{counts.total}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-400">Total print time</p>
              <p className="font-bold text-charcoal-900">{time.totalMinutes > 0 ? formatPrintTime(time.totalMinutes) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-400">Completed</p>
              <p className="font-bold text-charcoal-900">{counts.completed}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-400">Remaining</p>
              <p className="font-bold text-charcoal-900">{counts.total - counts.completed}</p>
            </div>
          </div>

          {submitError && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {submitError}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={submitting}
              onClick={() => setStep('select')}
            >
              Back
            </Button>
            <Button type="button" size="lg" className="flex-1" loading={submitting} onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
