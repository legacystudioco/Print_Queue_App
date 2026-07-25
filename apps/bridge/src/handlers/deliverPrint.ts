import {
  sanitizeFileName,
  deliverPrintCommandPayloadSchema,
  type DeliverPrintCommandResult,
  type PrinterAdapter,
} from '@print-queue/shared';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import type { Logger } from '../logger.js';
import { failJobFromAnyActiveState, logPrinterEvent, transitionJobStatus } from '../jobStatus.js';
import { cleanupTempFile, downloadPrintFile } from '../storage/download.js';
import type { PrinterCommandsRow } from '../lib/database.types.js';

/**
 * Executes a claimed `deliver_print` command: download -> upload to the
 * printer, stopping there — this never calls adapter.startPrint(). The job
 * lands back in `ready` (not `printing`/`starting`) via the
 * `uploading_to_printer -> ready` state-machine edge, exactly the state it
 * was in before a start was requested, so it can later be started for real
 * with a normal `start_print` command (see handlers/startPrint.ts), or the
 * file can be started manually from the printer itself.
 *
 * Mirrors handleStartPrintCommand's download/upload steps intentionally —
 * see that file for the full end-to-end pipeline this is a strict subset
 * of.
 */
export async function handleDeliverPrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  logger: Logger,
  tempDirectory: string,
  command: PrinterCommandsRow,
): Promise<void> {
  const payload = deliverPrintCommandPayloadSchema.parse(command.payload);
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
    await logPrinterEvent(supabase, printerId, 'upload_started', 'Uploading file to printer (delivery only)', {
      printJobId: jobId,
    });

    const remoteFileName = sanitizeFileName(payload.originalFilename);
    await adapter.uploadPrintFile({ localFilePath, remoteFileName });

    const uploadedAt = new Date().toISOString();
    await transitionJobStatus(supabase, logger, jobId, 'uploading_to_printer', 'ready');
    await logPrinterEvent(
      supabase,
      printerId,
      'delivery_completed',
      'File delivered to printer — not started, ready for a manual or later start',
      { printJobId: jobId, payload: { remoteFileName } },
    );
    await recordDeliverPrintResult(supabase, command.id, { remoteFileName, uploadedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('deliver_print command failed', { jobId, error: message });

    await recordDeliverPrintResult(supabase, command.id, { deliveryFailureReason: message });
    await failJobFromAnyActiveState(supabase, logger, jobId, message);
    await logPrinterEvent(supabase, printerId, 'print_delivery_failed', message, { printJobId: jobId });

    throw err;
  } finally {
    if (localFilePath) await cleanupTempFile(localFilePath);
  }
}

async function recordDeliverPrintResult(
  supabase: BridgeSupabaseClient,
  commandId: string,
  result: DeliverPrintCommandResult,
): Promise<void> {
  // printer_commands.result is an untyped JSONB column (Record<string, unknown> | null)
  // by design — DeliverPrintCommandResult is the convention this handler writes into it.
  await supabase
    .from('printer_commands')
    .update({ result: result as unknown as Record<string, unknown> })
    .eq('id', commandId);
}
