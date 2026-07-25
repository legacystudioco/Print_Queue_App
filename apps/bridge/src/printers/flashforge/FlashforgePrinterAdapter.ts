import { stat } from 'node:fs/promises';
import {
  PrinterAdapterError,
  sanitizeFileName,
  MAX_UPLOAD_SIZE_BYTES,
  type PrinterAdapter,
  type PrinterCapabilities,
  type PrinterConnectionResult,
  type PrinterStatus,
  type PrinterStatusReport,
  type StartPrintInput,
  type StartPrintResult,
  type UploadedPrintFile,
  type UploadPrintFileInput,
} from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import { FlashforgeLanClient, type FlashforgeLanClientConfig } from './FlashforgeLanClient.js';
import { FlashforgeProtocolError, normalizeFlashforgeError } from './flashforgeErrors.js';

/**
 * Adventurer 5M state strings (see docs/flashforge-integration.md and the
 * State-Machines wiki page cited in flashforgeTypes.ts) normalized into the
 * shared PrinterStatus model. `busy`/`heating` map to `preparing`;
 * `pausing`/`canceling` are transient states the docs say to treat as "still
 * busy, keep polling" — mapped to `printing` here so a mid-transition poll
 * never gets misread as a real completion/failure before the printer
 * settles into `paused`/`ready`.
 */
const STATUS_MAP: Record<string, PrinterStatus> = {
  ready: 'idle',
  building: 'printing',
  working: 'printing',
  printing: 'printing',
  busy: 'preparing',
  heating: 'preparing',
  calibrate_doing: 'preparing',
  pausing: 'printing',
  paused: 'paused',
  pause: 'paused',
  canceling: 'printing',
  cancel: 'printing',
  completed: 'completed',
  error: 'failed',
};

function mapFlashforgeStatus(raw: string): PrinterStatus {
  return STATUS_MAP[raw.trim().toLowerCase()] ?? 'unknown';
}

/**
 * Flashforge Adventurer 5M adapter over the printer's local HTTP REST API
 * (port 8898 only — see FlashforgeLanClient for why TCP/8899 isn't needed).
 * Owns Print Queue lifecycle semantics, capability mapping, status mapping,
 * and file-safety validation; all raw protocol calls go through
 * FlashforgeLanClient.
 */
export class FlashforgePrinterAdapter implements PrinterAdapter {
  private readonly client: FlashforgeLanClient;
  private lastSuccessfulConnectionAt: string | null = null;

  constructor(config: FlashforgeLanClientConfig, private readonly logger: Logger) {
    this.client = new FlashforgeLanClient(config, logger);
  }

  async testConnection(): Promise<PrinterConnectionResult> {
    try {
      await this.client.detail();
      this.lastSuccessfulConnectionAt = new Date().toISOString();
      return { connected: true };
    } catch (err) {
      const normalized = normalizeFlashforgeError(err);
      return { connected: false, message: normalized.message, code: normalized.code };
    }
  }

  async getStatus(): Promise<PrinterStatusReport> {
    const detail = await this.client.detail().catch((err) => {
      throw normalizeFlashforgeError(err);
    });
    this.lastSuccessfulConnectionAt = new Date().toISOString();

    return {
      status: mapFlashforgeStatus(detail.status),
      progressPercent:
        typeof detail.printProgress === 'number' ? Math.round(detail.printProgress * 100) : undefined,
      currentFileName: detail.printFileName || undefined,
      nozzleTempCelsius: detail.rightTemp,
      bedTempCelsius: detail.platTemp,
      raw: {
        lastSuccessfulConnectionAt: this.lastSuccessfulConnectionAt,
        rawStatus: detail.status,
        firmwareVersion: detail.firmwareVersion,
      },
    };
  }

  async uploadPrintFile(input: UploadPrintFileInput): Promise<UploadedPrintFile> {
    await this.validateLocalFile(input.localFilePath);
    const remoteFileName = sanitizeFileName(input.remoteFileName);
    this.assertGcodeExtension(remoteFileName);

    input.onProgress?.(0);
    try {
      await this.client.uploadGcode(input.localFilePath, remoteFileName, true);
    } catch (err) {
      throw normalizeFlashforgeError(err);
    }
    input.onProgress?.(90);

    await this.confirmUploaded(remoteFileName);
    input.onProgress?.(100);

    return { remoteFileName };
  }

