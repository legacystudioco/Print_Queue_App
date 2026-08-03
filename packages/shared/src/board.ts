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
