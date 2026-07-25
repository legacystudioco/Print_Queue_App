import { PrinterAdapterError, type PrinterAdapterErrorCode } from '@print-queue/shared';

export type FlashforgeErrorReason =
  | 'unreachable'
  | 'timeout'
  | 'auth_failed'
  | 'upload_failed'
  | 'upload_unconfirmed'
  | 'file_not_found'
  | 'busy'
  | 'start_failed'
  | 'protocol_error'
  | 'unsupported_operation';

const REASON_TO_LOG_CODE: Record<FlashforgeErrorReason, string> = {
  unreachable: 'FLASHFORGE_UNREACHABLE',
  timeout: 'FLASHFORGE_UNREACHABLE',
  auth_failed: 'FLASHFORGE_AUTH_FAILED',
  upload_failed: 'FLASHFORGE_UPLOAD_FAILED',
  upload_unconfirmed: 'FLASHFORGE_UPLOAD_UNCONFIRMED',
  file_not_found: 'FLASHFORGE_FILE_NOT_FOUND',
  busy: 'FLASHFORGE_BUSY',
  start_failed: 'FLASHFORGE_START_FAILED',
  protocol_error: 'FLASHFORGE_PROTOCOL_ERROR',
  unsupported_operation: 'FLASHFORGE_UNSUPPORTED_OPERATION',
};

/**
 * Internal Flashforge-specific error, thrown only from FlashforgeLanClient /
 * FlashforgePrinterAdapter. Carries a `FLASHFORGE_*`-named `code` for logs
 * and diagnostics; `normalizeFlashforgeError` maps it onto the shared,
 * brand-agnostic `PrinterAdapterErrorCode` union at the adapter boundary —
 * mirroring how printers/bambu/errors.ts classifies raw mqtt.js/basic-ftp
 * failures into that same shared union.
 */
export class FlashforgeProtocolError extends Error {
  readonly reason: FlashforgeErrorReason;
  readonly code: string;
  override readonly cause?: unknown;

  constructor(reason: FlashforgeErrorReason, message: string, cause?: unknown) {
    super(message);
    this.name = 'FlashforgeProtocolError';
    this.reason = reason;
    this.code = REASON_TO_LOG_CODE[reason];
    this.cause = cause;
  }
}

const REASON_TO_ADAPTER_CODE: Record<FlashforgeErrorReason, PrinterAdapterErrorCode> = {
  unreachable: 'connection_failed',
  timeout: 'connection_failed',
  auth_failed: 'authentication_failed',
  upload_failed: 'upload_failed',
  upload_unconfirmed: 'upload_failed',
  file_not_found: 'unknown',
  busy: 'unknown',
  start_failed: 'start_failed',
  protocol_error: 'unknown',
  unsupported_operation: 'unsupported_operation',
};

/** Normalizes any error raised inside the Flashforge transport/adapter into the shared adapter error shape. */
export function normalizeFlashforgeError(err: unknown): PrinterAdapterError {
  if (err instanceof PrinterAdapterError) return err;

  if (err instanceof FlashforgeProtocolError) {
    return new PrinterAdapterError(REASON_TO_ADAPTER_CODE[err.reason], `${err.code}: ${err.message}`, err);
  }

  const message = err instanceof Error ? err.message : String(err);
  return new PrinterAdapterError('unknown', message, err);
}

/**
 * Maps a `/detail`, `/control`, `/printGcode`, `/uploadGcode`, or
 * `/gcodeList` JSON envelope's `code` field to a failure reason, per the
 * documented HTTP API error table (Error-Codes wiki page):
 * 0/200 = success, 1 = generic error, 2 = invalid parameter,
 * 3 = unauthorized, 4 = not found, 5 = busy. Returns null for success.
 */
export function classifyResponseCode(code: number): FlashforgeErrorReason | null {
  if (code === 0 || code === 200) return null;
  if (code === 3) return 'auth_failed';
  if (code === 4) return 'file_not_found';
  if (code === 5) return 'busy';
  return 'protocol_error';
}
