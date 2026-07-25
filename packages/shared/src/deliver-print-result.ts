/**
 * Structured outcome the bridge writes to `printer_commands.result` for a
 * `deliver_print` command — see start-print-result.ts for the `start_print`
 * equivalent and apps/bridge/src/handlers/deliverPrint.ts. Deliberately has
 * no `startMode`/`autoStart*`/`manualStartRequired` fields: delivery never
 * attempts to start anything, so those concepts don't apply here.
 */
export interface DeliverPrintCommandResult {
  remoteFileName?: string;
  uploadedAt?: string;
  deliveryFailureReason?: string;
  message?: string;
}

/**
 * Type guard for reading an untyped `printer_commands.result` JSON value back
 * out. Every field on DeliverPrintCommandResult is optional, so this only
 * confirms the value is a plain object — callers must already know the row
 * came from a `deliver_print` command (filter by `command_type`, as
 * apps/web's getLatestStartPrintResults does for `start_print`).
 */
export function isDeliverPrintCommandResult(value: unknown): value is DeliverPrintCommandResult {
  return typeof value === 'object' && value !== null;
}
