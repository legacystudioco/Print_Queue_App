// Must run before anything reads process.env. Production deployments
// (systemd EnvironmentFile=, Docker env_file:) inject env vars externally
// and don't need a .env file — this is a no-op if one isn't present, and
// never overrides variables already set in the environment.
import 'dotenv/config';

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createBridgeSupabaseClient } from './lib/supabase.js';
import { BridgeSupervisor } from './runtime/BridgeSupervisor.js';

/**
 * Entry point: loads config, connects to Supabase, and hands off to
 * BridgeSupervisor, which starts one isolated worker per physical printer
 * assigned to this bridge host (see runtime/BridgeSupervisor.ts and
 * runtime/PrinterWorker.ts). A single bridge host — e.g. the old Mac —
 * can run multiple printers of different brands concurrently this way; a
 * problem with one printer's worker never stops another's.
 */
async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL, { bridgeId: config.BRIDGE_ID });

  logger.info('Starting bridge', { adapter: config.PRINTER_ADAPTER });

  const supabase = createBridgeSupabaseClient(config);
  const supervisor = new BridgeSupervisor(config, supabase, logger);

  await supervisor.start();

  logger.info('Bridge is running', {
    heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
    commandPollIntervalMs: config.COMMAND_POLL_INTERVAL_MS,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    await supervisor.stop();

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'Fatal error starting bridge', error: String(err) }));
  process.exit(1);
});
