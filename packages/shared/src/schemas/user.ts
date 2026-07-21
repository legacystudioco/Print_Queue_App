import { z } from 'zod';
import { userRoleSchema } from '../enums';

/**
 * Login is by household username, not email — there is no email UI
 * anywhere in this app. The username-to-internal-Supabase-email mapping
 * happens only in server code (apps/web/src/lib/server/username.ts),
 * never here, so it can't end up in a client bundle. This schema is just
 * request shape validation, shared between the login form and the server
 * route that handles it.
 */
export const usernameLoginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(32, 'Username is too long'),
  password: z.string().min(1, 'Password is required'),
});
export type UsernameLoginInput = z.infer<typeof usernameLoginSchema>;

export const appUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
});
export type AppUser = z.infer<typeof appUserSchema>;
