#!/usr/bin/env tsx
/**
 * Manual diagnostic script for the Bambu P1S adapter — run this against a
 * REAL printer to verify (or debug) the local MQTT integration. Separate
 * from the automated test suite: it needs a physical printer on the
 * network and is not something CI can run.
 *
 * Usage (reads apps/bridge/.env automatically, or override inline):
 *   pnpm --filter bridge bambu:test-connection
 *
 *   BAMBU_PRINTER_IP=192.168.1.50 BAMBU_PRINTER_SERIAL=00M0... \
 *   BAMBU_ACCESS_CODE=12345678 pnpm --filter bridge bambu:test-connection
 *
 * This only tests connectivity and status/AMS reporting — it never
 * uploads a file or starts a print. See docs/bambu-integration.md for
 * the full physical-verification checklist.
 */
import 'dotenv/config';
import { createLogger } from '../src/logger.js';
import { BambuP1SPrinterAdapter } from '../src/printers/bambu/BambuP1SPrinterAdapter.js';
import { healthCheckMessageFor } from '../src/printers/bambu/errors.js';
import type { PrinterAdapterErrorCode } from '@print-queue/shared';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function fail(label: string) {
  console.log(`  ✗ ${label}`);
}

async function main() {
  const ip = requireEnv('BAMBU_PRINTER_IP');
  const serialNumber = requireEnv('BAMBU_PRINTER_SERIAL');
  const accessCode = requireEnv('BAMBU_ACCESS_CODE');
  const deviceName = process.env.BAMBU_DEVICE_NAME ?? 'P1S';

  console.log(`Bambu P1S connection diagnostic`);
  console.log(`  Printer:  ${deviceName} (${serialNumber})`);
  console.log(`  IP:       ${ip}`);
  console.log(
    `  Note: this uses the printer's always-on local API (MQTTS 8883). It works\n` +
      `  the same whether "LAN Only Mode" is on or off, and does not disable cloud/Bambu\n` +
      `  Handy access — LAN Only Mode does not need to be enabled for this to work.\n`,
  );

  const logger = createLogger('warn');
  const adapter = new BambuP1SPrinterAdapter({ ip, serialNumber, accessCode, deviceName }, logger);

  // 1. Connect + authenticate.
  console.log('1. Connect + authenticate');
  const connection = await adapter.testConnection();
  if (connection.connected) {
    ok('Connected');
  } else {
    const code = connection.code as PrinterAdapterErrorCode | undefined;
    fail(code ? healthCheckMessageFor(code) : 'Connection failed');
    console.log(`     detail: ${connection.message ?? '(no detail)'}`);
    console.log('\nStopping here — nothing else can be tested without a connection.');
    if (code === 'invalid_access_code') {
      console.log('  -> Re-check the access code shown on the printer: Settings icon > Network.');
    } else if (code === 'connection_failed') {
      console.log('  -> Confirm the IP is correct and the printer is on and connected to this network.');
    }
    process.exit(1);
  }

  // 2. Wait for the printer's periodic status report.
  console.log('\n2. Fetch printer status (waiting up to 8s for a report)…');
  let waited = 0;
  while (waited < 8000) {
    const status = await adapter.getStatus();
    if (status.status !== 'unknown') break;
    await new Promise((r) => setTimeout(r, 500));
    waited += 500;
  }
  const status = await adapter.getStatus();
  if (status.status !== 'unknown') {
    ok(`Printer status: ${status.status}`);
  } else {
    fail('No status report received yet');
  }

  // 3. Print state / current job.
  console.log('\n3. Fetch print state');
  if (status.status !== 'unknown') {
    ok(`State: ${status.status}${status.progressPercent !== undefined ? ` (${status.progressPercent}%)` : ''}`);
    console.log(`     current file: ${status.currentFileName ?? '(none)'}`);
  } else {
    fail('Unavailable — no status report yet');
  }

  // 4. Temperatures.
  console.log('\n4. Fetch temperatures');
  if (status.nozzleTempCelsius !== undefined || status.bedTempCelsius !== undefined) {
    ok(`Nozzle: ${status.nozzleTempCelsius ?? '?'}°C, Bed: ${status.bedTempCelsius ?? '?'}°C`);
  } else {
    fail('Temperatures not present in the latest report');
  }

  // 5. AMS status.
  console.log('\n5. Fetch AMS status');
  const ams = await adapter.getAmsStatus();
  if (ams.reported) {
    ok(`${ams.units} AMS unit(s), ${ams.trays.length} tray slot(s)`);
    for (const tray of ams.trays) {
      const label = tray.isEmpty ? 'empty' : `${tray.materialType} (${tray.colorHex ?? 'unknown color'})`;
      console.log(`     AMS ${tray.amsIndex} / slot ${tray.traySlot}: ${label}`);
    }
    console.log(
      '     (Informational only — this app never auto-populates AMS colors from the printer;\n' +
        '      job AMS slots are always entered manually.)',
    );
  } else {
    fail('No AMS block in the latest report (no AMS attached, or not reported yet)');
  }

  console.log(
    '\n6. NOT running uploadPrintFile()/startPrint() automatically — those would actually ' +
      'start a print. Use the app\'s Start Next flow with a real queued job once the checks above look right.',
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
