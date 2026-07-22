import type { PrintStartMode } from './enums';

/**
 * Structured outcome the bridge writes to `printer_commands.result` for a
 * `start_print` command. `printer_commands.result` is a pre-existing JSONB
 * column with no fixed shape, so this is a convention enforced in code, not
 * a database constraint — see docs/bambu-integration.md and
 * apps/bridge/src/handlers/startPrint.ts.
 *
 * `remoteFileName`/`uploadedAt` are only present once the FTPS upload has
 * actually succeeded — their absence is how callers (the web UI) tell a
 * pre-upload failure apart from a post-upload one without a dedicated
 * "failed before upload" column.
 */
export interface StartPrintCommandResult {
  remoteFileName?: string;
  uploadedAt?: string;
  startMode: PrintStartMode;
  autoStartAttempted: boolean;
  autoStartSucceeded: boolean;
  manualStartRequired: boolean;
  startFailureReason?: string;
  message?: string;
}

/** Type guard for reading an untyped `printer_commands.result` JSON value back out. */
export function isStartPrintCommandResult(value: unknown): value is StartPrintCommandResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'startMode' in value &&
    'autoStartAttempted' in value &&
    'autoStartSucceeded' in value &&
    'manualStartRequired' in value
  );
}
