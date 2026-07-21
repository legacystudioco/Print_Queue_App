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

  logger.warn(
    'Using BambuP1SPrinterAdapter — protocol details are community-documented and NOT ' +
      'verified against physical hardware. See docs/bambu-integration.md before relying on this.',
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
