import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, lastAdminProblem, normalizeUserChanges } from './adminUsers.js';

describe('administrator user changes', () => {
  it('normalises editable fields', () => {
    expect(normalizeUserChanges({ email: '  Ada@Example.COM ', username: ' ada ', first_name: ' Ada ', last_name: '', role: 'dm', is_active: false })).toEqual({
      email: 'ada@example.com', username: 'ada', first_name: 'Ada', last_name: null, role: 'dm', is_active: false,
    });
  });

  it('rejects invalid values', () => {
    expect(() => normalizeUserChanges({ email: 'nope' })).toThrowError(/Email/);
    expect(() => normalizeUserChanges({ username: 'ab' })).toThrowError(/Username/);
    expect(() => normalizeUserChanges({ role: 'owner' })).toThrowError(/Role/);
    expect(() => normalizeUserChanges({ is_active: 'no' })).toThrowError(/true or false/);
  });

  it('ignores fields it does not manage', () => {
    expect(normalizeUserChanges({ password_hash: 'x', id: 'y', created_at: 'z' })).toEqual({});
  });

  it('protects the last active administrator', () => {
    const admin = { role: 'admin', is_active: true };
    expect(lastAdminProblem(admin, { role: 'player' }, 0)).toBe(true);
    expect(lastAdminProblem(admin, { is_active: false }, 0)).toBe(true);
    expect(lastAdminProblem(admin, { role: 'player' }, 1)).toBe(false);
    expect(lastAdminProblem(admin, { first_name: 'x' }, 0)).toBe(false);
    expect(lastAdminProblem({ role: 'player', is_active: true }, { is_active: false }, 0)).toBe(false);
    expect(lastAdminProblem({ role: 'admin', is_active: false }, { is_active: false }, 0)).toBe(false);
  });

  it('generates strong, distinct temporary passwords', () => {
    const a = generateTemporaryPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(generateTemporaryPassword()).not.toBe(a);
  });
});
