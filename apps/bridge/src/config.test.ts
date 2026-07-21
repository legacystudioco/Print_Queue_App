import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  BRIDGE_ID: 'home-bridge-1',
};

describe('loadConfig', () => {
  it('applies defaults for a minimal mock configuration', () => {
    const config = loadConfig(validEnv);
    expect(config.PRINTER_ADAPTER).toBe('mock');
    expect(config.COMMAND_POLL_INTERVAL_MS).toBe(3000);
    expect(config.HEARTBEAT_INTERVAL_MS).toBe(20_000);
  });

  it('throws when required variables are missing', () => {
    expect(() => loadConfig({ BRIDGE_ID: 'home-bridge-1' })).toThrow(/Invalid bridge configuration/);
  });

  it('requires Bambu-specific variables when PRINTER_ADAPTER=bambu', () => {
    expect(() => loadConfig({ ...validEnv, PRINTER_ADAPTER: 'bambu' })).toThrow(
      /PRINTER_ADAPTER=bambu requires/,
    );
  });

  it('accepts a full Bambu configuration', () => {
    const config = loadConfig({
      ...validEnv,
      PRINTER_ADAPTER: 'bambu',
      BAMBU_PRINTER_IP: '192.168.1.50',
      BAMBU_PRINTER_SERIAL: '00M00A000000000',
      BAMBU_ACCESS_CODE: '12345678',
    });
    expect(config.PRINTER_ADAPTER).toBe('bambu');
  });
});
