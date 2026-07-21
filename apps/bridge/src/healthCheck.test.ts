import type { PrinterAdapter, PrinterConnectionResult } from '@print-queue/shared';
import { describe, expect, it } from 'vitest';
import { runStartupHealthCheck } from './healthCheck.js';
import { createLogger } from './logger.js';

function fakeAdapter(result: PrinterConnectionResult): PrinterAdapter {
  return {
    testConnection: async () => result,
    getStatus: async () => ({ status: 'unknown' }),
    uploadPrintFile: async () => ({ remoteFileName: 'x' }),
    startPrint: async () => ({ started: true }),
    pausePrint: async () => {},
    resumePrint: async () => {},
    cancelPrint: async () => {},
  };
}

const logger = createLogger('error');

describe('runStartupHealthCheck', () => {
  it('reports Connected on success', async () => {
    const result = await runStartupHealthCheck(fakeAdapter({ connected: true }), logger);
    expect(result).toEqual({ healthy: true, label: 'Connected' });
  });

  it('reports "Cannot reach printer" for connection_failed', async () => {
    const result = await runStartupHealthCheck(
      fakeAdapter({ connected: false, code: 'connection_failed', message: 'ECONNREFUSED' }),
      logger,
    );
    expect(result).toEqual({ healthy: false, label: 'Cannot reach printer' });
  });

  it('reports "Invalid access code" for invalid_access_code', async () => {
    const result = await runStartupHealthCheck(
      fakeAdapter({ connected: false, code: 'invalid_access_code', message: 'Bad username or password' }),
      logger,
    );
    expect(result).toEqual({ healthy: false, label: 'Invalid access code' });
  });

  it('reports "Authentication failed" for authentication_failed', async () => {
    const result = await runStartupHealthCheck(
      fakeAdapter({ connected: false, code: 'authentication_failed', message: 'Not authorized' }),
      logger,
    );
    expect(result).toEqual({ healthy: false, label: 'Authentication failed' });
  });

  it('falls back to a generic label when no code is present', async () => {
    const result = await runStartupHealthCheck(fakeAdapter({ connected: false }), logger);
    expect(result).toEqual({ healthy: false, label: 'Connection failed' });
  });
});
