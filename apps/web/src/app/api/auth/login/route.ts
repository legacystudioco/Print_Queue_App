import { usernameLoginSchema } from '@print-queue/shared';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { normalizeUsername, usernameToInternalEmail } from '@/lib/server/username';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Every login failure — malformed input, unknown username, wrong password
 * — returns exactly this message. Never a distinct "no such user" error:
 * that would let someone probe for valid household usernames.
 */
const GENERIC_ERROR = 'Invalid username or password';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = usernameLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const normalizedUsername = normalizeUsername(parsed.data.username);

  const rate = checkRateLimit(`login:${normalizedUsername}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment and try again.' },
      { status: 429 },
    );
  }

  const email = usernameToInternalEmail(parsed.data.username);
  if (!email) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Sign in server-side so the internal email never reaches the browser —
  // only the username the person actually typed does.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });

  if (error) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
