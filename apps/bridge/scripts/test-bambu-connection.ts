#!/usr/bin/env tsx
/**
 * Manual diagnostic script for the Bambu P1S adapter — run this against a
 * REAL printer to verify (or debug) the local MQTT/FTPS integration. This
 * is intentionally separate from the automated test suite: it needs a
 * physical printer on the network and is not something CI can run.
 *
 * Usage:
 *   BAMBU_PRINTER_IP=192.168.1.50 BAMBU_PRINTER_SERIAL=00M0... \
 *   BAMBU_ACCESS_CODE=12345678 pnpm --filter bridge exec tsx scripts/test-bambu-connection.ts
 *
 * See docs/bambu-integration.md for what to check at each step.
 */
import { createLogger } from '../src/logger.js';
import { BambuP1SPrinterAdapter } from '../src/printers/bambu/BambuP1SPrinterAdapter.js';

async function main() {
  const ip = requireEnv('BAMBU_PRINTER_IP');
  const serialNumber = requireEnv('BAMBU_PRINTER_SERIAL');
  const accessCode = requireEnv('BAMBU_ACCESS_CODE');
  const deviceName = process.env.BAMBU_DEVICE_NAME ?? 'P1S';

  const logger = createLogger('debug');
  const adapter = new BambuP1SPrinterAdapter({ ip, serialNumber, accessCode, deviceName }, logger);

  console.log(`\n1. Connecting to ${ip}:8883 over MQTTS as user "bblp"…`);
  const connection = await adapter.testConnection();
  console.log('   Result:', connection);
  if (!connection.connected) {
    console.error('   Connection failed — stopping here. Check IP, access code, and that "LAN Only Mode" is enabled on the printer.');
    process.exit(1);
  }

  console.log('\n2. Waiting up to 5s for a status report over MQTT…');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const status = await adapter.getStatus();
  console.log('   Latest status:', status);
  if (status.status === 'unknown') {
    console.warn(
      '   No report received yet. Either the printer has not pushed a status message, or ' +
        'mqttStatus.ts is not parsing its payload shape correctly — inspect `status.raw` ' +
        'once you capture a message (add a console.log in mqttStatus.ts temporarily).',
    );
  }

  console.log(
    '\n3. NOT running uploadPrintFile()/startPrint() automatically — those would actually ' +
      'start a print. Run them manually via the bridge with a real queued job once steps 1-2 look right.',
  );

  await adapter.disconnect();
  process.exit(0);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
