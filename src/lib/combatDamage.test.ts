import { describe, expect, it } from 'vitest';
import { playerArmorRating, resolveDamage, resolveHp } from './combatDamage';

describe('resolveDamage', () => {
  it('lets armor stop damage up to its rating', () => {
    expect(resolveDamage({ raw: 7, armor: 3 })).toEqual({ dealt: 4, healing: 0, absorbed: 3 });
    expect(resolveDamage({ raw: 2, armor: 3 })).toEqual({ dealt: 0, healing: 0, absorbed: 2 });
  });

  it('ignores armor when the attack pierces it', () => {
    expect(resolveDamage({ raw: 7, armor: 3, ignoreArmor: true })).toEqual({ dealt: 7, healing: 0, absorbed: 0 });
  });

  it('stops everything on a parry', () => {
    expect(resolveDamage({ raw: 9, armor: 0, parried: true })).toEqual({ dealt: 0, healing: 0, absorbed: 0 });
  });

  it('treats a negative number as healing, untouched by armor or parry', () => {
    expect(resolveDamage({ raw: -4, armor: 3, parried: true })).toEqual({ dealt: 0, healing: 4, absorbed: 0 });
  });
});

describe('resolveHp', () => {
  const hit = (dealt: number) => ({ dealt, healing: 0, absorbed: 0 });

  it('floors hit points at zero and marks a player as dying', () => {
    expect(resolveHp(5, 12, hit(8), true)).toEqual({ hpAfter: 0, dying: true, instantDeath: false });
    expect(resolveHp(5, 12, hit(8), false)).toEqual({ hpAfter: 0, dying: false, instantDeath: false });
  });

  it('kills a player outright only when the overkill exceeds their maximum HP', () => {
    expect(resolveHp(3, 10, hit(13), true)).toEqual({ hpAfter: 0, dying: true, instantDeath: false });
    expect(resolveHp(3, 10, hit(14), true)).toEqual({ hpAfter: 0, dying: true, instantDeath: true });
    expect(resolveHp(3, 10, hit(14), false).instantDeath).toBe(false);
  });

  it('never heals above the maximum', () => {
    expect(resolveHp(8, 10, { dealt: 0, healing: 6, absorbed: 0 }, true).hpAfter).toBe(10);
  });
});

describe('playerArmorRating', () => {
  const items = [
    { name: 'Chainmail', armor_rating: 4 },
    { name: 'Iron Helmet', armor_rating: '2' },
    { name: 'Sword', armor_rating: undefined },
  ];

  it('adds body armor and helmet, matching names loosely', () => {
    expect(playerArmorRating({ equipped: { armor: ' chainmail ', helmet: 'Iron Helmet' } }, items)).toEqual({ armor: 4, helmet: 2, total: 6 });
  });

  it('copes with nothing worn or unknown items', () => {
    expect(playerArmorRating({ equipped: {} }, items).total).toBe(0);
    expect(playerArmorRating(null, items).total).toBe(0);
    expect(playerArmorRating({ equipped: { armor: 'Cloak of Mystery' } }, items).total).toBe(0);
  });
});
