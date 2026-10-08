import { beforeEach, describe, expect, it } from 'vitest';
import { assertLoginAllowed, clearLoginFailures, clientAddress, recordLoginFailure, resetLoginRateLimit } from './loginRateLimit.js';

const request = (forwarded) => ({ headers: forwarded ? { 'x-forwarded-for': forwarded } : {}, socket: { remoteAddress: '10.0.0.9' } });

describe('login rate limit', () => {
  beforeEach(resetLoginRateLimit);

  it('blocks an account after repeated failures, regardless of address', () => {
    for (let i = 0; i < 10; i += 1) recordLoginFailure(request(`1.1.1.${i}`), 'Victim@Example.com');
    expect(() => assertLoginAllowed(request('9.9.9.9'), 'victim@example.com')).toThrowError(/Too many/);
    expect(() => assertLoginAllowed(request('9.9.9.9'), 'other@example.com')).not.toThrow();
  });

  it('blocks an address that sprays many accounts', () => {
    for (let i = 0; i < 30; i += 1) recordLoginFailure(request('2.2.2.2'), `user${i}@example.com`);
    expect(() => assertLoginAllowed(request('2.2.2.2'), 'fresh@example.com')).toThrowError(/Too many/);
  });

  it('reports retry-after and expires after the window', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i += 1) recordLoginFailure(request('3.3.3.3'), 'a@example.com', now);
    let caught;
    try { assertLoginAllowed(request('3.3.3.3'), 'a@example.com', now + 1000); } catch (e) { caught = e; }
    expect(caught.status).toBe(429);
    expect(Number(caught.headers['retry-after'])).toBeGreaterThan(0);
    expect(() => assertLoginAllowed(request('3.3.3.3'), 'a@example.com', now + 16 * 60_000)).not.toThrow();
  });

  it('clears the account counter after a successful sign-in', () => {
    for (let i = 0; i < 9; i += 1) recordLoginFailure(request('4.4.4.4'), 'b@example.com');
    clearLoginFailures(request('4.4.4.4'), 'b@example.com');
    recordLoginFailure(request('4.4.4.4'), 'b@example.com');
    expect(() => assertLoginAllowed(request('4.4.4.4'), 'b@example.com')).not.toThrow();
  });

  it('uses the proxy-appended (right-most) forwarded address, not a client-supplied one', () => {
    expect(clientAddress(request('6.6.6.6, 5.5.5.5'))).toBe('5.5.5.5');
    expect(clientAddress(request())).toBe('10.0.0.9');
  });
});
