import { clsx } from 'clsx';
import type { PrintJobStatus, PrinterCommandStatus } from '@print-queue/shared';

/**
 * `ready_on_printer` and `failed_before_upload` aren't real PrintJobStatus
 * values — they're synthetic keys the job pages pass in instead of the raw
 * status when `JobDisplayFlags` (see lib/server/data.ts) says a `printing`
 * job is actually just sitting on the printer waiting for a human, or a
 * `failed` job never made it to a successful upload. See
 * docs/bambu-integration.md.
 */
export type DisplayStatus = PrintJobStatus | PrinterCommandStatus | 'ready_on_printer' | 'failed_before_upload';

/**
 * Solid-fill status system — five colors, each meaning exactly one thing,
 * used nowhere else in the UI:
 *   dark gray  → queued / not yet active
 *   orange     → actively in the pipeline (the one accent color, doing its job)
 *   blue       → needs a human's attention (ready on printer)
 *   green      → success
 *   red        → failure
 * Solid fills read as equipment status tags at a glance; pastel tints (the
 * previous version) wash out on a bright shop floor.
 */
const QUEUED = 'bg-charcoal-700 text-white';
const ACTIVE = 'bg-accent-500 text-white';
const ATTENTION = 'bg-brand-600 text-white';
const SUCCESS = 'bg-success-600 text-white';
const FAILURE = 'bg-danger-600 text-white';
const MUTED = 'bg-charcoal-100 text-charcoal-500';

const STATUS_STYLES: Record<string, string> = {
  uploaded: QUEUED,
  queued: QUEUED,
  ready: QUEUED,
  command_pending: ACTIVE,
  downloading: ACTIVE,
  uploading_to_printer: ACTIVE,
  starting: ACTIVE,
  printing: ACTIVE,
  completed: SUCCESS,
  failed: FAILURE,
  skipped: MUTED,
  cancelled: MUTED,
  pending: ACTIVE,
  claimed: ACTIVE,
  processing: ACTIVE,
  ready_on_printer: ATTENTION,
  failed_before_upload: FAILURE,
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  queued: 'Queued',
  ready: 'Ready',
  command_pending: 'Starting',
  downloading: 'Downloading',
  uploading_to_printer: 'Uploading',
  starting: 'Starting',
  printing: 'Printing',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  pending: 'Pending',
  claimed: 'Claimed',
  processing: 'Processing',
  ready_on_printer: 'Ready on Printer',
  failed_before_upload: 'Failed — Before Upload',
};

export function StatusBadge({
  status,
  className,
}: {
  status: DisplayStatus | string;
  className?: string;
}) {
  const isLive = status === 'printing';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
        STATUS_STYLES[status] ?? MUTED,
        className,
      )}
    >
      {isLive && (
        <span
          className="h-1.5 w-1.5 shrink-0 animate-pulse-dot rounded-full bg-white"
          aria-hidden="true"
        />
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Picks the right badge key for a job, given its raw status and computed display flags. */
export function jobDisplayStatus(
  status: PrintJobStatus,
  flags: { manualStartRequired: boolean; failedBeforeUpload: boolean },
): DisplayStatus {
  if (flags.manualStartRequired) return 'ready_on_printer';
  if (flags.failedBeforeUpload) return 'failed_before_upload';
  return status;
}
