export type MonsterAttackTableDie = 'd4' | 'd6' | 'd8';

interface AttackTableRowLike {
  roll_values?: string | null;
}

const getMaxRollValueFromSegment = (segment: string): number | null => {
  const normalized = segment.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('-')) {
    const [startRaw, endRaw] = normalized.split('-');
    const start = Number.parseInt(startRaw, 10);
    const end = Number.parseInt(endRaw, 10);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      return null;
    }

    return Math.max(start, end);
  }

  const value = Number.parseInt(normalized, 10);
  return Number.isNaN(value) ? null : value;
};

const getMaxRollValueFromRow = (rollValues: string | null | undefined): number | null => {
  if (typeof rollValues !== 'string') {
    return null;
  }

  let maxRollValue: number | null = null;

  for (const segment of rollValues.split(',')) {
    const candidate = getMaxRollValueFromSegment(segment);
    if (candidate == null) {
      continue;
    }
    maxRollValue = maxRollValue == null ? candidate : Math.max(maxRollValue, candidate);
  }

  return maxRollValue;
};

export function inferMonsterAttackTableDie(attacks: AttackTableRowLike[] | null | undefined): MonsterAttackTableDie {
  let maxRollValue: number | null = null;

  for (const attack of attacks || []) {
    const candidate = getMaxRollValueFromRow(attack.roll_values);
    if (candidate == null) {
      continue;
    }
    maxRollValue = maxRollValue == null ? candidate : Math.max(maxRollValue, candidate);
  }

  if (maxRollValue == null) {
    return 'd6';
  }

  if (maxRollValue <= 4) {
    return 'd4';
  }

  if (maxRollValue <= 6) {
    return 'd6';
  }

  return 'd8';
}

export function rollMonsterAttackTable(
  attacks: AttackTableRowLike[] | null | undefined,
  rng: () => number = Math.random
) {
  const die = inferMonsterAttackTableDie(attacks);
  const sides = Number.parseInt(die.slice(1), 10);
  const roll = Math.floor(rng() * sides) + 1;

  return { die, roll };
}
