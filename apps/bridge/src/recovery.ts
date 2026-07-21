import type { BridgeSupabaseClient } from './lib/supabase.js';
import type { Logger } from './logger.js';
import { logPrinterEvent, transitionJobStatus } from './jobStatus.js';

const ACTIVE_JOB_STATES = ['command_pending', 'downloading', 'uploading_to_printer', 'starting'] as const;

/**
 * Runs once at startup. If the bridge crashed or was killed mid-command,
 * any commands it had claimed are stuck at `claimed`/`processing` forever —
 * `claim_next_printer_command` only ever looks at `pending` rows, so they
 * would never be picked up again, and a print might silently never
 * complete its start pipeline. This marks those commands (and their jobs)
 * failed so an admin can see what happened and retry, instead of the queue
 * quietly wedging. It deliberately does NOT retry automatically — that
 * would risk starting the same print twice if the previous attempt had
 * actually reached the printer before the crash.
 */
export async function recoverStaleCommands(
  supabase: BridgeSupabaseClient,
  logger: Logger,
  bridgeId: string,
): Promise<void> {
  const { data: staleCommands, error } = await supabase
    .from('printer_commands')
    .select('*')
    .eq('claimed_by_bridge', bridgeId)
    .in('status', ['claimed', 'processing']);

  if (error) {
    logger.error('Failed to check for stale commands on startup', { error: error.message });
    return;
  }

  if (!staleCommands || staleCommands.length === 0) {
    logger.info('No stale commands to recover');
    return;
  }

  for (const command of staleCommands) {
    const message = 'Bridge restarted while this command was in progress; marked failed for manual retry';
    logger.warn('Recovering stale command from a previous run', { commandId: command.id });

    await supabase
      .from('printer_commands')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', command.id);

    if (command.print_job_id) {
      const { data: job } = await supabase
        .from('print_jobs')
        .select('status')
        .eq('id', command.print_job_id)
        .single();

      if (job && (ACTIVE_JOB_STATES as readonly string[]).includes(job.status)) {
        await transitionJobStatus(supabase, logger, command.print_job_id, job.status, 'failed', {
          failureMessage: message,
        });
        await supabase.from('printers').update({ current_job_id: null }).eq('id', command.printer_id);
      }

      await logPrinterEvent(supabase, command.printer_id, 'bridge_recovery', message, {
        printJobId: command.print_job_id,
      });
    }
  }
}
