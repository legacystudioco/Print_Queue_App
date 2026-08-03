import 'server-only';
import { randomUUID } from 'node:crypto';
import type { BoardJobRecord } from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapBoardJob } from './mappers';
import { screenshotExists } from './storage';
import type { Database } from '../supabase/database.types';

type AdminClient = SupabaseClient<Database>;
type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class JobNotEligibleForRequeueError extends Error {
  constructor() {
    super('Only a completed or partial job can be requeued.');
    this.name = 'JobNotEligibleForRequeueError';
  }
}

export class ScreenshotUnavailableError extends Error {
  constructor() {
    super('Original screenshot is no longer available.');
    this.name = 'ScreenshotUnavailableError';
  }
}

type CheckScreenshotExistsFn = (admin: AdminClient, storagePath: string) => Promise<boolean>;
type RequeueRpcFn = (
  admin: AdminClient,
  args: { p_new_id: string; p_source_job_id: string; p_created_by: string },
) => Promise<{ data: PrintJobRow | null; error: { message: string } | null }>;

const defaultRequeueRpc: RequeueRpcFn = async (admin, args) => admin.rpc('requeue_board_job', args);

export interface RequeueJobResult {
  originalJobId: string;
  newJob: BoardJobRecord;
}

/**
 * Copies a terminal (partial/completed) History job into a brand-new
 * queued job, without ever writing to the source row — see
 * requeue_board_job in supabase/migrations/0017_production_board.sql.
 * Unlike create_partial_reprint, this does NOT set parent_job_id: it's a
 * manual re-run of an already-finished job, not a partial-failure
 * follow-up.
 *
 * `checkScreenshotExists`/`requeueRpc` are injectable (default to the real
 * storage check / RPC call) purely so tests can exercise the eligibility
 * logic here without a real Supabase project.
 */
export async function requeueBoardJobFromHistory(
  admin: AdminClient,
  sourceJobId: string,
  requestedBy: string,
  deps: { checkScreenshotExists?: CheckScreenshotExistsFn; requeueRpc?: RequeueRpcFn } = {},
): Promise<RequeueJobResult> {
  const checkScreenshotExists = deps.checkScreenshotExists ?? screenshotExists;
  const requeueRpc = deps.requeueRpc ?? defaultRequeueRpc;

  const { data: source, error: fetchError } = await admin
    .from('print_jobs')
    .select('id, board_status, screenshot_path')
    .eq('id', sourceJobId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to load job ${sourceJobId}: ${fetchError.message}`);
  if (!source) throw new JobNotFoundError(sourceJobId);

  if (source.board_status !== 'completed' && source.board_status !== 'partial') {
    throw new JobNotEligibleForRequeueError();
  }

  if (!source.screenshot_path || !(await checkScreenshotExists(admin, source.screenshot_path))) {
    throw new ScreenshotUnavailableError();
  }

  const { data: newJobRow, error: requeueError } = await requeueRpc(admin, {
    p_new_id: randomUUID(),
    p_source_job_id: sourceJobId,
    p_created_by: requestedBy,
  });

  if (requeueError || !newJobRow) {
    throw new Error(`Failed to requeue job ${sourceJobId}: ${requeueError?.message ?? 'no row returned'}`);
  }

  return { originalJobId: sourceJobId, newJob: mapBoardJob(newJobRow) };
}
