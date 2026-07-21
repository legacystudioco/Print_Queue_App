import { PrinterAdapterError, type PrinterAdapterErrorCode } from '@print-queue/shared';

/** Normalizes whatever mqtt.js / basic-ftp throw into our adapter error shape. */
export function normalizeBambuError(code: PrinterAdapterErrorCode, err: unknown): PrinterAdapterError {
  if (err instanceof PrinterAdapterError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new PrinterAdapterError(code, message, err);
}

/**
 * Node.js system error codes (from the `net`/`tls` layer) that mean the
 * host is genuinely unreachable — wrong IP, printer off, not on this
 * network, firewalled, etc. — as opposed to reachable-but-rejected.
 */
const UNREACHABLE_SYSTEM_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'EHOSTDOWN',
  'EAI_AGAIN',
]);

/**
 * mqtt.js's CONNACK reason codes (see mqtt/build/lib/handlers/ack.js).
 * 4 / 134 = "Bad username or password" — since the bridge always connects
 * with the fixed username "bblp", this can only mean the access code is
 * wrong. 5 / 135 = "Not authorized" — a real credential rejection that
 * isn't specifically the "bad password" case (e.g. the printer's local
 * API access has been revoked/blocked for another reason).
 */
const BAD_CREDENTIALS_REASON_CODES = new Set([4, 134]);
const NOT_AUTHORIZED_REASON_CODES = new Set([5, 135]);

/**
 * Classifies a raw connection failure from mqtt.js into one of the
 * bridge's four startup health-check outcomes. Never guesses — anything
 * that doesn't clearly match a known pattern falls through to the
 * generic `connection_failed` bucket rather than being mis-labeled.
 */
export function classifyBambuConnectionError(err: unknown): PrinterAdapterErrorCode {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;

    if (typeof code === 'number') {
      if (BAD_CREDENTIALS_REASON_CODES.has(code)) return 'invalid_access_code';
      if (NOT_AUTHORIZED_REASON_CODES.has(code)) return 'authentication_failed';
      return 'connection_failed';
    }

    if (typeof code === 'string' && UNREACHABLE_SYSTEM_CODES.has(code)) {
      return 'connection_failed';
    }
  }

  return 'connection_failed';
}

const HEALTH_CHECK_MESSAGES: Record<PrinterAdapterErrorCode, string> = {
  connection_failed: 'Cannot reach printer',
  invalid_access_code: 'Invalid access code',
  authentication_failed: 'Authentication failed',
  upload_failed: 'File upload failed',
  start_failed: 'Failed to start print',
  not_connected: 'Not connected',
  unsupported_operation: 'Unsupported operation',
  unknown: 'Unknown error',
};

export function healthCheckMessageFor(code: PrinterAdapterErrorCode): string {
  return HEALTH_CHECK_MESSAGES[code];
}

/** Builds a normalized error from a raw mqtt.js connection failure, classified for the health check. */
export function normalizeBambuConnectionError(err: unknown): PrinterAdapterError {
  const code = classifyBambuConnectionError(err);
  const detail = err instanceof Error ? err.message : String(err);
  return new PrinterAdapterError(code, `${healthCheckMessageFor(code)}: ${detail}`, err);
}
