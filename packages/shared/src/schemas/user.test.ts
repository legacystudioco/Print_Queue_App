import { describe, expect, it } from 'vitest';
import { usernameLoginSchema } from './user';

describe('usernameLoginSchema', () => {
  it('accepts a username and password', () => {
    const result = usernameLoginSchema.safeParse({ username: 'Tyler', password: 'hunter2' });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from the username', () => {
    const result = usernameLoginSchema.safeParse({ username: '  Tyler  ', password: 'hunter2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('Tyler');
    }
  });

  it('rejects an empty username', () => {
    expect(usernameLoginSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(usernameLoginSchema.safeParse({ username: '   ', password: 'x' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(usernameLoginSchema.safeParse({ username: 'Tyler', password: '' }).success).toBe(false);
  });

  it('rejects a username over 32 characters', () => {
    const result = usernameLoginSchema.safeParse({
      username: 'a'.repeat(33),
      password: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('does not require an email shape (this is not the old email schema)', () => {
    // A plain username with no "@" must be valid — this is the whole point.
    const result = usernameLoginSchema.safeParse({ username: 'harper', password: 'x' });
    expect(result.success).toBe(true);
  });
});
