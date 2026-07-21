import {
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
import { BambuStatusMonitor } from './mqttStatus.js';
import { uploadPrintFileViaFtps } from './fileUpload.js';
import { startPrintViaMqtt } from './startPrintCommand.js';
import { normalizeBambuError } from './errors.js';
import { mqttRequestTopic } from './config.js';

/**
 * Bambu Lab P1S adapter over the local "LAN Only Mode" MQTT + FTPS API.
 *
 * STATUS: structurally complete, but UNVERIFIED against physical hardware.
 * Every protocol-specific detail (topic names, payload shapes, FTPS target
 * path) is based on community reverse-engineering, not an official Bambu
 * Lab API. Do not treat this as production-ready until each method has been
 * exercised against a real P1S — see docs/bambu-integration.md for the exact
 * checklist of what to verify and how.
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
      const normalized = normalizeBambuError('connection_failed', err);
      return { connected: false, message: normalized.message };
    }
  }

  async getStatus(): Promise<PrinterStatusReport> {
    await this.ensureConnected();
    return this.statusMonitor.getLatestStatus();
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
