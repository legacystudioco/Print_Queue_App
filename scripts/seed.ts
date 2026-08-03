#!/usr/bin/env tsx
/**
 * Seed helper for local/dev Supabase projects.
 *
 * This does NOT create Supabase Auth users — creating auth.users rows via
 * SQL/insecure scripts is unsafe (no password hashing pipeline, breaks
 * Supabase's own invariants). Create the two accounts first through the
 * Supabase Dashboard (Authentication → Users → Add User) or `supabase auth`
 * CLI, then pass their UUIDs here. See docs/setup-supabase.md.
 *
 * The app logs in by username, not email (see
 * apps/web/src/lib/server/username.ts) — but Supabase Auth still stores an
 * email per account, so every account uses a fixed non-personal internal
 * address: "<username>@printqueue.local". ADMIN_EMAIL/OPERATOR_EMAIL below
 * must be exactly the internal address you used when creating the Auth
 * user (e.g. "tyler@printqueue.local"), not a real email.
 *
 * Seeds a few sample production-board jobs (no screenshot — this script
 * has no image to upload; add one via Edit after seeding if you want to
 * see the screenshot UI). Businesses are the two fixed board columns —
 * see @print-queue/shared's `businesses`.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *   ADMIN_USER_ID=<uuid> ADMIN_EMAIL=tyler@printqueue.local \
 *   OPERATOR_USER_ID=<uuid> OPERATOR_EMAIL=harper@printqueue.local \
 *   pnpm exec tsx scripts/seed.ts
 */
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const secretKey = requireEnv('SUPABASE_SECRET_KEY');
  const adminUserId = requireEnv('ADMIN_USER_ID');
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const operatorUserId = requireEnv('OPERATOR_USER_ID');
  const operatorEmail = requireEnv('OPERATOR_EMAIL');

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Plain Node script (not bundled through Next.js) — needs an explicit
    // WebSocket implementation on Node <22. See apps/bridge/src/lib/supabase.ts.
    realtime: { transport: WebSocket as unknown as never },
  });

  console.log('Upserting app_users…');
  const { error: usersError } = await supabase.from('app_users').upsert([
    { id: adminUserId, email: adminEmail, display_name: 'Tyler', role: 'admin', active: true },
    {
      id: operatorUserId,
      email: operatorEmail,
      display_name: 'Harper',
      role: 'operator',
      active: true,
    },
  ]);
  if (usersError) throw usersError;

  console.log('Creating sample board jobs…');
  const sampleJobs = [
    {
      id: '00000000-0000-0000-0000-000000000201',
      name: 'Dragon Sign',
      business: '3d_sports_displays' as const,
      colors: 'Orange PLA, Blue PLA, Black PLA, White PLA',
      estimated_duration_seconds: 3 * 60 * 60 + 24 * 60,
      notes: 'Front door sign — customer pickup Friday',
    },
    {
      id: '00000000-0000-0000-0000-000000000202',
      name: 'Cable Clips (x10)',
      business: '3d_sports_displays' as const,
      colors: 'Black PETG',
      estimated_duration_seconds: 55 * 60,
      notes: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000203',
      name: 'Trophy Base',
      business: 'dougie_doug' as const,
      colors: 'Gold PLA',
      estimated_duration_seconds: 2 * 60 * 60,
      notes: null,
    },
  ];

  for (const [index, job] of sampleJobs.entries()) {
    const { error: jobError } = await supabase.from('print_jobs').upsert({
      id: job.id,
      name: job.name,
      business: job.business,
      board_status: 'queued',
      screenshot_path: null,
      colors: job.colors,
      queue_position: index + 1,
      status: 'uploaded',
      estimated_duration_seconds: job.estimated_duration_seconds,
      notes: job.notes,
      created_by: adminUserId,
      printer_id: null,
    });
    if (jobError) throw jobError;
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
