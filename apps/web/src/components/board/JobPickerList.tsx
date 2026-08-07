'use client';

import {
  businessLabels,
  businesses,
  deriveJobStatus,
  formatPrintTime,
  jobStatusLabels,
  jobStatuses,
  summarizePlateTime,
  type Business,
  type JobStatus,
} from '@print-queue/shared';
import { clsx } from 'clsx';
import { ImageOff, Search } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/Badge';
import type { BoardJob } from '../queue/types';

/**
 * Searchable/filterable job list shared by the "Group Existing Jobs" wizard
 * (multi-select, standaloneOnly candidates) and "Move into Job" (single
 * select, any job as a target). Selection state is owned by the caller —
 * this component only fetches/filters/renders and reports full BoardJob
 * objects back (not just ids) so the caller can compute preview totals
 * without a second fetch.
 */
export function JobPickerList({
  mode,
  standaloneOnly = false,
  excludeJobId,
  selectedIds,
  onToggle,
  onToggleAll,
  emptyMessage = 'No jobs match your filters.',
}: {
  mode: 'single' | 'multi';
  /** Only jobs with exactly one plate — the group wizard's candidate list. */
  standaloneOnly?: boolean;
  /** Excludes one job from the results — "Move into Job" can't target itself. */
  excludeJobId?: string;
  selectedIds: string[];
  onToggle: (job: BoardJob) => void;
  /** multi mode only — "select all" toggles every currently-loaded job. */
  onToggleAll?: (jobs: BoardJob[]) => void;
  emptyMessage?: string;
}) {
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [business, setBusiness] = useState<Business | ''>('');
  const [status, setStatus] = useState<JobStatus | ''>('');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (business) params.set('business', business);
      if (status) params.set('status', status);
      if (standaloneOnly) params.set('standaloneOnly', 'true');
      if (excludeJobId) params.set('excludeId', excludeJobId);

      fetch(`/api/jobs?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? 'Failed to load jobs');
          }
          return (await res.json()) as { jobs: BoardJob[] };
        })
        .then((body) => setJobs(body.jobs))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Failed to load jobs');
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [q, business, status, standaloneOnly, excludeJobId]);

  const allSelected = jobs.length > 0 && jobs.every((job) => selectedIds.includes(job.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by job name…"
            aria-label="Search jobs"
            className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={business}
          onChange={(e) => setBusiness(e.target.value as Business | '')}
          aria-label="Filter by business"
          className="h-10 rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="">All businesses</option>
          {businesses.map((b) => (
            <option key={b} value={b}>
              {businessLabels[b]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as JobStatus | '')}
          aria-label="Filter by status"
          className="h-10 rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="">All statuses</option>
          {jobStatuses.map((s) => (
            <option key={s} value={s}>
              {jobStatusLabels[s]}
            </option>
          ))}
        </select>
      </div>

      {mode === 'multi' && onToggleAll && jobs.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-charcoal-500">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll(jobs)}
            className="h-4 w-4 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
          />
          Select all ({jobs.length})
        </label>
      )}

      {error && <p className="text-sm font-medium text-danger-600">{error}</p>}

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {loading && <p className="py-4 text-center text-sm text-charcoal-400">Loading…</p>}
        {!loading && jobs.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-charcoal-400">{emptyMessage}</p>
        )}
        {!loading &&
          jobs.map((job) => {
            const checked = selectedIds.includes(job.id);
            const jobStatus = deriveJobStatus(job.plates.map((p) => p.status));
            const time = summarizePlateTime(job.plates);
            const thumbnail = job.plates[0]?.screenshotUrl ?? null;
            const colors = job.plates[0]?.colors ?? null;

            return (
              <label
                key={job.id}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border border-charcoal-200 p-2.5 transition-colors',
                  'has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50',
                )}
              >
                <input
                  type={mode === 'multi' ? 'checkbox' : 'radio'}
                  name={mode === 'single' ? 'job-picker' : undefined}
                  checked={checked}
                  onChange={() => onToggle(job)}
                  className="h-5 w-5 shrink-0 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
                />
                {thumbnail ? (
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-50">
                    <Image src={thumbnail} alt="" fill className="object-cover" unoptimized />
                  </span>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 text-charcoal-300">
                    <ImageOff className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-charcoal-900">{job.customerName}</span>
                    <StatusBadge status={jobStatus} />
                  </span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-charcoal-500">
                    <span>{businessLabels[job.business]}</span>
                    {colors && <span>{colors}</span>}
                    {time.totalMinutes > 0 && <span>~{formatPrintTime(time.totalMinutes)}</span>}
                  </span>
                </span>
              </label>
            );
          })}
      </div>
    </div>
  );
}
