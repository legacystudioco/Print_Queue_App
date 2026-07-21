import type { PrinterStatus, PrinterStatusReport } from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import type { BambuMqttConnection } from './connection.js';
import { mqttReportTopic, mqttRequestTopic, type BambuPrinterConfig } from './config.js';

/**
 * UNVERIFIED AGAINST PHYSICAL HARDWARE — see docs/bambu-integration.md.
 *
 * Parses the printer's periodic MQTT "report" messages. The field names
 * below (`print.gcode_state`, `print.mc_percent`, `print.nozzle_temper`,
 * `print.bed_temper`, `print.subtask_name`) match the shape widely
 * documented by community Bambu Lab integrations, but Bambu has never
 * published this as a stable public API — firmware updates can change it
 * without notice. Treat every field access here as needing reconfirmation
 * against a real report payload before depending on it in production.
 */
interface RawBambuReport {
  print?: {
    gcode_state?: string;
    mc_percent?: number;
    nozzle_temper?: number;
    bed_temper?: number;
    subtask_name?: string;
  };
}

const GCODE_STATE_TO_PRINTER_STATUS: Record<string, PrinterStatus> = {
  IDLE: 'idle',
  PREPARE: 'preparing',
  RUNNING: 'printing',
  PAUSE: 'paused',
  FINISH: 'completed',
  FAILED: 'failed',
};

export class BambuStatusMonitor {
  private latest: PrinterStatusReport = { status: 'unknown' };
  private subscribed = false;

  constructor(
    private readonly connection: BambuMqttConnection,
    private readonly config: BambuPrinterConfig,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (this.subscribed) return;
    const client = this.connection.getClient();
    const topic = mqttReportTopic(this.config.serialNumber);

    await new Promise<void>((resolve, reject) => {
      client.subscribe(topic, (err) => (err ? reject(err) : resolve()));
    });

    client.on('message', (receivedTopic, payload) => {
      if (receivedTopic !== topic) return;
      this.handleMessage(payload);
    });

    this.subscribed = true;
    this.requestFullStatus();
  }

  /** Publishes a "pushall" request; the printer replies asynchronously on the report topic. */
  requestFullStatus(): void {
    const client = this.connection.getClient();
    client.publish(
      mqttRequestTopic(this.config.serialNumber),
      JSON.stringify({ pushing: { command: 'pushall', sequence_id: '0' } }),
    );
  }

  getLatestStatus(): PrinterStatusReport {
    return this.latest;
  }

  private handleMessage(payload: Buffer): void {
    let parsed: RawBambuReport;
    try {
      parsed = JSON.parse(payload.toString('utf-8')) as RawBambuReport;
    } catch {
      this.logger.warn('Received non-JSON MQTT payload from printer, ignoring');
      return;
    }

    const print = parsed.print;
    if (!print) return;

    const status = print.gcode_state ? GCODE_STATE_TO_PRINTER_STATUS[print.gcode_state] : undefined;

    this.latest = {
      status: status ?? this.latest.status,
      progressPercent: print.mc_percent,
      currentFileName: print.subtask_name,
      nozzleTempCelsius: print.nozzle_temper,
      bedTempCelsius: print.bed_temper,
      raw: parsed,
    };
  }
}
