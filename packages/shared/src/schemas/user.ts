import { z } from 'zod';
import { userRoleSchema } from '../enums';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const appUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: userRoleSchema,
  active: z.boolean(),
});
export type AppUser = z.infer<typeof appUserSchema>;
