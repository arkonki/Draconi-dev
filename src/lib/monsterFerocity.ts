export const MONSTER_FEROCITY_PC_COUNT_MINUS_ONE = 'No. of PCs−1 (min. 1)';

const normalizeDynamicFerocityLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

export function isPcCountMinusOneFerocity(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = normalizeDynamicFerocityLabel(value);
  return normalized === normalizeDynamicFerocityLabel(MONSTER_FEROCITY_PC_COUNT_MINUS_ONE);
}

export function coerceFixedMonsterFerocity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }

  return 1;
}

export function resolveMonsterFerocity(value: unknown, pcCount: number): number {
  if (isPcCountMinusOneFerocity(value)) {
    return Math.max(1, Math.floor(pcCount) - 1);
  }

  return coerceFixedMonsterFerocity(value);
}
