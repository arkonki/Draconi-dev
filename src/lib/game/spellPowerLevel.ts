const POWER_LEVEL_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export function hasSpellPowerLevels(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return false;
  return POWER_LEVEL_ENABLED_VALUES.has(value.trim().toLocaleLowerCase());
}

