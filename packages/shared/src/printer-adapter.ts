import type { PrinterStatus } from './enums';

/**
 * Pluggable printer integration contract implemented by both the mock
 * adapter (used for all development/testing) and the real Bambu P1S
 * adapter. Queue/command logic must only ever depend on this interface,
 * never on printer-brand-specific modules.
 */
export interface PrinterAdapter {
  testConnection(): Promise<PrinterConnectionResult>;
  getStatus(): Promise<PrinterStatusReport>;
  uploadPrintFile(input: UploadPrintFileInput): Promise<UploadedPrintFile>;
  startPrint(input: StartPrintInput): Promise<StartPrintResult>;
  pausePrint(): Promise<void>;
  resumePrint(): Promise<void>;
  cancelPrint(): Promise<void>;
}

export interface PrinterConnectionResult {
  connected: boolean;
  message?: string;
  /** Present when connected is false — lets callers branch on failure kind, not just parse `message`. */
  code?: PrinterAdapterErrorCode;
}

export interface PrinterStatusReport {
  status: PrinterStatus;
  progressPercent?: number;
  currentFileName?: string;
  nozzleTempCelsius?: number;
  bedTempCelsius?: number;
  raw?: unknown;
}

export interface UploadPrintFileInput {
  /** Local filesystem path to the downloaded .gcode.3mf, staged by the bridge. */
  localFilePath: string;
  /** Filename to present to the printer / place in its print job list. */
  remoteFileName: string;
  onProgress?: (percent: number) => void;
}

export interface UploadedPrintFile {
  remoteFileName: string;
}

export interface StartPrintInput {
  remoteFileName: string;
  /** Bed leveling / flow calibration flags — printer-adapter specific, optional. */
  useAms?: boolean;
}

export interface StartPrintResult {
  started: boolean;
  message?: string;
}

export class PrinterAdapterError extends Error {
  readonly code: PrinterAdapterErrorCode;
  override readonly cause?: unknown;

  constructor(code: PrinterAdapterErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PrinterAdapterError';
    this.code = code;
    this.cause = cause;
  }
}

export type PrinterAdapterErrorCode =
  | 'connection_failed'
  | 'invalid_access_code'
  | 'authentication_failed'
  | 'upload_failed'
  | 'start_failed'
  | 'not_connected'
  | 'unsupported_operation'
  | 'unknown';
