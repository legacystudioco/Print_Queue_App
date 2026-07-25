import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createPrinterAdapter } from './factory.js';
import { MockPrinterAdapter } from './mock/MockPrinterAdapter.js';
import { BambuP1SPrinterAdapter } from './bambu/BambuP1SPrinterAdapter.js';
import { SnapmakerPrinterAdapter } from './snapmaker/SnapmakerPrinterAdapter.js';
import { FlashforgePrinterAdapter } from './flashforge/FlashforgePrinterAdapter.js';

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'secret-key',
  BRIDGE_ID: 'home-bridge-1',
};

const bambuEnv = {
  ...validEnv,
  PRINTER_ADAPTER: 'bambu',
  BAMBU_PRINTER_IP: '192.168.1.50',
  BAMBU_PRINTER_SERIAL: '00M00A000000000',
  BAMBU_ACCESS_CODE: '12345678',
};

const logger = createLogger('error');

describe('createPrinterAdapter', () => {
  it('returns MockPrinterAdapter when PRINTER_ADAPTER=mock, regardless of printer brand', () => {
    const config = loadConfig(validEnv);
    expect(createPrinterAdapter(config, logger, { brand: 'snapmaker' })).toBeInstanceOf(MockPrinterAdapter);
  });

  it('is DB-driven: a non-mock PRINTER_ADAPTER defers to printer.brand', () => {
    const config = loadConfig(bambuEnv);
    expect(createPrinterAdapter(config, logger, { brand: 'bambu' })).toBeInstanceOf(BambuP1SPrinterAdapter);
    expect(createPrinterAdapter(config, logger, { brand: 'snapmaker' })).toBeInstanceOf(SnapmakerPrinterAdapter);
    expect(createPrinterAdapter(config, logger, { brand: 'flashforge' })).toBeInstanceOf(FlashforgePrinterAdapter);
  });
});
