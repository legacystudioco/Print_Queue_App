import 'server-only';
import {
  activePrintJobStatuses,
  isStartPrintCommandResult,
  terminalPrintJobStatuses,
  type PrintJobRecord,
  type StartPrintCommandResult,
} from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import {
  mapAmsSlot,
  mapNotificationPreferences,
  mapPrintJob,
  mapPrintJobWithSlots,
  mapPrinter,
  mapPushSubscription,
} from './mappers';

type Client = SupabaseClient<Database>;

/**
 * UI-only flags computed from the job's latest `start_print` command result,
 * not persisted anywhere — see `printer_commands.result` / `StartPrintCommandResult`
 * in @print-queue/shared and docs/bambu-integration.md. Deliberately kept out
 * of the shared DB-mirror types (PrintJobRecord etc.), which document
 * themselves as one-to-one Postgres mirrors.
 */
export interface JobDisplayFlags {
  /** Job is sitting on the printer (status `printing`) but nobody has actually pressed start yet. */
  manualStartRequired: boolean;
  /** Job is `failed` and never got as far as a successful FTPS upload. */
  failedBeforeUpload: boolean;
}

function computeDisplayFlags(
  status: PrintJobRecord['status'],
  result: StartPrintCommandResult | null,
): JobDisplayFlags {
  return {
    manualStartRequired: status === 'printing' && result?.manualStartRequired === true,
    failedBeforeUpload: status === 'failed' && !result?.uploadedAt,
  };
}

/**
 * The latest `start_print` command result per job id, batched into one query
 * instead of one round-trip per job. A job can have at most one in-flight
 * start_print command at a time, but may have several across retries —
 * only the most recently requested one is relevant for display.
 */
async function getLatestStartPrintResults(
  supabase: Client,
  jobIds: string[],
): Promise<Map<string, StartPrintCommandResult | null>> {
  const results = new Map<string, StartPrintCommandResult | null>();
  if (jobIds.length === 0) return results;

  const { data, error } = await supabase
    .from('printer_commands')
    .select('print_job_id, result, requested_at')
    .eq('command_type', 'start_print')
    .in('print_job_id', jobIds)
    .order('requested_at', { ascending: false });

  if (error) throw error;

  for (const row of data) {
    if (!row.print_job_id || results.has(row.print_job_id)) continue; // already have the latest for this job
    results.set(row.print_job_id, isStartPrintCommandResult(row.result) ? row.result : null);
  }
  return results;
}

async function attachDisplayFlags<T extends PrintJobRecord>(
  supabase: Client,
  jobs: T[],
): Promise<(T & JobDisplayFlags)[]> {
  const resultsByJobId = await getLatestStartPrintResults(
    supabase,
    jobs.map((j) => j.id),
  );
  return jobs.map((job) => ({
    ...job,
    ...computeDisplayFlags(job.status, resultsByJobId.get(job.id) ?? null),
  }));
}

export async function getPrimaryPrinter(supabase: Client) {
  const { data, error } = await supabase
    .from('printers')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPrinter(data) : null;
}

/** Active (non-terminal) queue, in queue order, each joined with its AMS slots. */
export async function getActiveQueue(supabase: Client, printerId: string) {
  const { data: jobs, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('printer_id', printerId)
    .not('status', 'in', `(${terminalPrintJobStatuses.join(',')})`)
    .order('queue_position', { ascending: true, nullsFirst: false });

  if (error) throw error;
  if (!jobs.length) return [];

  const { data: slots, error: slotsError } = await supabase
    .from('job_ams_slots')
    .select('*')
    .in(
      'job_id',
      jobs.map((j) => j.id),
    );

  if (slotsError) throw slotsError;

  const withSlots = jobs.map((job) =>
    mapPrintJobWithSlots(
      job,
      slots.filter((s) => s.job_id === job.id),
    ),
  );
  return attachDisplayFlags(supabase, withSlots);
}

export async function getJobWithSlots(supabase: Client, jobId: string) {
  const { data: job, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!job) return null;

  const { data: slots, error: slotsError } = await supabase
    .from('job_ams_slots')
    .select('*')
    .eq('job_id', jobId);

  if (slotsError) throw slotsError;

  const [withFlags] = await attachDisplayFlags(supabase, [mapPrintJobWithSlots(job, slots)]);
  return withFlags;
}

/** The job currently occupying the single active pipeline slot, if any. */
export async function getCurrentJob(supabase: Client, printerId: string) {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('printer_id', printerId)
    .in('status', [...activePrintJobStatuses])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [withFlags] = await attachDisplayFlags(supabase, [mapPrintJob(data)]);
  return withFlags;
}

/** The first eligible job (queued/ready, lowest queue_position) with no active job ahead of it. */
export async function getNextEligibleJob(supabase: Client, printerId: string) {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('printer_id', printerId)
    .in('status', ['queued', 'ready'])
    .order('queue_position', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: slots, error: slotsError } = await supabase
    .from('job_ams_slots')
    .select('*')
    .eq('job_id', data.id);

  if (slotsError) throw slotsError;

  return mapPrintJobWithSlots(data, slots.map((s) => s));
}

export async function getHistory(supabase: Client, printerId: string, limit = 50) {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('printer_id', printerId)
    .in('status', [...terminalPrintJobStatuses])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return attachDisplayFlags(supabase, data.map(mapPrintJob));
}

export async function getPendingOrActiveCommand(supabase: Client, printerId: string) {
  const { data, error } = await supabase
    .from('printer_commands')
    .select('*')
    .eq('printer_id', printerId)
    .in('status', ['pending', 'claimed', 'processing'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRecentPrinterEvents(supabase: Client, printerId: string, limit = 20) {
  const { data, error } = await supabase
    .from('printer_events')
    .select('*')
    .eq('printer_id', printerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getJobEvents(supabase: Client, jobId: string) {
  const { data, error } = await supabase
    .from('printer_events')
    .select('*')
    .eq('print_job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getJobCommands(supabase: Client, jobId: string) {
  const { data, error } = await supabase
    .from('printer_commands')
    .select('*')
    .eq('print_job_id', jobId)
    .order('requested_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getJobBedClearConfirmation(supabase: Client, jobId: string) {
  const { data, error } = await supabase
    .from('bed_clear_confirmations')
    .select('*')
    .eq('print_job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Just the job's name, for the Start Next page's "you clicked a completion notification" banner — tolerant of a stale/invalid id (untrusted query param). */
export async function getCompletedJobName(supabase: Client, jobId: string): Promise<string | null> {
  const { data } = await supabase.from('print_jobs').select('name').eq('id', jobId).eq('status', 'completed').maybeSingle();
  return data?.name ?? null;
}

export async function getAppUsersByIds(supabase: Client, ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('app_users')
    .select('id, display_name, email')
    .in('id', ids);

  if (error) throw error;
  return data;
}

/** 1-based position of a job within the active (non-terminal) queue, or null. */
export async function getQueuePosition(supabase: Client, printerId: string, jobId: string) {
  const queue = await getActiveQueue(supabase, printerId);
  const index = queue.findIndex((j) => j.id === jobId);
  return index === -1 ? null : index + 1;
}

/** This user's push subscriptions across every browser/device they've enabled notifications on, active ones first. */
export async function getPushSubscriptions(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('disabled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(mapPushSubscription);
}

/** This user's notification preferences, or null if they've never visited Settings yet (callers should treat that as DEFAULT_NOTIFICATION_PREFERENCES). */
export async function getNotificationPreferences(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapNotificationPreferences(data) : null;
}

export { mapAmsSlot };
