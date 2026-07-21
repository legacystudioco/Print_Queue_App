import type { PrinterAdapter, PrinterAdapterErrorCode } from '@print-queue/shared';
import type { Logger } from './logger.js';

/**
 * Startup connection health check. Runs for any adapter (mock included —
 * `pnpm sim offline` before starting the bridge exercises this same path)
 * so operators always get one clear, unambiguous line about whether the
 * bridge can actually talk to the printer before the command/status loops
 * start.
 */
const FAILURE_LABELS: Partial<Record<PrinterAdapterErrorCode, string>> = {
  connection_failed: 'Cannot reach printer',
  invalid_access_code: 'Invalid access code',
  authentication_failed: 'Authentication failed',
};

export interface HealthCheckResult {
  healthy: boolean;
  label: string;
}

export async function runStartupHealthCheck(
  adapter: PrinterAdapter,
  logger: Logger,
): Promise<HealthCheckResult> {
  logger.info('Running printer connection health check…');

  const result = await adapter.testConnection();

  if (result.connected) {
    logger.info('✓ Connected');
    return { healthy: true, label: 'Connected' };
  }

  const label = (result.code && FAILURE_LABELS[result.code]) ?? 'Connection failed';
  logger.error(`✗ ${label}`, { detail: result.message, code: result.code });
  return { healthy: false, label };
}
