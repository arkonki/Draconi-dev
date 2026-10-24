import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkSignup, resetSignupGuard } from './signupGuard.js';

const from = (address) => ({ headers: { 'x-forwarded-for': address } });

describe('sign-up guard', () => {
  beforeEach(resetSignupGuard);
  afterEach(() => { delete process.env.SIGNUP_MAX_PER_DAY; delete process.env.SIGNUP_MAX_PER_IP_HOUR; });

  it('answers bots that fill the hidden field without counting them as people', () => {
    expect(checkSignup(from('1.1.1.1'), { website: 'http://spam.example' })).toBe('bot');
    expect(checkSignup(from('1.1.1.1'), { options: { data: { website: 'x' } } })).toBe('bot');
    expect(checkSignup(from('1.1.1.1'), { website: '  ' })).toBe('ok');
  });

  it('allows a few attempts per address per hour, then refuses with a retry time', () => {
    for (let index = 0; index < 5; index += 1) expect(checkSignup(from('2.2.2.2'), {}, 1_000)).toBe('ok');
    expect(() => checkSignup(from('2.2.2.2'), {}, 2_000)).toThrow(expect.objectContaining({ status: 429, code: 'RATE_LIMITED' }));
    expect(checkSignup(from('3.3.3.3'), {}, 2_000)).toBe('ok');
    expect(checkSignup(from('2.2.2.2'), {}, 1_000 + 3_600_001)).toBe('ok');
  });

  it('pauses all registrations when the daily ceiling is reached, however many addresses are used', () => {
    process.env.SIGNUP_MAX_PER_DAY = '3';
    for (const address of ['4.4.4.1', '4.4.4.2', '4.4.4.3']) checkSignup(from(address), {}, 1_000);
    expect(() => checkSignup(from('4.4.4.4'), {}, 2_000)).toThrow(expect.objectContaining({ status: 503, code: 'SIGNUPS_PAUSED' }));
    expect(checkSignup(from('4.4.4.4'), {}, 1_000 + 86_400_001)).toBe('ok');
  });

  it('can be switched off with 0', () => {
    process.env.SIGNUP_MAX_PER_IP_HOUR = '0';
    process.env.SIGNUP_MAX_PER_DAY = '0';
    for (let index = 0; index < 50; index += 1) expect(checkSignup(from('5.5.5.5'), {}, 1_000)).toBe('ok');
  });
});
