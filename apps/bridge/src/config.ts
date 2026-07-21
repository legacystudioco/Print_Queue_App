import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  BRIDGE_ID: z.string().min(1),
  PRINTER_ADAPTER: z.enum(['mock', 'bambu']).default('mock'),

  BAMBU_PRINTER_IP: z.string().optional(),
  BAMBU_PRINTER_SERIAL: z.string().optional(),
  BAMBU_ACCESS_CODE: z.string().optional(),
  BAMBU_DEVICE_NAME: z.string().default('P1S'),

  COMMAND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),

  TEMP_DIRECTORY: z.string().default('./tmp'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
