import { beforeEach, describe, expect, it } from 'vitest';
import { assertDataRateAllowed, dataRateLimit, resetDataRateLimit } from './requestRateLimit.js';

describe('data request rate limit', () => {
  beforeEach(() => resetDataRateLimit());

  it('lets a person make requests up to the limit and refuses the next one', () => {
    const user = { id: 'user-1' };
    for (let index = 0; index < 3; index += 1) assertDataRateAllowed(user, 1_000, 3);
    let refused;
    try {
      assertDataRateAllowed(user, 2_000, 3);
    } catch (error) {
      refused = error;
    }
    expect(refused).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(refused.headers['retry-after']).toBe('59');
  });

  it('counts each person separately and starts again after a minute', () => {
    assertDataRateAllowed({ id: 'user-1' }, 1_000, 1);
    expect(() => assertDataRateAllowed({ id: 'user-2' }, 1_000, 1)).not.toThrow();
    expect(() => assertDataRateAllowed({ id: 'user-1' }, 1_500, 1)).toThrow('Too many requests');
    expect(() => assertDataRateAllowed({ id: 'user-1' }, 61_001, 1)).not.toThrow();
  });

  it('can be turned off', () => {
    for (let index = 0; index < 50; index += 1) assertDataRateAllowed({ id: 'user-1' }, 1_000, 0);
  });

  it('reads the limit from the environment and rejects nonsense', () => {
    expect(dataRateLimit({})).toBe(1_200);
    expect(dataRateLimit({ DATA_RATE_LIMIT_PER_MINUTE: '0' })).toBe(0);
    expect(dataRateLimit({ DATA_RATE_LIMIT_PER_MINUTE: '300' })).toBe(300);
    expect(() => dataRateLimit({ DATA_RATE_LIMIT_PER_MINUTE: 'lots' })).toThrow('DATA_RATE_LIMIT_PER_MINUTE');
  });
});
