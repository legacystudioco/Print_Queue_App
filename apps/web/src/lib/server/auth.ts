import 'server-only';
import type { AppUser, UserRole } from '@print-queue/shared';
import { createSupabaseServerClient } from '../supabase/server';

export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in to do that.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Resolves the current session's app_users row. Returns null if there is
 * no session, the row is missing, or the account has been deactivated —
 * callers should treat all three identically (unauthenticated).
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('id, email, display_name, role, active')
    .eq('id', user.id)
    .single();

  if (error || !appUser || !appUser.active) return null;

  return {
    id: appUser.id,
    email: appUser.email,
    displayName: appUser.display_name,
    role: appUser.role,
    active: appUser.active,
  };
}

/** Throws UnauthorizedError if there is no active, signed-in app user. */
export async function requireAppUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws UnauthorizedError / ForbiddenError as appropriate. */
export async function requireRole(...roles: UserRole[]): Promise<AppUser> {
  const user = await requireAppUser();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`This action requires one of: ${roles.join(', ')}.`);
  }
  return user;
}
