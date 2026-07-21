import type { PrinterAdapter } from '@print-queue/shared';
import type { BridgeConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { MockPrinterAdapter } from './mock/MockPrinterAdapter.js';
import { BambuP1SPrinterAdapter } from './bambu/BambuP1SPrinterAdapter.js';

export function createPrinterAdapter(config: BridgeConfig, logger: Logger): PrinterAdapter {
  if (config.PRINTER_ADAPTER === 'mock') {
    logger.info('Using MockPrinterAdapter — no physical printer will be contacted');
    return new MockPrinterAdapter(config.TEMP_DIRECTORY);
  }

  logger.info(
    'Using BambuP1SPrinterAdapter — connection, status, temperature, and AMS reporting are ' +
      'verified against a real P1S. File upload and start-print are structurally complete but ' +
      'not yet exercised against hardware — see docs/bambu-integration.md.',
  );
  return new BambuP1SPrinterAdapter(
    {
      ip: config.BAMBU_PRINTER_IP!,
      serialNumber: config.BAMBU_PRINTER_SERIAL!,
      accessCode: config.BAMBU_ACCESS_CODE!,
      deviceName: config.BAMBU_DEVICE_NAME,
    },
    logger,
  );
}
