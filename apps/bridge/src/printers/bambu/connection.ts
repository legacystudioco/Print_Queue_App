import mqtt, { type MqttClient } from 'mqtt';
import type { Logger } from '../../logger.js';
import { BAMBU_MQTT_PORT, BAMBU_MQTT_USERNAME, type BambuPrinterConfig } from './config.js';
import { normalizeBambuError } from './errors.js';

/**
 * Local-network MQTT connection to the printer.
 *
 * UNVERIFIED AGAINST PHYSICAL HARDWARE — see docs/bambu-integration.md.
 * Based on widely-documented community reverse-engineering of Bambu Lab's
 * "LAN Only Mode": MQTTS on port 8883, username "bblp", password = the
 * printer's local access code, and a self-signed certificate the printer
 * presents (hence `rejectUnauthorized: false` — safe only because this
 * connection never leaves the local network).
 */
export class BambuMqttConnection {
  private client: MqttClient | null = null;

  constructor(
    private readonly config: BambuPrinterConfig,
    private readonly logger: Logger,
  ) {}

  async connect(): Promise<void> {
    if (this.client?.connected) return;

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtts://${this.config.ip}:${BAMBU_MQTT_PORT}`, {
        username: BAMBU_MQTT_USERNAME,
        password: this.config.accessCode,
        rejectUnauthorized: false,
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
      });

      const onConnect = () => {
        client.removeListener('error', onError);
        this.client = client;
        this.logger.info('Connected to printer MQTT broker', { ip: this.config.ip });
        resolve();
      };
      const onError = (err: Error) => {
        client.removeListener('connect', onConnect);
        reject(normalizeBambuError('connection_failed', err));
      };

      client.once('connect', onConnect);
      client.once('error', onError);

      client.on('error', (err) => {
        this.logger.warn('MQTT client error', { error: err.message });
      });
      client.on('reconnect', () => {
        this.logger.warn('MQTT reconnecting…');
      });
    });
  }

  getClient(): MqttClient {
    if (!this.client) {
      throw normalizeBambuError('not_connected', new Error('MQTT client is not connected'));
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.client) return resolve();
      this.client.end(false, {}, () => resolve());
    });
    this.client = null;
  }
}
