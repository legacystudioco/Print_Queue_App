#!/usr/bin/env tsx
/**
 * Opt-in, local-only upload diagnostic for the Flashforge Adventurer 5M.
 * Uploads a real local .gcode file to the printer WITHOUT starting it, then
 * confirms it via the printer's own file list. Never touches Supabase,
 * never creates or modifies a Print Queue job/command — this talks
 * directly to the printer over the LAN using the same FlashforgePrinterAdapter
 * the bridge uses, just without any database involved.
 *
 * Usage:
 *   pnpm --filter bridge diagnose:flashforge-upload -- /absolute/path/to/test.gcode --confirm-upload
 *
 * The --confirm-upload flag is required and intentional friction: this
 * script really does write a file to the printer's local storage. It never
 * starts the print — start it manually from the printer screen afterward
 * to confirm the delivered file is correct.
 *
 * The core logic is exported as `runUploadDiagnostic` (adapter injected)
 * so it can be exercised in tests without a real printer or process.exit —
 * see scripts/diagnose-flashforge-upload.test.ts, which asserts the
 * injected adapter's startPrint is never called.
 */
import 'dotenv/config';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { FlashforgePrinterAdapter } from '../src/printers/flashforge/FlashforgePrinterAdapter.js';

/** Minimal surface this diagnostic needs — matches FlashforgePrinterAdapter's public shape, injectable for tests. */
export interface UploadOnlyAdapter {
  testConnection(): Promise<{ connected: boolean; message?: string; code?: string }>;
  uploadPrintFile(input: { localFilePath: string; remoteFileName: string }): Promise<{ remoteFileName: string }>;
  listRemoteFiles(): Promise<string[]>;
}

export type UploadDiagnosticOutcome =
  | { ok: true; remoteFileName: string }
  | { ok: false; reason: 'connection_failed' | 'upload_unconfirmed'; message: string };

/**
 * The actual upload-only diagnostic, with no process.exit / argv parsing —
 * safe to call directly from a test with a fake adapter. Never calls
 * startPrint/printGcode; only testConnection, uploadPrintFile, and
 * listRemoteFiles.
 */
export async function runUploadDiagnostic(
  adapter: UploadOnlyAdapter,
  localFilePath: string,
  log: (line: string) => void = console.log,
): Promise<UploadDiagnosticOutcome> {
  log('=== UPLOAD ONLY — WILL NOT START ===');
  log('This diagnostic uploads a file to the printer and stops. It never starts a print.');

  log('\n1. Testing connection…');
  const connection = await adapter.testConnection();
  if (!connection.connected) {
    return {
      ok: false,
      reason: 'connection_failed',
      message: connection.message ?? connection.code ?? 'unknown error',
    };
  }
  log('  Connected.');

  const remoteFileName = path.basename(localFilePath);
  log(`\n2. Uploading "${remoteFileName}" (UPLOAD ONLY — WILL NOT START)…`);
  const uploaded = await adapter.uploadPrintFile({ localFilePath, remoteFileName });
  log(`  Confirmed remote filename: ${uploaded.remoteFileName}`);

  log('\n3. Confirming via the printer file list…');
  const files = await adapter.listRemoteFiles();
  if (!files.includes(uploaded.remoteFileName)) {
    return {
      ok: false,
      reason: 'upload_unconfirmed',
      message: `"${uploaded.remoteFileName}" was NOT found in the printer's file list — investigate before trusting this delivery.`,
    };
  }
  log(`  ✓ "${uploaded.remoteFileName}" is present on the printer.`);

  return { ok: true, remoteFileName: uploaded.remoteFileName };
}

/** Validates CLI args before any adapter/config is touched. Exported for testing the validation rules in isolation. */
export function validateArgs(args: string[]): { filePath: string } | { error: string } {
  const confirmFlagIndex = args.indexOf('--confirm-upload');
  if (confirmFlagIndex === -1) {
    return { error: 'Refusing to upload: missing required --confirm-upload flag.' };
  }
  const filePath = args.filter((arg) => arg !== '--confirm-upload')[0];
  if (!filePath) {
    return { error: 'Missing local .gcode file path.' };
  }
  if (!filePath.toLowerCase().endsWith('.gcode')) {
    return { error: `File must have a .gcode extension, got: ${filePath}` };
  }
  return { filePath };
}

function usageAndExit(message: string): never {
  console.error(message);
  console.error(
    '\nUsage: pnpm --filter bridge diagnose:flashforge-upload -- /absolute/path/to/test.gcode --confirm-upload',
  );
  process.exit(1);
}

async function main() {
  const parsed = validateArgs(process.argv.slice(2));
  if ('error' in parsed) {
    usageAndExit(parsed.error);
  }

  const config = loadConfig();
  if (!config.FLASHFORGE_HOST || !config.FLASHFORGE_SERIAL_NUMBER || !config.FLASHFORGE_ACCESS_CODE) {
    usageAndExit(
      'FLASHFORGE_HOST, FLASHFORGE_SERIAL_NUMBER, and FLASHFORGE_ACCESS_CODE must all be set in the environment.',
    );
  }

  const logger = createLogger('warn');
  const adapter = new FlashforgePrinterAdapter(
    {
      host: config.FLASHFORGE_HOST,
      port: config.FLASHFORGE_PORT,
      serialNumber: config.FLASHFORGE_SERIAL_NUMBER,
      checkCode: config.FLASHFORGE_ACCESS_CODE,
      requestTimeoutMs: config.FLASHFORGE_REQUEST_TIMEOUT_MS,
      uploadTimeoutMs: config.FLASHFORGE_UPLOAD_TIMEOUT_MS,
    },
    logger,
  );

  const outcome = await runUploadDiagnostic(adapter, parsed.filePath);

  if (!outcome.ok) {
    console.error(`  ${outcome.reason === 'connection_failed' ? 'Connection failed' : 'Upload unconfirmed'}: ${outcome.message}`);
    process.exit(1);
  }

  console.log(
    '\nDone. The file was NOT started. Start it manually from the printer screen to confirm it prints correctly.',
  );
  process.exit(0);
}

// Only run when executed directly as a script (`tsx scripts/diagnose-flashforge-upload.ts`),
// never as a side effect of importing this module — e.g. from
// diagnose-flashforge-upload.test.ts, which imports runUploadDiagnostic/validateArgs directly.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
