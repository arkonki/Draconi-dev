import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, resolveSignUpRole, verifyPassword } from './auth.js';

describe('password verification', () => {
  it('verifies native scrypt hashes', () => {
    const encoded = hashPassword('local-password');
    expect(verifyPassword('local-password', encoded)).toBe(true);
    expect(verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('verifies migrated Supabase bcrypt hashes', () => {
    const encoded = bcrypt.hashSync('restored-password', 10);
    expect(verifyPassword('restored-password', encoded)).toBe(true);
    expect(verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('rejects malformed legacy hashes', () => {
    expect(verifyPassword('anything', '$2a$not-a-valid-hash')).toBe(false);
  });
});

describe('account creation authorization', () => {
  it('blocks anonymous registration when public registration is disabled', () => {
    expect(() => resolveSignUpRole(null, 'player', false)).toThrowError(
      'Public registration is disabled',
    );
  });

  it('only permits administrators to create users while signed in', () => {
    expect(() => resolveSignUpRole({ role: 'player' }, 'player', false)).toThrowError(
      'Administrator access is required',
    );
    expect(() => resolveSignUpRole({ role: 'dm' }, 'player', false)).toThrowError(
      'Administrator access is required',
    );
  });

  it('allows administrators to choose the new account role', () => {
    expect(resolveSignUpRole({ role: 'admin' }, 'player', false)).toBe('player');
    expect(resolveSignUpRole({ role: 'admin' }, 'dm', false)).toBe('dm');
    expect(resolveSignUpRole({ role: 'admin' }, 'admin', false)).toBe('admin');
  });

  it('never grants a requested elevated role during public registration', () => {
    expect(resolveSignUpRole(null, 'admin', true)).toBe('player');
  });
});
