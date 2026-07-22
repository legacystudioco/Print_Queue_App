import type { StartPrintInput, StartPrintResult } from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import type { BambuMqttConnection } from './connection.js';
import { mqttRequestTopic, type BambuPrinterConfig } from './config.js';
import type { BambuStatusMonitor } from './mqttStatus.js';
import { normalizeBambuError } from './errors.js';

const START_ACK_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

/**
 * Publishes the OpenBambuAPI-documented "project_file" print command — the
 * payload shape and `url: "ftp:///<name>"` root-of-sdcard convention below
 * match that spec exactly (github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md).
 *
 * On current firmware this command is gated by Bambu's Access Control
 * System (ACS): while the printer is in Cloud Mode, it silently rejects
 * "write" commands (project_file/pause/resume/stop) from anything other
 * than Bambu Studio/Handy, and shows "MQTT Command verification failed."
 * on its screen (HMS_0500-0500-0001-0007). No payload change fixes this —
 * see docs/bambu-integration.md for the evidence and the only known fix
 * (LAN-only Mode + Developer Mode).
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
    message:
      'Timed out waiting for the printer to acknowledge the start command. If the ' +
      'printer screen shows "MQTT Command verification failed", this is Bambu\'s Access ' +
      'Control System silently rejecting the command because the printer is in Cloud ' +
      'Mode — not a bad payload or network issue. See docs/bambu-integration.md for how ' +
      'to confirm this and the fix (Developer Mode).',
  };
}
