import type { PrinterAdapter, PrinterBrand } from '@print-queue/shared';
import type { BridgeConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { MockPrinterAdapter } from './mock/MockPrinterAdapter.js';
import { BambuP1SPrinterAdapter } from './bambu/BambuP1SPrinterAdapter.js';
import { SnapmakerPrinterAdapter } from './snapmaker/SnapmakerPrinterAdapter.js';
import { FlashforgePrinterAdapter } from './flashforge/FlashforgePrinterAdapter.js';

/** The bridge's own printer row — only the field the factory actually needs. */
export interface AdapterPrinter {
  brand: PrinterBrand;
}

/**
 * Adapter selection is DB-driven: the physical printer row's `brand` column
 * (see printers.brand, packages/shared/src/printers.ts) picks the class.
 * `PRINTER_ADAPTER=mock` remains a local-dev override, checked first —
 * every other PRINTER_ADAPTER value (including the default 'bambu', kept
 * for existing deployments that already set it explicitly) simply confirms
 * "don't use mock" and defers to `printer.brand`.
 */
export function createPrinterAdapter(config: BridgeConfig, logger: Logger, printer: AdapterPrinter): PrinterAdapter {
  if (config.PRINTER_ADAPTER === 'mock') {
    logger.info('Using MockPrinterAdapter — no physical printer will be contacted');
    return new MockPrinterAdapter(config.TEMP_DIRECTORY);
  }

  if (printer.brand === 'snapmaker') {
    logger.warn(
      'Using SnapmakerPrinterAdapter — this is a placeholder; no Snapmaker device control is implemented yet.',
    );
    return new SnapmakerPrinterAdapter();
  }

  if (printer.brand === 'flashforge') {
    logger.warn(
      'Using FlashforgePrinterAdapter — this is a placeholder; no Flashforge device control is implemented yet.',
    );
    return new FlashforgePrinterAdapter();
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
