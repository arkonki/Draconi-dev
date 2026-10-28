// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { assertRegionAccess, assertSignUpRegion, createRegionLookup, isPrivateAddress, regionStatus } from './regionGuard.js';

const lookup = createRegionLookup({
  countries: ['EE'],
  // 193.40.0.0–193.40.255.255 and 2001:db8::/32 stand in for an allowed country.
  ipv4: [[3240624128, 3240689663]],
  ipv6: [['20010db8000000000000000000000000', '20010db8ffffffffffffffffffffffff']],
});
const from = (address) => ({ headers: { 'x-forwarded-for': address }, socket: {} });

describe('region lookup', () => {
  it('allows addresses in the listed ranges and nothing else', () => {
    expect(lookup.isAllowed('193.40.5.1')).toBe(true);
    expect(lookup.isAllowed('193.41.0.1')).toBe(false);
    expect(lookup.isAllowed('2001:db8::1')).toBe(true);
    expect(lookup.isAllowed('2001:db9::1')).toBe(false);
    expect(lookup.isAllowed('::ffff:193.40.5.1')).toBe(true);
    expect(lookup.isAllowed('not an address')).toBe(false);
  });

  it('treats the server itself, private networks and development as allowed', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.0.9', '::1', 'fd00::5', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
  });
});

describe('region rules on the real list', () => {
  afterEach(() => { delete process.env.REGION_LIMIT; });

  it('keeps visitors without a session from outside the countries off the API', () => {
    expect(() => assertRegionAccess(from('8.8.8.8'), '/api/data/query', false)).toThrow('This site is available in Estonia, Finland, Latvia, Lithuania and Sweden');
    expect(() => assertRegionAccess(from('193.166.3.1'), '/api/data/query', false)).not.toThrow();
  });

  it('lets anyone sign in, use a session, open public images and load the page', () => {
    expect(() => assertRegionAccess(from('8.8.8.8'), '/api/auth/sign-in', false)).not.toThrow();
    expect(() => assertRegionAccess(from('8.8.8.8'), '/api/data/query', true)).not.toThrow();
    expect(() => assertRegionAccess(from('8.8.8.8'), '/api/storage/public/images/a.webp', false)).not.toThrow();
    expect(() => assertRegionAccess(from('8.8.8.8'), '/party/1', false)).not.toThrow();
  });

  it('allows sign-ups only from the countries, and says where they are', () => {
    expect(() => assertSignUpRegion(from('8.8.8.8'))).toThrow('New accounts can only be created in');
    expect(() => assertSignUpRegion(from('130.237.28.40'))).not.toThrow();
    expect(regionStatus(from('8.8.8.8'))).toMatchObject({ limited: true, allowed: false });
    expect(regionStatus(from('8.8.8.8')).countries.map((country) => country.code)).toEqual(['EE', 'FI', 'LV', 'LT', 'SE']);
  });

  it('can be switched off', () => {
    process.env.REGION_LIMIT = 'off';
    expect(regionStatus(from('8.8.8.8'))).toEqual({ limited: false, allowed: true, countries: [] });
    expect(() => assertSignUpRegion(from('8.8.8.8'))).not.toThrow();
  });
});
