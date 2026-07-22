import type { StartPrintInput, StartPrintResult } from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import type { BambuMqttConnection } from './connection.js';
import { mqttRequestTopic, type BambuPrinterConfig } from './config.js';
import type { BambuStatusMonitor } from './mqttStatus.js';
import { normalizeBambuError } from './errors.js';

const START_ACK_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

/**
 * UNVERIFIED AGAINST PHYSICAL HARDWARE — see docs/bambu-integration.md.
 *
 * Publishes the community-documented "project_file" print command. The
 * `param`/`url` fields in particular are the least certain part of this
 * whole integration: they need to point at wherever fileUpload.ts actually
 * placed the file, using whatever path convention the printer's firmware
 * expects. Confirm both together against a real printer.
 *
 * Because there is no synchronous request/response here (MQTT is
 * fire-and-forget), "success" is inferred by polling the status monitor
 * for a state change to `printing`/`preparing` within a timeout window —
 * not a real acknowledgement from the printer.
 */
export async function startPrintViaMqtt(
  connection: BambuMqttConnection,
  config: BambuPrinterConfig,
  statusMonitor: BambuStatusMonitor,
  input: StartPrintInput,
  logger: Logger,
): Promise<StartPrintResult> {
  const client = connection.getClient();

  const payload = {
    print: {
      sequence_id: '0',
      command: 'project_file',
      param: 'Metadata/plate_1.gcode',
      url: `ftp:///${input.remoteFileName}`,
      bed_type: 'auto',
      timelapse: false,
      bed_leveling: true,
      flow_cali: false,
      vibration_cali: true,
      layer_inspect: false,
      use_ams: input.useAms ?? true,
    },
  };

  try {
    await new Promise<void>((resolve, reject) => {
      client.publish(mqttRequestTopic(config.serialNumber), JSON.stringify(payload), (err) =>
        err ? reject(err) : resolve(),
      );
    });
  } catch (err) {
    throw normalizeBambuError('start_failed', err);
  }

  logger.info('Published start-print command, waiting for printer to acknowledge via status…', {
    remoteFileName: input.remoteFileName,
  });

  const deadline = Date.now() + START_ACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = statusMonitor.getLatestStatus().status;
    if (status === 'printing' || status === 'preparing') {
      return { started: true };
    }
    if (status === 'failed') {
      return { started: false, message: 'Printer reported a failure after the start command' };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    started: false,
    message: 'Timed out waiting for the printer to acknowledge the start command',
  };
}
