import { describe, expect, it } from 'vitest';
import { hasSpellPowerLevels } from './spellPowerLevel';

describe('hasSpellPowerLevels', () => {
  it.each(['yes', 'YES', '1', 'true', 'on', 'enabled', true, 1])('accepts enabled value %s', (value) => {
    expect(hasSpellPowerLevels(value)).toBe(true);
  });

  it.each(['none', 'no', '0', 'false', '', false, 0, null, undefined])('rejects disabled value %s', (value) => {
    expect(hasSpellPowerLevels(value)).toBe(false);
  });
});
