import { sanitizeFileName, startPrintCommandPayloadSchema, type PrinterAdapter } from '@print-queue/shared';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import type { Logger } from '../logger.js';
import { logPrinterEvent, transitionJobStatus } from '../jobStatus.js';
import { cleanupTempFile, downloadPrintFile } from '../storage/download.js';
import type { PrinterCommandsRow } from '../lib/database.types.js';

/**
 * Executes a claimed `start_print` command end-to-end: download -> upload to
 * printer -> start -> mark the job printing. Every step is logged as a
 * printer_event and drives the job through the exact pipeline states
 * enforced by the shared state machine (command_pending -> downloading ->
 * uploading_to_printer -> starting -> printing). Any failure at any step
 * marks both the command and the job failed, leaving the job retryable.
 */
export async function handleStartPrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  logger: Logger,
  tempDirectory: string,
  command: PrinterCommandsRow,
): Promise<void> {
  const payload = startPrintCommandPayloadSchema.parse(command.payload);
  const jobId = payload.jobId;
  const printerId = command.printer_id;
  let localFilePath: string | null = null;

  try {
    await transitionJobStatus(supabase, logger, jobId, 'command_pending', 'downloading');
    await logPrinterEvent(supabase, printerId, 'download_started', 'Downloading file from storage', {
      printJobId: jobId,
    });

    localFilePath = await downloadPrintFile(supabase, tempDirectory, payload.storagePath, jobId);

    await transitionJobStatus(supabase, logger, jobId, 'downloading', 'uploading_to_printer');
    await logPrinterEvent(supabase, printerId, 'upload_started', 'Uploading file to printer', {
      printJobId: jobId,
    });

    const remoteFileName = sanitizeFileName(payload.originalFilename);
    await adapter.uploadPrintFile({ localFilePath, remoteFileName });

    await transitionJobStatus(supabase, logger, jobId, 'uploading_to_printer', 'starting');
    await logPrinterEvent(supabase, printerId, 'print_starting', 'Sending start command to printer', {
      printJobId: jobId,
    });

    const result = await adapter.startPrint({ remoteFileName, useAms: true });
    if (!result.started) {
      throw new Error(result.message ?? 'Printer declined to start the print');
    }

    await transitionJobStatus(supabase, logger, jobId, 'starting', 'printing', {
      startedAt: new Date().toISOString(),
    });
    await supabase.from('printers').update({ current_job_id: jobId }).eq('id', printerId);
    await logPrinterEvent(supabase, printerId, 'print_started', 'Print started successfully', {
      printJobId: jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('start_print command failed', { jobId, error: message });

    await failJobFromAnyActiveState(supabase, logger, jobId, message);
    await logPrinterEvent(supabase, printerId, 'print_start_failed', message, { printJobId: jobId });

    throw err;
  } finally {
    if (localFilePath) await cleanupTempFile(localFilePath);
  }
}

/** The job could be in any of the pipeline states when a failure occurs; look up its current status first. */
async function failJobFromAnyActiveState(
  supabase: BridgeSupabaseClient,
  logger: Logger,
  jobId: string,
  message: string,
): Promise<void> {
  const { data: job } = await supabase.from('print_jobs').select('status').eq('id', jobId).single();
  if (!job) return;

  const activeStates = ['command_pending', 'downloading', 'uploading_to_printer', 'starting', 'printing'];
  if (!activeStates.includes(job.status)) return;

  await transitionJobStatus(supabase, logger, jobId, job.status, 'failed', { failureMessage: message });
}
