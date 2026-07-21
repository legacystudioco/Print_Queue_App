import {
  PrinterAdapterError,
  type PrinterAdapter,
  type PrinterConnectionResult,
  type PrinterStatusReport,
  type StartPrintInput,
  type StartPrintResult,
  type UploadedPrintFile,
  type UploadPrintFileInput,
} from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import type { BambuPrinterConfig } from './config.js';
import { BambuMqttConnection } from './connection.js';
import { BambuStatusMonitor, type AmsStatusSummary } from './mqttStatus.js';
import { uploadPrintFileViaFtps } from './fileUpload.js';
import { startPrintViaMqtt } from './startPrintCommand.js';
import { normalizeBambuConnectionError, normalizeBambuError } from './errors.js';
import { mqttRequestTopic } from './config.js';

/**
 * Bambu Lab P1S adapter over the printer's local network MQTT + FTPS API.
 * This local API is always on and independent of "LAN Only Mode" (which
 * only controls whether the printer *also* keeps a cloud connection) —
 * connecting here does not require, and does not disable, cloud/Bambu
 * Handy access.
 *
 * Protocol details (topic names, payload shapes, FTPS target path) come
 * from community reverse-engineering, not an official Bambu Lab API —
 * see docs/bambu-integration.md for what's been verified against real
 * hardware and what to check if firmware behavior ever changes.
 */
export class BambuP1SPrinterAdapter implements PrinterAdapter {
  private readonly connection: BambuMqttConnection;
  private readonly statusMonitor: BambuStatusMonitor;
  private connected = false;

  constructor(
    private readonly config: BambuPrinterConfig,
    private readonly logger: Logger,
  ) {
    this.connection = new BambuMqttConnection(config, logger);
    this.statusMonitor = new BambuStatusMonitor(this.connection, config, logger);
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    await this.connection.connect();
    await this.statusMonitor.start();
    this.connected = true;
  }

  async testConnection(): Promise<PrinterConnectionResult> {
    try {
      await this.ensureConnected();
      return { connected: true };
    } catch (err) {
      const normalized = err instanceof PrinterAdapterError ? err : normalizeBambuConnectionError(err);
      return { connected: false, message: normalized.message, code: normalized.code };
    }
  }

  async getStatus(): Promise<PrinterStatusReport> {
    await this.ensureConnected();
    return this.statusMonitor.getLatestStatus();
  }

  /**
   * Diagnostics-only AMS summary — used by the startup health check and
   * scripts/test-bambu-connection.ts. Deliberately not part of the
   * PrinterAdapter interface: queue/job logic never reads AMS contents
   * from the printer, only from the manually-entered job_ams_slots rows.
   */
  async getAmsStatus(): Promise<AmsStatusSummary> {
    await this.ensureConnected();
    return this.statusMonitor.getAmsStatus();
  }

  /** Full last-parsed MQTT report, for diagnostics that need raw fields. */
  getRawReport(): unknown {
    return this.statusMonitor.getRawReport();
  }

  /** Forces a fresh "pushall" status request rather than waiting for the next periodic report. */
  requestFullStatus(): void {
    this.statusMonitor.requestFullStatus();
  }

  async uploadPrintFile(input: UploadPrintFileInput): Promise<UploadedPrintFile> {
    await this.ensureConnected();
    return uploadPrintFileViaFtps(this.config, input, this.logger);
  }

  async startPrint(input: StartPrintInput): Promise<StartPrintResult> {
    await this.ensureConnected();
    return startPrintViaMqtt(this.connection, this.config, this.statusMonitor, input, this.logger);
  }

  async pausePrint(): Promise<void> {
    await this.ensureConnected();
    await this.publishSimpleCommand({ print: { sequence_id: '0', command: 'pause' } });
  }

  async resumePrint(): Promise<void> {
    await this.ensureConnected();
    await this.publishSimpleCommand({ print: { sequence_id: '0', command: 'resume' } });
  }

  async cancelPrint(): Promise<void> {
    await this.ensureConnected();
    await this.publishSimpleCommand({ print: { sequence_id: '0', command: 'stop' } });
  }

  private async publishSimpleCommand(payload: Record<string, unknown>): Promise<void> {
    const client = this.connection.getClient();
    await new Promise<void>((resolve, reject) => {
      client.publish(mqttRequestTopic(this.config.serialNumber), JSON.stringify(payload), (err) =>
        err ? reject(normalizeBambuError('unknown', err)) : resolve(),
      );
    });
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
    this.connected = false;
  }
}
