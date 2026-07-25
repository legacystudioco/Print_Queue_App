#!/usr/bin/env tsx
/**
 * Safe, read-only diagnostic for every printer assigned to this bridge
 * host. Connects to each configured printer, reports reachability, status,
 * and capabilities — never uploads a file or starts/pauses/cancels a
 * print. Run this on the bridge host (e.g. the old Mac) after any config
 * change, and before trusting `pnpm --filter bridge start` to actually
 * reach the printers.
 *
 * Usage:
 *   pnpm --filter bridge diagnose:printers
 *
 * Exits non-zero if any configured, enabled printer cannot be reached.
 */
import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createBridgeSupabaseClient } from '../src/lib/supabase.js';
import { createPrinterAdapter } from '../src/printers/factory.js';
import { loadAssignedPrinters } from '../src/runtime/loadAssignedPrinters.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger('error'); // suppress info/warn noise; this script does its own reporting
  const supabase = createBridgeSupabaseClient(config);

  console.log(`Bridge host: ${config.BRIDGE_ID}\n`);

  const printers = await loadAssignedPrinters(supabase, config.BRIDGE_ID);
  let anyUnreachable = false;

  for (const printer of printers) {
    console.log(printer.name);
    console.log(`  Adapter: ${printer.brand}`);
    if (printer.brand === 'flashforge' && config.FLASHFORGE_HOST) {
      console.log(`  Host: ${config.FLASHFORGE_HOST}:${config.FLASHFORGE_PORT}`);
    } else if (printer.brand === 'bambu' && config.BAMBU_PRINTER_IP) {
      console.log(`  Host: ${config.BAMBU_PRINTER_IP}`);
    }

    let adapter;
    try {
      adapter = createPrinterAdapter(config, logger, printer);
    } catch (err) {
      console.log(`  Connection: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      anyUnreachable = true;
      console.log('');
      continue;
    }

    const connection = await adapter.testConnection();
    if (!connection.connected) {
      console.log(`  Connection: FAILED — ${connection.message ?? connection.code ?? 'unknown error'}`);
      anyUnreachable = true;
      console.log('');
      continue;
    }
    console.log('  Connection: OK');

    try {
      const status = await adapter.getStatus();
      console.log(`  Status: ${status.status}`);
    } catch (err) {
      console.log(`  Status: unavailable (${err instanceof Error ? err.message : String(err)})`);
    }

    const caps = adapter.getCapabilities();
    console.log(`  Upload: ${caps.canUploadFile ? 'supported' : 'unsupported'}`);
    console.log(`  Start: ${caps.canStartPrint ? 'supported' : 'unsupported'}`);
    console.log(`  Pause: ${caps.canPause ? 'supported' : 'unsupported'}`);
    console.log(`  Resume: ${caps.canResume ? 'supported' : 'unsupported'}`);
    console.log(`  Cancel: ${caps.canCancel ? 'supported' : 'unsupported'}`);
    console.log(`  Delivery-only: ${caps.supportsDeliveryOnly ? 'supported' : 'unsupported'}`);

    const maybeDisconnect = (adapter as unknown as { disconnect?: () => Promise<void> }).disconnect;
    if (typeof maybeDisconnect === 'function') {
      await maybeDisconnect.call(adapter);
    }

    console.log('');
  }

  if (anyUnreachable) {
    console.log('One or more printers could not be reached — see above.');
    process.exit(1);
  }

  process.exit(0);
}

// Only run when executed directly as a script, never as a side effect of
// importing this module from a test.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
