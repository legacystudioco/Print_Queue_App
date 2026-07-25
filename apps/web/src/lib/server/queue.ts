import 'server-only';
import { randomUUID } from 'node:crypto';
import { terminalPrintJobStatuses, type PrintJobRecord, type PrintJobStatus } from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapPrintJob } from './mappers';
import { printFileExists } from './storage';
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
    super('Only a completed, failed, skipped, or cancelled job can be requeued.');
    this.name = 'JobNotEligibleForRequeueError';
  }
}

export class PrintFileUnavailableError extends Error {
  constructor() {
    super('Original print file is no longer available.');
    this.name = 'PrintFileUnavailableError';
  }
}

type CheckFileExistsFn = (admin: AdminClient, storagePath: string) => Promise<boolean>;
type RequeueRpcFn = (
  admin: AdminClient,
  args: { p_new_id: string; p_source_job_id: string; p_created_by: string },
) => Promise<{ data: PrintJobRow | null; error: { message: string } | null }>;

const defaultRequeueRpc: RequeueRpcFn = async (admin, args) => admin.rpc('requeue_print_job', args);

export interface RequeueJobResult {
  originalJobId: string;
  newJob: PrintJobRecord;
}

/**
 * Copies a terminal (completed/failed/skipped/cancelled) History job into a
 * brand-new queued job, without ever writing to the source row — see
 * requeue_print_job in supabase/migrations/0009_requeue.sql, which reuses
 * the exact same insert_queued_print_job primitive a fresh upload goes
 * through (see create_print_job). The bridge sees a normal freshly-queued
 * job; nothing about this path is special-cased downstream.
 *
 * `checkFileExists`/`requeueRpc` are injectable (default to the real
 * storage check / RPC call) purely so tests can exercise the eligibility
 * logic here without a real Supabase project.
 */
export async function requeueJobFromHistory(
  admin: AdminClient,
  sourceJobId: string,
  requestedBy: string,
  deps: { checkFileExists?: CheckFileExistsFn; requeueRpc?: RequeueRpcFn } = {},
): Promise<RequeueJobResult> {
  const checkFileExists = deps.checkFileExists ?? printFileExists;
  const requeueRpc = deps.requeueRpc ?? defaultRequeueRpc;

  const { data: source, error: fetchError } = await admin
    .from('print_jobs')
    .select('id, status, storage_path')
    .eq('id', sourceJobId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to load job ${sourceJobId}: ${fetchError.message}`);
  if (!source) throw new JobNotFoundError(sourceJobId);

  if (!terminalPrintJobStatuses.includes(source.status as PrintJobStatus)) {
    throw new JobNotEligibleForRequeueError();
  }

  const fileExists = await checkFileExists(admin, source.storage_path);
  if (!fileExists) {
    throw new PrintFileUnavailableError();
  }

  const { data: newJobRow, error: requeueError } = await requeueRpc(admin, {
    p_new_id: randomUUID(),
    p_source_job_id: sourceJobId,
    p_created_by: requestedBy,
  });

  if (requeueError || !newJobRow) {
    throw new Error(`Failed to requeue job ${sourceJobId}: ${requeueError?.message ?? 'no row returned'}`);
  }

  return { originalJobId: sourceJobId, newJob: mapPrintJob(newJobRow) };
}
