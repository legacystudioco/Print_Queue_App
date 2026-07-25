'use client';

import { formatPrintTime, getPrinterDefinition, type PrinterBrand, type PrinterRecord } from '@print-queue/shared';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { PRINTER_LOGOS } from '@/lib/client/printerLogos';
import { summarizePrintTime } from '@/lib/client/queueTime';
import type { QueueJob } from './types';

/**
 * Sticky-feeling column header: logo, live printer status, total queue
 * time, and per-column bulk selection — everything QueueTimeSummary used
 * to show, restyled compact/vertical to fit a narrow board column
 * (QueueTimeSummary is deleted; nothing else imported it).
 */
export function ColumnHeader({
  brand,
  printer,
  bridgeOnline,
  currentJob,
  progressPercent,
  waitingJobs,
  selectedCount,
  onSelectAll,
  onClearSelection,
}: {
  brand: PrinterBrand;
  printer: PrinterRecord | null;
  bridgeOnline: boolean;
  currentJob: QueueJob | null;
  progressPercent: number | undefined;
  waitingJobs: QueueJob[];
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const definition = getPrinterDefinition(brand);
  const { totalMinutes, missingCount } = summarizePrintTime(waitingJobs);
  const allSelected = waitingJobs.length > 0 && selectedCount === waitingJobs.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  let remainingMinutes: number | null = null;
  if (currentJob?.estimatedDurationSeconds != null && progressPercent != null) {
    remainingMinutes = Math.round((currentJob.estimatedDurationSeconds / 60) * (1 - progressPercent / 100));
  }

  return (
    <div className="flex-shrink-0 space-y-3 border-b border-charcoal-200 bg-white px-3 pb-3 pt-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Image
          src={PRINTER_LOGOS[brand]}
          alt={definition.name}
          width={120}
          height={48}
          className="h-8 w-auto object-contain"
        />
        <StatusLine
          printer={printer}
          bridgeOnline={bridgeOnline}
          currentJob={currentJob}
          progressPercent={progressPercent}
          remainingMinutes={remainingMinutes}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold uppercase tracking-widest text-charcoal-400">Queue Time</span>
        <span className="font-extrabold tabular-nums text-charcoal-900">{formatPrintTime(totalMinutes)}</span>
      </div>
      {missingCount > 0 && (
        <p className="-mt-2 text-[11px] text-charcoal-400">
          {missingCount} {missingCount === 1 ? 'job has' : 'jobs have'} no estimate.
        </p>
      )}

      {waitingJobs.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-charcoal-700">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelection())}
              aria-label={`Select all queued jobs in ${definition.name}`}
              className="h-4 w-4 rounded border-charcoal-300 text-accent-500 focus:ring-accent-500"
            />
            {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={allSelected}
              className="text-[11px] font-semibold text-accent-600 hover:text-accent-700 disabled:opacity-30"
            >
              All
            </button>
            <span className="text-charcoal-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              disabled={selectedCount === 0}
              className="text-[11px] font-semibold text-charcoal-500 hover:text-charcoal-700 disabled:opacity-30"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusLine({
  printer,
  bridgeOnline,
  currentJob,
  progressPercent,
  remainingMinutes,
}: {
  printer: PrinterRecord | null;
  bridgeOnline: boolean;
  currentJob: QueueJob | null;
  progressPercent: number | undefined;
  remainingMinutes: number | null;
}) {
  if (!printer) {
    return (
      <p className="text-xs font-semibold text-charcoal-400">
        <span aria-hidden="true">🔴</span> Not Connected
      </p>
    );
  }

  if (!bridgeOnline) {
    return (
      <p className="text-xs font-semibold text-danger-600">
        <span aria-hidden="true">🔴</span> Offline
      </p>
    );
  }

  if (!currentJob) {
    return (
      <p className="text-xs font-semibold text-success-600">
        <span aria-hidden="true">🟢</span> Online — Idle
      </p>
    );
  }

  return (
    <div className="text-xs font-semibold text-success-600">
      <p>
        <span aria-hidden="true">🟢</span> Printing
      </p>
      <p className="mt-0.5 truncate font-bold text-charcoal-800" title={currentJob.name}>
        {currentJob.name}
      </p>
      {(typeof progressPercent === 'number' || remainingMinutes != null) && (
        <p className="text-charcoal-500">
          {typeof progressPercent === 'number' && `${progressPercent}%`}
          {typeof progressPercent === 'number' && remainingMinutes != null && ' · '}
          {remainingMinutes != null && `${formatPrintTime(remainingMinutes)} remaining`}
        </p>
      )}
    </div>
  );
}
