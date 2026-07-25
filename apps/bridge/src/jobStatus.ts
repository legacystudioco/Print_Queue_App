import { assertCanTransitionJobStatus, type PrintJobStatus } from '@print-queue/shared';
import type { BridgeSupabaseClient } from './lib/supabase.js';
import type { Logger } from './logger.js';

export interface TransitionExtra {
  failureMessage?: string | null;
  startedAt?: string;
  completedAt?: string;
}

/**
 * The single place the bridge changes a print_jobs row's status. Always
 * goes through the shared canTransitionJobStatus guard first — the
 * database also enforces this via a trigger (see migration 0003), so an
 * illegal transition fails loudly in two independent places rather than
 * silently corrupting queue state.
 */
export async function transitionJobStatus(
  supabase: BridgeSupabaseClient,
  logger: Logger,
  jobId: string,
  from: PrintJobStatus,
  to: PrintJobStatus,
  extra: TransitionExtra = {},
): Promise<void> {
  assertCanTransitionJobStatus(from, to);

  const { error } = await supabase
    .from('print_jobs')
    .update({
      status: to,
      ...(extra.failureMessage !== undefined ? { failure_message: extra.failureMessage } : {}),
      ...(extra.startedAt ? { started_at: extra.startedAt } : {}),
      ...(extra.completedAt ? { completed_at: extra.completedAt } : {}),
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to transition job ${jobId} from ${from} to ${to}: ${error.message}`);
  }

  logger.info('Job status transition', { jobId, from, to });
}

const ACTIVE_JOB_STATES: readonly PrintJobStatus[] = [
  'command_pending',
  'downloading',
  'uploading_to_printer',
  'starting',
  'printing',
];

/**
 * Shared failure path for both `start_print` and `deliver_print`: the job
 * could be in any of the pipeline states when a failure occurs, so look up
 * its current status first rather than assuming one.
 */
export async function failJobFromAnyActiveState(
  supabase: BridgeSupabaseClient,
  logger: Logger,
  jobId: string,
  message: string,
): Promise<void> {
  const { data: job } = await supabase.from('print_jobs').select('status').eq('id', jobId).single();
  if (!job) return;
  if (!ACTIVE_JOB_STATES.includes(job.status)) return;

  await transitionJobStatus(supabase, logger, jobId, job.status, 'failed', { failureMessage: message });
}

export async function logPrinterEvent(
  supabase: BridgeSupabaseClient,
  printerId: string,
  eventType: string,
  message: string,
  options: { printJobId?: string | null; payload?: Record<string, unknown> } = {},
): Promise<void> {
  await supabase.from('printer_events').insert({
    printer_id: printerId,
    print_job_id: options.printJobId ?? null,
    event_type: eventType,
    message,
    payload: options.payload ?? null,
  });
}
