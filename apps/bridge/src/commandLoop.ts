import type { PrintStartMode, PrinterAdapter } from '@print-queue/shared';
import type { BridgeSupabaseClient } from './lib/supabase.js';
import type { PrinterCommandsRow } from './lib/database.types.js';
import type { Logger } from './logger.js';
import {
  handleCancelPrintCommand,
  handlePausePrintCommand,
  handleRefreshStatusCommand,
  handleResumePrintCommand,
} from './handlers/simpleCommands.js';
import { handleStartPrintCommand } from './handlers/startPrint.js';

/**
 * Polls for and processes exactly one printer command per tick.
 *
 * Claiming goes through the `claim_next_printer_command` Postgres function
 * (see migration 0004), which locks the row `FOR UPDATE SKIP LOCKED` and
 * atomically flips it from `pending` to `claimed` — so two bridge instances
 * (or a restarted one racing its old self) can never both pick up the same
 * command. This loop then double-checks `claimed_by_bridge` matches our own
 * id before doing anything, as a second line of defense.
 */
export class CommandLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private stopped = false;

  constructor(
    private readonly supabase: BridgeSupabaseClient,
    private readonly adapter: PrinterAdapter,
    private readonly logger: Logger,
    private readonly printerId: string,
    private readonly bridgeId: string,
    private readonly tempDirectory: string,
    private readonly intervalMs: number,
    private readonly printStartMode: PrintStartMode,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    try {
      const { data: commands, error } = await this.supabase.rpc('claim_next_printer_command', {
        p_printer_id: this.printerId,
        p_bridge_id: this.bridgeId,
      });

      if (error) {
        this.logger.error('Failed to claim next command', { error: error.message });
        return;
      }

      const command = commands?.[0];
      if (!command) return;

      // Defense in depth: the RPC already guarantees this, but never act on
      // a command this bridge did not itself just claim.
      if (command.claimed_by_bridge !== this.bridgeId) {
        this.logger.warn('Claimed command not owned by this bridge, skipping', { commandId: command.id });
        return;
      }

      await this.process(command);
    } catch (err) {
      this.logger.error('Command loop tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.processing = false;
    }
  }

  private async process(command: PrinterCommandsRow): Promise<void> {
    const log = this.logger.child({ commandId: command.id, commandType: command.command_type });
    log.info('Processing command');

    await this.supabase.from('printer_commands').update({ status: 'processing' }).eq('id', command.id);

    try {
      switch (command.command_type) {
        case 'start_print':
          await handleStartPrintCommand(
            this.supabase,
            this.adapter,
            this.logger,
            this.tempDirectory,
            command,
            this.printStartMode,
          );
          break;
        case 'refresh_status':
          await handleRefreshStatusCommand(this.supabase, this.adapter, command);
          break;
        case 'pause_print':
          await handlePausePrintCommand(this.supabase, this.adapter, command);
          break;
        case 'resume_print':
          await handleResumePrintCommand(this.supabase, this.adapter, command);
          break;
        case 'cancel_print':
          await handleCancelPrintCommand(this.supabase, this.adapter, this.logger, command);
          break;
        default:
          throw new Error(`Unknown command type: ${command.command_type satisfies never}`);
      }

      await this.supabase
        .from('printer_commands')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', command.id);
      log.info('Command completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.supabase
        .from('printer_commands')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: message })
        .eq('id', command.id);
      log.error('Command failed', { error: message });
    }
  }
}
