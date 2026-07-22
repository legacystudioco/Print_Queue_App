import {
  sanitizeFileName,
  startPrintCommandPayloadSchema,
  type PrinterAdapter,
  type PrintStartMode,
  type StartPrintCommandResult,
  type StartPrintResult,
} from '@print-queue/shared';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import type { Logger } from '../logger.js';
import { logPrinterEvent, transitionJobStatus } from '../jobStatus.js';
import { cleanupTempFile, downloadPrintFile } from '../storage/download.js';
import type { PrinterCommandsRow } from '../lib/database.types.js';

const MANUAL_MODE_MESSAGE =
  'File uploaded to the printer. Open Bambu Handy or Bambu Studio and start the print manually.';

const FALLBACK_MESSAGE =
  'File uploaded successfully, but the printer did not start automatically. Open Bambu Handy or Bambu Studio and start it manually.';

/**
 * Executes a claimed `start_print` command end-to-end: download -> upload to
 * printer -> start -> mark the job printing. Every step is logged as a
 * printer_event and drives the job through the exact pipeline states
 * enforced by the shared state machine (command_pending -> downloading ->
 * uploading_to_printer -> starting -> printing).
 *
 * A failure at or before the FTPS upload always fails the job, regardless of
 * `printStartMode` — there is nothing on the printer for a human to start.
 * What happens after a successful upload depends on `printStartMode`; see
 * runPostUploadStart() and docs/bambu-integration.md (Bambu's Access
 * Control System routinely rejects the MQTT start command in Cloud Mode
 * even though the upload itself succeeded).
 */
export async function handleStartPrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  logger: Logger,
  tempDirectory: string,
  command: PrinterCommandsRow,
  printStartMode: PrintStartMode,
): Promise<void> {
  const payload = startPrintCommandPayloadSchema.parse(command.payload);
  const jobId = payload.jobId;
  const printerId = command.printer_id;
  let localFilePath: string | null = null;
  let remoteFileName: string;

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

    remoteFileName = sanitizeFileName(payload.originalFilename);
    await adapter.uploadPrintFile({ localFilePath, remoteFileName });
  } catch (err) {
    // Nothing reached the printer — always a hard failure, no matter the mode.
    const message = err instanceof Error ? err.message : String(err);
    logger.error('start_print command failed before upload completed', { jobId, error: message });

    await recordStartPrintResult(supabase, command.id, {
      startMode: printStartMode,
      autoStartAttempted: false,
      autoStartSucceeded: false,
      manualStartRequired: false,
      startFailureReason: message,
    });
    await failJobFromAnyActiveState(supabase, logger, jobId, message);
    await logPrinterEvent(supabase, printerId, 'print_start_failed', message, { printJobId: jobId });

    if (localFilePath) await cleanupTempFile(localFilePath);
    throw err;
  }

  // The FTPS upload has definitively succeeded past this point — the file is
  // on the printer regardless of what happens next.
  const uploadedAt = new Date().toISOString();
  await logPrinterEvent(supabase, printerId, 'upload_completed', 'File uploaded to printer', {
    printJobId: jobId,
    payload: { remoteFileName },
  });

  try {
    await runPostUploadStart(
      supabase,
      adapter,
      logger,
      command,
      printerId,
      jobId,
      remoteFileName,
      uploadedAt,
      printStartMode,
    );
  } finally {
    if (localFilePath) await cleanupTempFile(localFilePath);
  }
}

/**
 * Runs everything that happens after a successful upload: sending (or
 * skipping) the MQTT start command, and deciding whether a failure to
 * auto-start is a job failure (`auto`) or a "waiting for a human"
 * non-failure (`manual`, `auto_with_manual_fallback`).
 */
