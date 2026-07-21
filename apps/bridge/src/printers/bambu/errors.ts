import { PrinterAdapterError, type PrinterAdapterErrorCode } from '@print-queue/shared';

/** Normalizes whatever mqtt.js / basic-ftp throw into our adapter error shape. */
export function normalizeBambuError(code: PrinterAdapterErrorCode, err: unknown): PrinterAdapterError {
  if (err instanceof PrinterAdapterError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new PrinterAdapterError(code, message, err);
}
