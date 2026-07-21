import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameToInternalEmail } from './username';

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  Tyler  ')).toBe('tyler');
    expect(normalizeUsername('HARPER')).toBe('harper');
  });
});

describe('usernameToInternalEmail', () => {
  it('maps the two household usernames to their internal addresses', () => {
    expect(usernameToInternalEmail('Tyler')).toBe('tyler@printqueue.local');
    expect(usernameToInternalEmail('Harper')).toBe('harper@printqueue.local');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(usernameToInternalEmail('  TYLER  ')).toBe('tyler@printqueue.local');
    expect(usernameToInternalEmail('hArPeR')).toBe('harper@printqueue.local');
  });

  it('rejects empty input', () => {
    expect(usernameToInternalEmail('')).toBeNull();
    expect(usernameToInternalEmail('   ')).toBeNull();
  });

  it('rejects usernames over 32 characters', () => {
    expect(usernameToInternalEmail('a'.repeat(33))).toBeNull();
  });

  it('rejects characters outside [a-z0-9_-]', () => {
    expect(usernameToInternalEmail('tyler@evil.com')).toBeNull();
    expect(usernameToInternalEmail('tyler smith')).toBeNull();
    expect(usernameToInternalEmail('tyler.smith')).toBeNull();
    expect(usernameToInternalEmail("tyler'; drop table app_users;--")).toBeNull();
  });

  it('accepts underscores and hyphens', () => {
    expect(usernameToInternalEmail('print_queue-admin')).toBe('print_queue-admin@printqueue.local');
  });
});
