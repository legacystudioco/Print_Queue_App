import 'server-only';
import { activePrintJobStatuses, terminalPrintJobStatuses } from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { mapAmsSlot, mapPrintJob, mapPrintJobWithSlots, mapPrinter } from './mappers';

type Client = SupabaseClient<Database>;

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

  return jobs.map((job) =>
    mapPrintJobWithSlots(
      job,
      slots.filter((s) => s.job_id === job.id),
    ),
  );
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

  return mapPrintJobWithSlots(job, slots);
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
  return data ? mapPrintJob(data) : null;
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
  return data.map(mapPrintJob);
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

export { mapAmsSlot };
