import { z } from 'zod';

/**
 * The two businesses the production board tracks work for. Exactly two by
 * product decision — see supabase/migrations/0017_production_board.sql. Add
 * a third with an ALTER TYPE on the `business_name` Postgres enum plus a
 * new entry here and in `businessLabels`.
 */
export const businesses = ['3d_sports_displays', 'dougie_doug'] as const;
export type Business = (typeof businesses)[number];
export const businessSchema = z.enum(businesses);

export const businessLabels: Record<Business, string> = {
  '3d_sports_displays': '3D Sports Displays',
  dougie_doug: 'Dougie-Doug',
};

/**
 * Lifecycle of a job on the production board. See `state-machine.ts`'s
 * `TRANSITIONS` for the old, much larger printer-pipeline status machine
 * this deliberately does not reuse — that one models bridge upload/start
 * steps that no longer exist.
 *
 * Legal edges: queued -> printing -> completed, or printing -> partial
 * (terminal — see `createPartialReprintSchema` for the follow-up-job
 * workflow). Enforced at the database level by
 * `can_transition_board_status` / `enforce_board_status_transition`.
 */
export const boardJobStatuses = ['queued', 'printing', 'partial', 'completed'] as const;
export type BoardJobStatus = (typeof boardJobStatuses)[number];
export const boardJobStatusSchema = z.enum(boardJobStatuses);

export const boardJobStatusLabels: Record<BoardJobStatus, string> = {
  queued: 'Queued',
  printing: 'Printing',
  partial: 'Partial',
  completed: 'Completed',
};

/**
 * A plate's status uses the exact same 4-state lifecycle as the old
 * job-level `board_status` (queued/printing/partial/completed) — see
 * migration 0018_job_plate_hierarchy.sql, `plates.status`. `PlateStatus` is
 * just a semantic alias so call sites that only ever deal with plates don't
 * have to say "BoardJobStatus".
 */
export type PlateStatus = BoardJobStatus;
export const plateStatuses = boardJobStatuses;
export const plateStatusSchema = boardJobStatusSchema;
export const plateStatusLabels = boardJobStatusLabels;

/**
 * A job's (customer/order's) status. Unlike `PlateStatus`, this is never a
 * stored column — always computed fresh from a job's plates by
 * `deriveJobStatus` below. `in_progress` is the one state with no
 * plate-level equivalent (some plates done, others still queued).
 */
export const jobStatuses = ['queued', 'printing', 'in_progress', 'partial', 'completed'] as const;
export type JobStatus = (typeof jobStatuses)[number];
export const jobStatusSchema = z.enum(jobStatuses);

export const jobStatusLabels: Record<JobStatus, string> = {
  queued: 'Queued',
  printing: 'Printing',
  in_progress: 'In Progress',
  partial: 'Partial',
  completed: 'Completed',
};

/**
 * Derives a job's board status from the statuses of its current plates.
 * Never stored — always computed fresh wherever a job is rendered (Board or
 * History), so it stays correct even when a plate is added to a job after
 * the fact.
 *
 * Precedence (confirmed product decision — see the refactor plan): a single
 * `partial` plate always wins, even while siblings are still printing or
 * queued — a customer order with any partial plate should visibly need
 * attention rather than being buried under "Printing"/"In Progress".
 * Otherwise: any plate printing -> `printing`; every plate completed ->
 * `completed`; a mix of completed and queued (no printing, no partial) ->
 * `in_progress`; every plate queued -> `queued`.
 */
export function deriveJobStatus(plateStatuses: PlateStatus[]): JobStatus {
  if (plateStatuses.length === 0) {
    throw new Error('deriveJobStatus requires at least one plate');
  }
  if (plateStatuses.some((status) => status === 'partial')) return 'partial';
  if (plateStatuses.some((status) => status === 'printing')) return 'printing';
  if (plateStatuses.every((status) => status === 'completed')) return 'completed';
  if (plateStatuses.some((status) => status === 'completed')) return 'in_progress';
  return 'queued';
}

/** Status glyphs shared by the Board's `JobCard`/`PlateRow` and History's `HistoryCard`. */
export const plateStatusGlyphs: Record<PlateStatus, string> = {
  queued: '○',
  printing: '●',
  completed: '✓',
  partial: '△',
};
