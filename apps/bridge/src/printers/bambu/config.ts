/** Connection details for a single Bambu Lab P1S on the local network. */
export interface BambuPrinterConfig {
  ip: string;
  serialNumber: string;
  /** The printer's local-access "LAN Only Mode" access code, shown on its screen. */
  accessCode: string;
  deviceName: string;
}

export const BAMBU_MQTT_PORT = 8883;
export const BAMBU_FTPS_PORT = 990;
export const BAMBU_MQTT_USERNAME = 'bblp';
export const BAMBU_FTPS_USERNAME = 'bblp';

export function mqttReportTopic(serialNumber: string): string {
  return `device/${serialNumber}/report`;
}

export function mqttRequestTopic(serialNumber: string): string {
  return `device/${serialNumber}/request`;
}
