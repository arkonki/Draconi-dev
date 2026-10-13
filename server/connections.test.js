// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseTokenRequest } from './connections.js';

describe('parseTokenRequest', () => {
  it('accepts a named read-only token and defaults to 90 days', () => {
    expect(parseTokenRequest({ name: '  Claude Desktop ', access: 'read' })).toEqual({
      name: 'Claude Desktop', access: 'read', days: 90, scope: ['draconi:read'],
    });
  });

  it('gives write access both scopes', () => {
    expect(parseTokenRequest({ name: 'GM helper', access: 'write', days: 30 })).toMatchObject({
      access: 'write', days: 30, scope: ['draconi:read', 'draconi:write'],
    });
  });

  it('refuses a missing or oversized name', () => {
    expect(() => parseTokenRequest({ name: '   ', access: 'read' })).toThrow(/name/);
    expect(() => parseTokenRequest({ name: 'x'.repeat(61), access: 'read' })).toThrow(/name/);
    expect(() => parseTokenRequest({ access: 'read' })).toThrow(/name/);
  });

  it('never guesses the access level', () => {
    expect(() => parseTokenRequest({ name: 'a' })).toThrow(/access/);
    expect(() => parseTokenRequest({ name: 'a', access: 'admin' })).toThrow(/access/);
  });

  it('only offers the fixed lifetimes, so no token is forever', () => {
    expect(() => parseTokenRequest({ name: 'a', access: 'read', days: 3650 })).toThrow(/days/);
    expect(() => parseTokenRequest({ name: 'a', access: 'read', days: 0 })).toThrow(/days/);
    expect(parseTokenRequest({ name: 'a', access: 'read', days: 365 }).days).toBe(365);
  });
});
