export type ItemRangeValue = string | number | null | undefined;

type StrengthRangeExpression = {
  multiplier: number;
  label: string;
};

const parseStrengthRangeExpression = (range: ItemRangeValue): StrengthRangeExpression | null => {
  if (typeof range !== 'string') return null;

  const match = range.trim().match(/^STR(?:\s*(?:x|\*|×)\s*((?:\d+(?:\.\d*)?)|(?:\.\d+)))?$/i);
  if (!match) return null;

  const multiplier = match[1] === undefined ? 1 : Number(match[1]);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;

  return {
    multiplier,
    label: multiplier === 1 ? 'STR' : `STR×${multiplier}`,
  };
};

export function isStrengthBasedItemRange(range: ItemRangeValue): boolean {
  return parseStrengthRangeExpression(range) !== null;
}

const toFiniteStrength = (strength: unknown): number | null => {
  if (typeof strength === 'number') return Number.isFinite(strength) ? strength : null;
  if (typeof strength !== 'string' || strength.trim() === '') return null;

  const parsed = Number(strength);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Resolves symbolic item ranges such as `STR` and `STRx2` against the
 * attacking character.
 * The stored item value stays symbolic so later Strength changes take effect.
 */
export function resolveItemAttackRange(
  range: ItemRangeValue,
  characterStrength: unknown,
): string | number | null {
  if (range === null || range === undefined) return null;

  const strengthExpression = parseStrengthRangeExpression(range);
  if (strengthExpression) {
    const strength = toFiniteStrength(characterStrength);
    return strength === null
      ? strengthExpression.label
      : strength * strengthExpression.multiplier;
  }

  if (typeof range === 'string') {
    const trimmed = range.trim();
    return trimmed || null;
  }

  return Number.isFinite(range) ? range : null;
}

export function formatItemAttackRange(
  range: ItemRangeValue,
  characterStrength: unknown,
  fallback = '-',
): string {
  const resolvedRange = resolveItemAttackRange(range, characterStrength);
  if (resolvedRange === null) return fallback;

  const strengthExpression = parseStrengthRangeExpression(range);
  if (strengthExpression && typeof resolvedRange === 'number') {
    return `${resolvedRange} (${strengthExpression.label})`;
  }

  return String(resolvedRange);
}
