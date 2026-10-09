import { describe, expect, it } from 'vitest';
import {
  assertUserActionAllowed,
  assertUserQueryAllowed,
  assertUserUpdateAllowed,
  projectUserRow,
} from './userAccess.js';

const player = { user: { id: 'u1' }, admin: false };
const admin = { user: { id: 'a1' }, admin: true };

describe('user table access rules', () => {
  it('never lets role, status or email be changed through the generic endpoint', () => {
    for (const field of ['role', 'is_active', 'account_status', 'email', 'is_email_verified', 'created_at']) {
      expect(() => assertUserUpdateAllowed([field])).toThrowError(/administrator/);
    }
    expect(() => assertUserUpdateAllowed(['username', 'first_name', 'last_name', 'avatar_url', 'bio', 'last_login_at', 'updated_at', 'id'])).not.toThrow();
  });

  it('blocks creating or deleting accounts through the generic endpoint', () => {
    for (const action of ['insert', 'upsert', 'delete']) {
      expect(() => assertUserActionAllowed(action)).toThrowError(/administrator/);
    }
    expect(() => assertUserActionAllowed('select')).not.toThrow();
    expect(() => assertUserActionAllowed('update')).not.toThrow();
  });

  it('hides private columns of other accounts from non-admins', () => {
    const row = { id: 'u2', username: 'bob', first_name: 'B', last_name: null, avatar_url: null, email: 'b@x.test', role: 'admin', is_active: true, last_login_at: 'x' };
    expect(Object.keys(projectUserRow(row, player)).sort()).toEqual(['avatar_url', 'first_name', 'id', 'last_name', 'username']);
    expect(projectUserRow({ ...row, id: 'u1' }, player)).toHaveProperty('email');
    expect(projectUserRow(row, admin)).toHaveProperty('email');
  });

  it('stops non-admins probing private fields through filters and ordering', () => {
    expect(() => assertUserQueryAllowed({ filters: [{ operator: 'eq', column: 'email', value: 'a@b.test' }] }, player)).toThrowError(/email/);
    expect(() => assertUserQueryAllowed({ orders: [{ column: 'role' }] }, player)).toThrowError(/role/);
    expect(() => assertUserQueryAllowed({ filters: [{ operator: 'eq', column: 'last_login', value: 'x' }] }, player)).toThrowError(/last_login_at/);
    expect(() => assertUserQueryAllowed({ filters: [{ operator: 'eq', column: 'id', value: 'u1' }, { operator: 'in', column: 'username', value: ['a'] }] }, player)).not.toThrow();
    expect(() => assertUserQueryAllowed({ filters: [{ operator: 'eq', column: 'email', value: 'a@b.test' }] }, admin)).not.toThrow();
  });
});
