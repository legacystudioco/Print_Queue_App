import type { PrinterAdapter } from '@print-queue/shared';
import type { BridgeSupabaseClient } from '../lib/supabase.js';
import { logPrinterEvent, transitionJobStatus } from '../jobStatus.js';
import type { PrinterCommandsRow } from '../lib/database.types.js';

export async function handleRefreshStatusCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  command: PrinterCommandsRow,
): Promise<void> {
  const status = await adapter.getStatus();
  await logPrinterEvent(supabase, command.printer_id, 'status_report', `Status: ${status.status}`, {
    printJobId: command.print_job_id,
    payload: { progressPercent: status.progressPercent },
  });
}

export async function handlePausePrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  command: PrinterCommandsRow,
): Promise<void> {
  await adapter.pausePrint();
  await logPrinterEvent(supabase, command.printer_id, 'print_paused', 'Print paused', {
    printJobId: command.print_job_id,
  });
}

export async function handleResumePrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  command: PrinterCommandsRow,
): Promise<void> {
  await adapter.resumePrint();
  await logPrinterEvent(supabase, command.printer_id, 'print_resumed', 'Print resumed', {
    printJobId: command.print_job_id,
  });
}

export async function handleCancelPrintCommand(
  supabase: BridgeSupabaseClient,
  adapter: PrinterAdapter,
  logger: import('../logger.js').Logger,
  command: PrinterCommandsRow,
): Promise<void> {
  await adapter.cancelPrint();
  if (command.print_job_id) {
    const { data: job } = await supabase
      .from('print_jobs')
      .select('status')
      .eq('id', command.print_job_id)
      .single();
    if (job && job.status !== 'completed' && job.status !== 'cancelled' && job.status !== 'failed') {
      await transitionJobStatus(supabase, logger, command.print_job_id, job.status, 'cancelled');
    }
    await supabase.from('printers').update({ current_job_id: null }).eq('id', command.printer_id);
  }
  await logPrinterEvent(supabase, command.printer_id, 'print_cancelled', 'Print cancelled', {
    printJobId: command.print_job_id,
  });
}
