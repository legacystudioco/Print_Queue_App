import { z } from 'zod';
import { printStartModes } from '@print-queue/shared';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  BRIDGE_ID: z.string().min(1),
  // Only 'mock' actually changes routing (forces the simulator) — every
  // other value defers to the printer row's `brand` column at runtime; see
  // printers/factory.ts. The named brand values exist for input validation
  // (catches typos) and local-dev familiarity, not distinct behavior.
  PRINTER_ADAPTER: z.enum(['mock', 'bambu', 'snapmaker', 'flashforge']).default('mock'),

  BAMBU_PRINTER_IP: z.string().optional(),
  BAMBU_PRINTER_SERIAL: z.string().optional(),
  BAMBU_ACCESS_CODE: z.string().optional(),
  BAMBU_DEVICE_NAME: z.string().default('P1S'),

  // Flashforge Adventurer 5M connection (only used for a printer row whose
  // brand is 'flashforge' — see printers/factory.ts, which validates these
  // are present at adapter-construction time rather than here, since a
  // multi-printer bridge can't know in advance which brands it will need).
  FLASHFORGE_HOST: z.string().optional(),
  FLASHFORGE_PORT: z.coerce.number().int().positive().default(8898),
  FLASHFORGE_SERIAL_NUMBER: z.string().optional(),
  /** The printer's LAN "Check Code", shown on its screen (Settings > Network/About). */
  FLASHFORGE_ACCESS_CODE: z.string().optional(),
  FLASHFORGE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  FLASHFORGE_UPLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  /** Same semantics as BAMBU_PRINT_START_MODE, but the Adventurer 5M's /printGcode
   * gives an unambiguous synchronous success/failure signal (unlike Bambu's
   * fire-and-forget MQTT + ACS ambiguity), so 'auto' is a safe default here. */
  FLASHFORGE_PRINT_START_MODE: z.enum(printStartModes).default('auto'),

  /**
   * How to handle Bambu's Access Control System blocking the local MQTT
   * start command while the printer is in Cloud Mode — see
   * docs/bambu-integration.md. Defaults to the safest option: a successful
   * FTPS upload always counts for something, even if auto-start doesn't
   * work on this printer's current mode.
   */
  BAMBU_PRINT_START_MODE: z.enum(printStartModes).default('auto_with_manual_fallback'),

  COMMAND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),

  TEMP_DIRECTORY: z.string().default('./tmp'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /**
   * Where the Next.js app is deployed — used only to call
   * POST {APP_URL}/api/notifications/dispatch after recording a print
   * completion (see statusReporter.ts and docs/push-notifications.md). The
   * bridge never sends push notifications itself or holds VAPID keys; it
   * just pokes the trusted backend to do so. Push dispatch is skipped
   * (with a log line) if this or NOTIFY_WEBHOOK_SECRET is unset — nothing
   * else about the bridge depends on it.
   */
  APP_URL: z.string().url().optional(),
  /** Shared secret proving a dispatch request came from this bridge, not the public internet. Must match the web app's NOTIFY_WEBHOOK_SECRET. */
  NOTIFY_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type BridgeConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid bridge configuration:\n${issues}`);
  }

  if (parsed.data.PRINTER_ADAPTER === 'bambu') {
    const missing = ['BAMBU_PRINTER_IP', 'BAMBU_PRINTER_SERIAL', 'BAMBU_ACCESS_CODE'].filter(
      (key) => !parsed.data[key as keyof BridgeConfig],
    );
    if (missing.length > 0) {
      throw new Error(
        `PRINTER_ADAPTER=bambu requires the following environment variables: ${missing.join(', ')}`,
      );
    }
  }

  return parsed.data;
}
