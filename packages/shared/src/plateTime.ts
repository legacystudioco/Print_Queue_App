import type { PlateRecord } from './types';

/**
 * Time totals for a single job's plates (the Board card's "3 / 5 plates
 * complete, ~6h 25m remaining" line and History's "12h total / 7h complete
 * / 5h remaining"). `totalMinutes` is always `completedMinutes +
 * remainingMinutes` by construction — a plate contributes to exactly one
 * bucket (terminal -> completed, queued/printing -> remaining), never both,
 * and never as an estimated zero if its duration is unknown (see
 * `missingCount`, same "don't silently treat missing as zero" convention as
 * `summarizePrintTime` in apps/web/src/lib/client/queueTime.ts).
 */
export interface PlateTimeSummary {
  totalMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  /** Count of plates with no estimate at all — excluded from every bucket above. */
  missingCount: number;
}

/** A plate counts as "done" for completed/remaining time purposes once it's terminal (completed or partial). */
function isTerminalPlate(status: PlateRecord['status']): boolean {
  return status === 'completed' || status === 'partial';
}

export function summarizePlateTime(
  plates: Pick<PlateRecord, 'estimatedDurationSeconds' | 'status'>[],
): PlateTimeSummary {
  let completedMinutes = 0;
  let remainingMinutes = 0;
  let missingCount = 0;

  for (const plate of plates) {
    if (plate.estimatedDurationSeconds == null) {
      missingCount += 1;
      continue;
    }
    const minutes = Math.round(plate.estimatedDurationSeconds / 60);
    if (isTerminalPlate(plate.status)) {
      completedMinutes += minutes;
    } else {
      remainingMinutes += minutes;
    }
  }

  return {
    totalMinutes: completedMinutes + remainingMinutes,
    completedMinutes,
    remainingMinutes,
    missingCount,
  };
}

/** Plate-count progress for a job's card, e.g. "3 / 5 plates complete". */
export interface PlateCountSummary {
  total: number;
  /** Terminal plates (completed or partial) — both count as "done" for progress purposes. */
  completed: number;
}

export function summarizePlateCounts(plates: Pick<PlateRecord, 'status'>[]): PlateCountSummary {
  return {
    total: plates.length,
    completed: plates.filter((plate) => isTerminalPlate(plate.status)).length,
  };
}
