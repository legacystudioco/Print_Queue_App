import type { JobTemplatePlateRecord } from './types';

/**
 * Total estimated print time for a template's plates (the library card's
 * "~12h 30m total"). Unlike `summarizePlateTime`, there's no
 * completed/remaining split — a template plate is never printed — so this
 * is just a sum, with `missingCount` called out separately rather than
 * silently treated as zero (same convention as `summarizePlateTime`).
 */
export interface TemplateTimeSummary {
  totalMinutes: number;
  /** Count of plates with no estimate at all — excluded from totalMinutes. */
  missingCount: number;
}

export function sumTemplatePlateSeconds(
  plates: Pick<JobTemplatePlateRecord, 'estimatedDurationSeconds'>[],
): TemplateTimeSummary {
  let totalMinutes = 0;
  let missingCount = 0;

  for (const plate of plates) {
    if (plate.estimatedDurationSeconds == null) {
      missingCount += 1;
      continue;
    }
    totalMinutes += Math.round(plate.estimatedDurationSeconds / 60);
  }

  return { totalMinutes, missingCount };
}
