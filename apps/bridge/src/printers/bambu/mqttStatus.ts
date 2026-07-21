import type { PrinterStatus, PrinterStatusReport } from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import type { BambuMqttConnection } from './connection.js';
import { mqttReportTopic, mqttRequestTopic, type BambuPrinterConfig } from './config.js';

/**
 * Parses the printer's periodic MQTT "report" messages. The field names
 * below (`print.gcode_state`, `print.mc_percent`, `print.nozzle_temper`,
 * `print.bed_temper`, `print.subtask_name`, `print.ams`) match the shape
 * widely documented by community Bambu Lab integrations (OpenBambuAPI,
 * bambulabs_api, Home Assistant's bambu_lab integration), but Bambu has
 * never published this as a stable public API — firmware updates can
 * change it without notice.
 *
 * AMS data is parsed here for diagnostics/health-check purposes ONLY
 * (see getAmsStatus() / scripts/test-bambu-connection.ts). It is
 * deliberately never wired into queue/job logic — AMS slot contents
 * remain manually entered per the product design (see docs/setup-supabase.md
 * and the job_ams_slots table); this app never trusts printer-reported
 * AMS contents to decide what's actually loaded.
 */
interface RawBambuAmsTray {
  id?: string;
  /** Material short code, e.g. "PLA", "PETG" — empty string means the slot is empty. */
  tray_type?: string;
  /** Hex color with alpha, e.g. "FF6A13FF". */
  tray_color?: string;
}

interface RawBambuAmsUnit {
  id?: string;
  /** Percent, as a string (e.g. "45"). */
  humidity?: string;
  /** Celsius, as a string. */
  temp?: string;
  tray?: RawBambuAmsTray[];
}

interface RawBambuReport {
  print?: {
    gcode_state?: string;
    mc_percent?: number;
    nozzle_temper?: number;
    bed_temper?: number;
    subtask_name?: string;
    ams?: {
      ams?: RawBambuAmsUnit[];
      ams_exist_bits?: string;
      tray_exist_bits?: string;
    };
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

export interface AmsTraySummary {
  amsIndex: number;
  traySlot: number;
  materialType: string | null;
  colorHex: string | null;
  isEmpty: boolean;
}

export interface AmsStatusSummary {
  /** False until at least one MQTT report containing an `ams` block has been received. */
  reported: boolean;
  units: number;
  trays: AmsTraySummary[];
}

export class BambuStatusMonitor {
  private latest: PrinterStatusReport = { status: 'unknown' };
  private latestRaw: RawBambuReport | null = null;
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

  /** Diagnostics-only summary of AMS contents. Never consumed by queue/job logic. */
  getAmsStatus(): AmsStatusSummary {
    const ams = this.latestRaw?.print?.ams?.ams;
    if (!ams) {
      return { reported: false, units: 0, trays: [] };
    }

    const trays: AmsTraySummary[] = [];
    ams.forEach((unit, amsIndex) => {
      (unit.tray ?? []).forEach((tray, traySlot) => {
        const materialType = tray.tray_type?.trim() || null;
        trays.push({
          amsIndex,
          traySlot,
          materialType,
          colorHex: tray.tray_color ?? null,
          isEmpty: !materialType,
        });
      });
    });

    return { reported: true, units: ams.length, trays };
  }

  /** Full last-parsed report, for diagnostics that need fields not surfaced elsewhere. */
  getRawReport(): unknown {
    return this.latestRaw;
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

    this.latestRaw = parsed;

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
