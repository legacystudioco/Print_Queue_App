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
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   ADMIN_USER_ID=<uuid> ADMIN_EMAIL=you@example.com \
 *   OPERATOR_USER_ID=<uuid> OPERATOR_EMAIL=kid@example.com \
 *   pnpm exec tsx scripts/seed.ts
 */
import { createClient } from '@supabase/supabase-js';

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
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const adminUserId = requireEnv('ADMIN_USER_ID');
  const adminEmail = requireEnv('ADMIN_EMAIL');
  const operatorUserId = requireEnv('OPERATOR_USER_ID');
  const operatorEmail = requireEnv('OPERATOR_EMAIL');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Upserting app_users…');
  const { error: usersError } = await supabase.from('app_users').upsert([
    { id: adminUserId, email: adminEmail, display_name: 'Admin', role: 'admin', active: true },
    {
      id: operatorUserId,
      email: operatorEmail,
      display_name: 'Operator',
      role: 'operator',
      active: true,
    },
  ]);
  if (usersError) throw usersError;

  console.log('Upserting printer…');
  const printerId = '00000000-0000-0000-0000-000000000001';
  const { error: printerError } = await supabase.from('printers').upsert({
    id: printerId,
    name: 'Workshop P1S',
    model: 'Bambu Lab P1S',
    bridge_id: 'home-bridge-1',
    status: 'unknown',
  });
  if (printerError) throw printerError;

  console.log('Creating sample queued jobs…');
  const sampleJobs = [
    {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Dragon Sign',
      original_filename: 'dragon_sign.gcode.3mf',
      storage_path: `${printerId}/00000000-0000-0000-0000-000000000101/dragon_sign.gcode.3mf`,
      file_size_bytes: 42_000_000,
      estimated_duration_seconds: 3 * 60 * 60 + 24 * 60,
      notes: 'Front door sign — customer pickup Friday',
      slots: [
        { slot_number: 1, is_used: true, color_name: 'Orange', material_name: 'PLA' },
        { slot_number: 2, is_used: true, color_name: 'Blue', material_name: 'PLA' },
        { slot_number: 3, is_used: true, color_name: 'Black', material_name: 'PLA' },
        { slot_number: 4, is_used: true, color_name: 'White', material_name: 'PLA' },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Cable Clips (x10)',
      original_filename: 'cable_clips_x10.gcode.3mf',
      storage_path: `${printerId}/00000000-0000-0000-0000-000000000102/cable_clips_x10.gcode.3mf`,
      file_size_bytes: 8_500_000,
      estimated_duration_seconds: 55 * 60,
      notes: null,
      slots: [
        { slot_number: 1, is_used: true, color_name: 'Black', material_name: 'PETG' },
        { slot_number: 2, is_used: false, color_name: null, material_name: null },
        { slot_number: 3, is_used: false, color_name: null, material_name: null },
        { slot_number: 4, is_used: false, color_name: null, material_name: null },
      ],
    },
  ];

  for (const [index, job] of sampleJobs.entries()) {
    const { slots, ...jobRow } = job;
    const { error: jobError } = await supabase.from('print_jobs').upsert({
      ...jobRow,
      printer_id: printerId,
      queue_position: index + 1,
      status: 'queued',
      created_by: adminUserId,
    });
    if (jobError) throw jobError;

    const { error: slotsError } = await supabase
      .from('job_ams_slots')
      .upsert(slots.map((slot) => ({ ...slot, job_id: job.id })), {
        onConflict: 'job_id,slot_number',
      });
    if (slotsError) throw slotsError;
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