async function runPostUploadStart(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  logger: Logger,
  command: PrinterCommandsRow,
  printerId: string,
  jobId: string,
  remoteFileName: string,
  uploadedAt: string,
  printStartMode: PrintStartMode,
): Promise<void> {
  await transitionJobStatus(supabase, logger, jobId, 'uploading_to_printer', 'starting');

  if (printStartMode === 'manual') {
    await logPrinterEvent(supabase, printerId, 'manual_start_required', MANUAL_MODE_MESSAGE, {
      printJobId: jobId,
    });
    await markManualStartRequired(supabase, logger, jobId, printerId, command.id, {
      remoteFileName,
      uploadedAt,
      startMode: printStartMode,
      autoStartAttempted: false,
      autoStartSucceeded: false,
      manualStartRequired: true,
      message: MANUAL_MODE_MESSAGE,
    });
    return;
  }

  await logPrinterEvent(supabase, printerId, 'print_starting', 'Sending start command to printer', {
    printJobId: jobId,
  });

  let startResult: StartPrintResult | undefined;
  let startError: unknown;
  try {
    startResult = await adapter.startPrint({ remoteFileName, useAms: true });
  } catch (err) {
    startError = err;
  }

  if (startResult?.started) {
    await transitionJobStatus(supabase, logger, jobId, 'starting', 'printing', { startedAt: uploadedAt });
    await supabase.from('printers').update({ current_job_id: jobId }).eq('id', printerId);
    await recordStartPrintResult(supabase, command.id, {
      remoteFileName,
      uploadedAt,
      startMode: printStartMode,
      autoStartAttempted: true,
      autoStartSucceeded: true,
      manualStartRequired: false,
    });
    await logPrinterEvent(supabase, printerId, 'print_started', 'Print started successfully', {
      printJobId: jobId,
    });
    return;
  }

  const failureReason =
    startError instanceof Error
      ? startError.message
      : startError
        ? String(startError)
        : (startResult?.message ?? 'Printer declined to start the print');

  if (printStartMode === 'auto') {
    // Preserve the original behavior exactly: a rejected/timed-out start
    // command fails the job, even though the file made it to the printer.
    await recordStartPrintResult(supabase, command.id, {
      remoteFileName,
      uploadedAt,
      startMode: printStartMode,
      autoStartAttempted: true,
      autoStartSucceeded: false,
      manualStartRequired: false,
      startFailureReason: failureReason,
    });
    await failJobFromAnyActiveState(supabase, logger, jobId, failureReason);
    await logPrinterEvent(supabase, printerId, 'print_start_failed', failureReason, { printJobId: jobId });
    throw startError instanceof Error ? startError : new Error(failureReason);
  }

  // auto_with_manual_fallback: the upload already succeeded, so a rejected
  // or timed-out start command (e.g. Bambu's ACS blocking it in Cloud Mode)
  // is not a job failure — it just means a human needs to press start.
  await logPrinterEvent(supabase, printerId, 'manual_start_required', FALLBACK_MESSAGE, {
    printJobId: jobId,
    payload: { startFailureReason: failureReason },
  });
  await markManualStartRequired(supabase, logger, jobId, printerId, command.id, {
    remoteFileName,
    uploadedAt,
    startMode: printStartMode,
    autoStartAttempted: true,
    autoStartSucceeded: false,
    manualStartRequired: true,
    startFailureReason: failureReason,
    message: FALLBACK_MESSAGE,
  });
}

/**
 * Shared landing spot for both `manual` mode and a fallback-triggered
 * outcome: reuses the existing `printing` job status (rather than adding a
 * new one) so the job keeps occupying the active print slot and — crucially
 * — so `StatusReporter.reconcileJob` will still notice and correctly
 * transition it to `completed`/`failed` once a human actually starts the
 * print and it finishes. `manualStartRequired: true` in the command result
 * is what the web UI uses to show "Ready on printer — manual start
 * required" instead of "Printing" for as long as that stays true.
 */
async function markManualStartRequired(
  supabase: BridgeSupabaseClient,
  logger: Logger,
  jobId: string,
  printerId: string,
  commandId: string,
  result: StartPrintCommandResult,
): Promise<void> {
  await transitionJobStatus(supabase, logger, jobId, 'starting', 'printing');
  await supabase.from('printers').update({ current_job_id: jobId }).eq('id', printerId);
  await recordStartPrintResult(supabase, commandId, result);
}

async function recordStartPrintResult(
  supabase: BridgeSupabaseClient,
  commandId: string,
  result: StartPrintCommandResult,
): Promise<void> {
  // printer_commands.result is an untyped JSONB column (Record<string, unknown> | null)
  // by design — StartPrintCommandResult is the convention this handler writes into it.
  await supabase
    .from('printer_commands')
    .update({ result: result as unknown as Record<string, unknown> })
    .eq('id', commandId);
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
