import 'server-only';
import {
  activePrintJobStatuses,
  isStartPrintCommandResult,
  terminalPrintJobStatuses,
  type JobFileRecord,
  type PrintJobRecord,
  type StartPrintCommandResult,
} from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import {
  mapAmsSlot,
  mapJobFile,
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

/** Every configured physical printer, oldest first. */
export async function getAllPrinters(supabase: Client) {
  const { data, error } = await supabase.from('printers').select('*').order('created_at', { ascending: true });

  if (error) throw error;
  return data.map(mapPrinter);
}

export async function getPrinterById(supabase: Client, printerId: string) {
  const { data, error } = await supabase.from('printers').select('*').eq('id', printerId).maybeSingle();

  if (error) throw error;
  return data ? mapPrinter(data) : null;
}

/** Batched job_files lookup, keyed by job id — mirrors the job_ams_slots batch-fetch pattern. */
async function getJobFilesByJobIds(supabase: Client, jobIds: string[]): Promise<Map<string, JobFileRecord[]>> {
  const byJobId = new Map<string, JobFileRecord[]>();
  if (jobIds.length === 0) return byJobId;

  const { data, error } = await supabase.from('job_files').select('*').in('job_id', jobIds);
  if (error) throw error;

  for (const row of data) {
    const file = mapJobFile(row);
    const existing = byJobId.get(file.jobId);
    if (existing) existing.push(file);
    else byJobId.set(file.jobId, [file]);
  }
  return byJobId;
}

/**
 * Active (non-terminal) queue, in queue order, each joined with its AMS
 * slots and per-brand files. Omit `printerId` to fetch across every
 * configured printer (the "All" tab / merged queue view) — brand filtering
 * on top of that is a client-side concern (see QueueList), not a second
 * server query, per the "don't duplicate queue logic" rule.
 */
export async function getActiveQueue(supabase: Client, printerId?: string) {
  let query = supabase
    .from('print_jobs')
    .select('*')
    .not('status', 'in', `(${terminalPrintJobStatuses.join(',')})`)
    .order('queue_position', { ascending: true, nullsFirst: false });

  if (printerId) {
    query = query.eq('printer_id', printerId);
  }

  const { data: jobs, error } = await query;

  if (error) throw error;
  if (!jobs.length) return [];

  const jobIds = jobs.map((j) => j.id);
  const [{ data: slots, error: slotsError }, filesByJobId] = await Promise.all([
    supabase.from('job_ams_slots').select('*').in('job_id', jobIds),
    getJobFilesByJobIds(supabase, jobIds),
  ]);

  if (slotsError) throw slotsError;

  const withSlots = jobs.map((job) =>
    mapPrintJobWithSlots(
      job,
      slots.filter((s) => s.job_id === job.id),
      filesByJobId.get(job.id) ?? [],
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

  const [{ data: slots, error: slotsError }, filesByJobId] = await Promise.all([
    supabase.from('job_ams_slots').select('*').eq('job_id', jobId),
    getJobFilesByJobIds(supabase, [jobId]),
  ]);

  if (slotsError) throw slotsError;

  const withFiles = mapPrintJobWithSlots(job, slots, filesByJobId.get(jobId) ?? []);
  return (await attachDisplayFlags(supabase, [withFiles]))[0] ?? null;
}

/** The job currently occupying the single active pipeline slot, if any, for one printer. */
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

  return (await attachDisplayFlags(supabase, [mapPrintJob(data)]))[0] ?? null;
}

/** The first eligible job (queued/ready, lowest queue_position) with no active job ahead of it, for one printer. */
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

  const [{ data: slots, error: slotsError }, filesByJobId] = await Promise.all([
    supabase.from('job_ams_slots').select('*').eq('job_id', data.id),
    getJobFilesByJobIds(supabase, [data.id]),
  ]);

  if (slotsError) throw slotsError;

  return mapPrintJobWithSlots(data, slots, filesByJobId.get(data.id) ?? []);
}

/**
 * Terminal-status jobs (History), each joined with its per-brand files.
 * Omit `printerId` to fetch across every configured printer.
 */
export async function getHistory(supabase: Client, printerId?: string, limit = 50) {
  let query = supabase
    .from('print_jobs')
    .select('*')
    .in('status', [...terminalPrintJobStatuses])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (printerId) {
    query = query.eq('printer_id', printerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data.length) return [];

  const filesByJobId = await getJobFilesByJobIds(
    supabase,
    data.map((j) => j.id),
  );
  const withFiles = data.map((job) => ({
    ...mapPrintJob(job),
    files: filesByJobId.get(job.id) ?? [],
  }));
  return attachDisplayFlags(supabase, withFiles);
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

/**
 * This user's push subscriptions across every browser/device they've
 * enabled notifications on, active ones first.
 *
 * Unlike every other function in this file, this deliberately does NOT
 * `throw error` — push notifications are an optional, independently
 * migrated feature (see supabase/migrations/0008_notifications.sql), and
 * the Settings page must still render (as "notifications unavailable",
 * not a 500) if that migration hasn't been applied yet to a given
 * environment, or the query fails for any other reason. This is exactly
 * what caused the Settings page's Server Components render crash — see
 * docs/push-notifications.md.
 */
export async function getPushSubscriptions(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('disabled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('getPushSubscriptions failed — treating as "no subscriptions" so Settings can still render', {
      userId,
      error: error.message,
    });
    return [];
  }
  return data.map(mapPushSubscription);
}

/**
 * This user's notification preferences, or null if they've never visited
 * Settings yet, OR if the query failed for any reason (missing table,
 * transient DB error, ...) — callers should treat both the same way:
 * fall back to `DEFAULT_NOTIFICATION_PREFERENCES`. See getPushSubscriptions
 * above for why this doesn't `throw error` like the rest of this file.
 */
export async function getNotificationPreferences(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('getNotificationPreferences failed — falling back to defaults so Settings can still render', {
      userId,
      error: error.message,
    });
    return null;
  }
  return data ? mapNotificationPreferences(data) : null;
}

export { mapAmsSlot };
