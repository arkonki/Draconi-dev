import type { GameItem } from '../types/character';

export interface DamageInput {
  /** Damage as rolled. A negative number is healing. */
  raw: number;
  armor: number;
  ignoreArmor?: boolean;
  parried?: boolean;
}

export interface DamageResult {
  /** Hit points actually lost (never negative). */
  dealt: number;
  /** Hit points restored (never negative). */
  healing: number;
  /** How much of the hit the armor stopped. */
  absorbed: number;
}

/** Armor stops damage up to its rating, a parry stops the whole hit, and healing ignores both. */
export function resolveDamage({ raw, armor, ignoreArmor = false, parried = false }: DamageInput): DamageResult {
  if (raw < 0) return { dealt: 0, healing: -raw, absorbed: 0 };
  if (parried) return { dealt: 0, healing: 0, absorbed: 0 };
  const absorbed = ignoreArmor ? 0 : Math.min(Math.max(0, armor), raw);
  return { dealt: raw - absorbed, healing: 0, absorbed };
}

export interface HpOutcome {
  hpAfter: number;
  /** A player character dropped to 0 and must start death rolls. */
  dying: boolean;
  /** Damage beyond the remaining HP plus maximum HP kills outright. */
  instantDeath: boolean;
}

export function resolveHp(currentHp: number, maxHp: number, result: DamageResult, isPlayer: boolean): HpOutcome {
  const hpAfter = Math.min(maxHp, Math.max(0, currentHp - result.dealt + result.healing));
  const dying = isPlayer && result.dealt > 0 && hpAfter === 0;
  const instantDeath = isPlayer && result.dealt > 0 && result.dealt - currentHp > maxHp;
  return { hpAfter, dying, instantDeath };
}

const normalise = (name: string | undefined | null) => String(name ?? '').trim().toLowerCase();

const numeric = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

interface WornGear {
  equipped?: { armor?: string; helmet?: string } | null;
}

/** Armor rating of the body armor and helmet a character wears. A GM can still adjust the number per hit. */
export function playerArmorRating(equipment: WornGear | null | undefined, items: Pick<GameItem, 'name' | 'armor_rating'>[]) {
  const byName = new Map(items.map((item) => [normalise(item.name), item]));
  const armor = numeric(byName.get(normalise(equipment?.equipped?.armor))?.armor_rating);
  const helmet = numeric(byName.get(normalise(equipment?.equipped?.helmet))?.armor_rating);
  return { armor, helmet, total: armor + helmet };
}
