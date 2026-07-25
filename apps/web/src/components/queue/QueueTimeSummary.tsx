'use client';

import { formatPrintTime } from '@print-queue/shared';
import { useEffect, useRef } from 'react';

const actionButton =
  'touch-target inline-flex items-center rounded-lg border border-charcoal-300 px-3 text-xs font-semibold text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30 disabled:hover:border-charcoal-300 disabled:hover:bg-transparent';

/**
 * Compact, always-visible summary of Total Queue Time plus (once something
 * is selected) Selected Print Time — sits above QueueList. Purely
 * presentational: all totals/selection state is computed and owned by
 * QueueList (derived client state, see requirement 12 — nothing here is
 * persisted). formatPrintTime is the one place minutes get formatted; this
 * component never reimplements that math.
 */
export function QueueTimeSummary({
  totalMinutes,
  totalMissingCount,
  eligibleCount,
  selectedCount,
  selectedMinutes,
  selectedMissingCount,
  onSelectAll,
  onClearSelection,
}: {
  totalMinutes: number;
  totalMissingCount: number;
  eligibleCount: number;
  selectedCount: number;
  selectedMinutes: number;
  selectedMissingCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const allSelected = eligibleCount > 0 && selectedCount === eligibleCount;
  const someSelected = selectedCount > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="rounded-xl border border-charcoal-200 bg-white p-4 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-widest text-charcoal-400">Total Queue Time</span>
          <span
            data-testid="total-queue-time-value"
            className="text-lg font-extrabold tabular-nums text-charcoal-900"
          >
            {formatPrintTime(totalMinutes)}
          </span>
        </div>

        {eligibleCount > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium text-charcoal-700">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelection())}
              aria-label="Select all queued jobs for time calculation"
              className="h-5 w-5 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
            />
            Select All
          </label>
        )}
      </div>

      {totalMissingCount > 0 && (
        <p className="mt-1 text-xs text-charcoal-400">
          {totalMissingCount} {totalMissingCount === 1 ? 'job has' : 'jobs have'} no estimated print time.
        </p>
      )}

      <div className="mt-3 border-t border-charcoal-100 pt-3">
        {selectedCount > 0 ? (
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-accent-600">Selected Print Time</span>
              <span
                data-testid="selected-print-time-value"
                className="text-base font-bold tabular-nums text-charcoal-900"
              >
                {formatPrintTime(selectedMinutes)}
              </span>
            </div>
            <p className="text-xs text-charcoal-500">
              {selectedCount} {selectedCount === 1 ? 'job' : 'jobs'} selected
            </p>
            {selectedMissingCount > 0 && (
              <p className="text-xs text-charcoal-400">
                {selectedMissingCount} selected {selectedMissingCount === 1 ? 'job has' : 'jobs have'} no estimated
                time
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-charcoal-400">Select jobs to calculate their combined print time.</p>
        )}
      </div>

      {eligibleCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onSelectAll} disabled={allSelected} className={actionButton}>
            Select All
          </button>
          <button type="button" onClick={onClearSelection} disabled={selectedCount === 0} className={actionButton}>
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
}
