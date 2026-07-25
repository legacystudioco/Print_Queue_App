import type { PrintJobRecord } from '@print-queue/shared';

/**
 * Jobs waiting to print — the same set QueueBoard already treats as
 * reorderable (queue_position matters, nothing is happening to them yet).
 * The actively-printing job (and anything in between, e.g.
 * `uploading_to_printer`) is deliberately excluded from Total Queue Time:
 * per the product decision this feature was built against, "Total Queue
 * Time" means waiting/queued jobs only, not the job currently on the bed.
 * Selection (see QueueBoard) draws from this same set.
 */
export function isWaitingQueueJob(status: PrintJobRecord['status']): boolean {
  return status === 'queued' || status === 'ready';
}

export interface PrintTimeSummary {
  /** Sum of estimatedDurationSeconds (converted to minutes) across jobs that have an estimate. */
  totalMinutes: number;
  /** Count of jobs with no estimate at all — never folded into totalMinutes as zero. */
  missingCount: number;
}

/**
 * Sums print time across a set of jobs. A job with no
 * `estimatedDurationSeconds` is excluded from the sum and counted in
 * `missingCount` instead — see requirement 9 in the queue-time-summary
 * feature: an unknown duration must never silently become "0 minutes".
 */
export function summarizePrintTime(
  jobs: Pick<PrintJobRecord, 'estimatedDurationSeconds'>[],
): PrintTimeSummary {
  let totalMinutes = 0;
  let missingCount = 0;

  for (const job of jobs) {
    if (job.estimatedDurationSeconds == null) {
      missingCount += 1;
      continue;
    }
    totalMinutes += Math.round(job.estimatedDurationSeconds / 60);
  }

  return { totalMinutes, missingCount };
}
