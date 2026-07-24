import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';

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
