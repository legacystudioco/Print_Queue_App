// Must run before anything reads process.env. Production deployments
// (systemd EnvironmentFile=, Docker env_file:) inject env vars externally
// and don't need a .env file — this is a no-op if one isn't present, and
// never overrides variables already set in the environment.
import 'dotenv/config';

import type { PrinterAdapter } from '@print-queue/shared';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createBridgeSupabaseClient } from './lib/supabase.js';
import { createPrinterAdapter } from './printers/factory.js';
import { recoverStaleCommands } from './recovery.js';
import { StatusReporter } from './statusReporter.js';
import { CommandLoop } from './commandLoop.js';
import { runStartupHealthCheck } from './healthCheck.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL, { bridgeId: config.BRIDGE_ID });

  logger.info('Starting bridge', { adapter: config.PRINTER_ADAPTER });

  const supabase = createBridgeSupabaseClient(config);

  const { data: printer, error: printerError } = await supabase
    .from('printers')
    .select('id, name, brand')
    .eq('bridge_id', config.BRIDGE_ID)
    .maybeSingle();

  if (printerError || !printer) {
    logger.error(
      'No printer row found with a matching bridge_id — set printers.bridge_id in Supabase to match BRIDGE_ID',
      { bridgeId: config.BRIDGE_ID, error: printerError?.message },
    );
    process.exit(1);
  }

  logger.info('Bound to printer', { printerId: printer.id, printerName: printer.name, brand: printer.brand });

  const adapter = createPrinterAdapter(config, logger, printer);

  const health = await runStartupHealthCheck(adapter, logger);
  if (!health.healthy) {
    logger.error(
      'Startup health check failed — not starting the command/status loops. ' +
        'Fix the printer connection (see docs/bambu-integration.md) and restart the bridge.',
    );
    process.exit(1);
  }

  await recoverStaleCommands(supabase, logger, config.BRIDGE_ID);

  const statusReporter = new StatusReporter(
    supabase,
    adapter,
    logger,
    printer.id,
    config.HEARTBEAT_INTERVAL_MS,
    { appUrl: config.APP_URL, webhookSecret: config.NOTIFY_WEBHOOK_SECRET },
  );
  const commandLoop = new CommandLoop(
    supabase,
    adapter,
    logger,
    printer.id,
    config.BRIDGE_ID,
    config.TEMP_DIRECTORY,
    config.COMMAND_POLL_INTERVAL_MS,
    config.BAMBU_PRINT_START_MODE,
  );

  statusReporter.start();
  commandLoop.start();

  logger.info('Bridge is running', {
    heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
    commandPollIntervalMs: config.COMMAND_POLL_INTERVAL_MS,
    printStartMode: config.BAMBU_PRINT_START_MODE,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    statusReporter.stop();
    commandLoop.stop();

    if (hasDisconnect(adapter)) {
      await adapter.disconnect();
    }

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

function hasDisconnect(
  adapter: PrinterAdapter,
): adapter is PrinterAdapter & { disconnect: () => Promise<void> } {
  return typeof (adapter as { disconnect?: unknown }).disconnect === 'function';
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'Fatal error starting bridge', error: String(err) }));
  process.exit(1);
});