  /**
   * A 200/code-0 response from /uploadGcode only means the printer accepted
   * the request — it is not proof the file actually landed. Confirm via
   * /gcodeList (the printer's own file listing) before reporting delivery
   * success, per the task's "never interpret upload success as printer
   * truth" requirement.
   */
  private async confirmUploaded(remoteFileName: string): Promise<void> {
    let files: string[];
    try {
      files = await this.client.gcodeList();
    } catch (err) {
      throw normalizeFlashforgeError(
        new FlashforgeProtocolError(
          'upload_unconfirmed',
          'Upload request succeeded but the printer file list could not be read to confirm it',
          err,
        ),
      );
    }

    if (!files.includes(remoteFileName)) {
      throw normalizeFlashforgeError(
        new FlashforgeProtocolError(
          'upload_unconfirmed',
          `Upload request succeeded but "${remoteFileName}" does not appear in the printer's file list`,
        ),
      );
    }
  }

  async startPrint(input: StartPrintInput): Promise<StartPrintResult> {
    const remoteFileName = sanitizeFileName(input.remoteFileName);
    this.assertGcodeExtension(remoteFileName);

    try {
      await this.client.printGcode(remoteFileName, true);
      return { started: true };
    } catch (err) {
      if (err instanceof FlashforgeProtocolError && (err.reason === 'unreachable' || err.reason === 'timeout')) {
        // Outcome unknown, not a confirmed rejection — check live status
        // once before reporting failure, so a caller's retry never sends a
        // second start command to a printer that already started this
        // exact file.
        const alreadyStarted = await this.isAlreadyPrintingExactFile(remoteFileName);
        if (alreadyStarted) return { started: true };
      }

      const normalized = normalizeFlashforgeError(err);
      this.logger.warn('Flashforge start print declined', { remoteFileName, code: normalized.code });
      return { started: false, message: normalized.message };
    }
  }

  private async isAlreadyPrintingExactFile(remoteFileName: string): Promise<boolean> {
    try {
      const detail = await this.client.detail();
      const status = mapFlashforgeStatus(detail.status);
      const fileMatches = (detail.printFileName ?? '') === remoteFileName;
      return fileMatches && (status === 'printing' || status === 'preparing');
    } catch {
      return false;
    }
  }

  async pausePrint(): Promise<void> {
    try {
      await this.client.pauseJob();
    } catch (err) {
      throw normalizeFlashforgeError(err);
    }
  }

  async resumePrint(): Promise<void> {
    try {
      await this.client.resumeJob();
    } catch (err) {
      throw normalizeFlashforgeError(err);
    }
  }

  async cancelPrint(): Promise<void> {
    try {
      await this.client.cancelJob();
    } catch (err) {
      throw normalizeFlashforgeError(err);
    }
  }

  getCapabilities(): PrinterCapabilities {
    return {
      canUploadFile: true,
      canStartPrint: true,
      canPause: true,
      canResume: true,
      canCancel: true,
      canReportProgress: true,
      canReportTemperatures: true,
      supportsDeliveryOnly: true,
    };
  }

  /** Diagnostics-only file listing — used by scripts/diagnose-flashforge-upload.ts, not part of PrinterAdapter. */
  async listRemoteFiles(): Promise<string[]> {
    return this.client.gcodeList();
  }

  private async validateLocalFile(localFilePath: string): Promise<void> {
    let stats;
    try {
      stats = await stat(localFilePath);
    } catch (err) {
      throw new PrinterAdapterError('upload_failed', `Local file not found: ${localFilePath}`, err);
    }

    if (!stats.isFile() || stats.size <= 0) {
      throw new PrinterAdapterError('upload_failed', `Local file is empty or not a regular file: ${localFilePath}`);
    }

    if (stats.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new PrinterAdapterError(
        'upload_failed',
        `Local file exceeds the ${MAX_UPLOAD_SIZE_BYTES}-byte upload limit`,
      );
    }
  }

  private assertGcodeExtension(fileName: string): void {
    if (!fileName.toLowerCase().endsWith('.gcode')) {
      throw new PrinterAdapterError(
        'upload_failed',
        `Flashforge only accepts .gcode files, got "${fileName}"`,
      );
    }
  }
}
