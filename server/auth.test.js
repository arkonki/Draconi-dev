import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, resolveSignUpRole, verifyPassword, maxUsers, registrationPlaces } from './auth.js';

describe('password verification', () => {
  it('verifies native scrypt hashes', async () => {
    const encoded = await hashPassword('local-password');
    expect(encoded).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword('local-password', encoded)).toBe(true);
    expect(await verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('verifies migrated Supabase bcrypt hashes', async () => {
    const encoded = bcrypt.hashSync('restored-password', 10);
    expect(await verifyPassword('restored-password', encoded)).toBe(true);
    expect(await verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('rejects malformed legacy hashes', async () => {
    expect(await verifyPassword('anything', '$2a$not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$abcd$')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('refuses to hash a password that is too short', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters');
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

describe('account limit', () => {
  const clientWith = (count) => ({ query: async () => ({ rows: [{ n: count }] }) });
  const withLimit = async (value, run) => {
    const before = process.env.MAX_USERS;
    if (value === undefined) delete process.env.MAX_USERS; else process.env.MAX_USERS = value;
    try { return await run(); } finally {
      if (before === undefined) delete process.env.MAX_USERS; else process.env.MAX_USERS = before;
    }
  };

  it('defaults to 50 accounts and treats 0 as no limit', () => {
    expect(maxUsers({})).toBe(50);
    expect(maxUsers({ MAX_USERS: '120' })).toBe(120);
    expect(maxUsers({ MAX_USERS: '0' })).toBe(0);
    expect(maxUsers({ MAX_USERS: 'lots' })).toBe(50);
  });

  it('closes sign-up once the site has that many accounts', async () => {
    await withLimit(undefined, async () => {
      expect(await registrationPlaces(clientWith(49))).toEqual({ limit: 50, full: false });
      expect(await registrationPlaces(clientWith(50))).toEqual({ limit: 50, full: true });
    });
    await withLimit('0', async () => {
      expect(await registrationPlaces(clientWith(5000))).toEqual({ limit: null, full: false });
    });
  });
});
