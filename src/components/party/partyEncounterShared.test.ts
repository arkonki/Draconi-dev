import { describe, expect, it } from 'vitest';
import type { EncounterCombatant } from '../../types/encounter';
import {
  formatGearFeatures,
  generateDeck,
  getDefaultMonsterAttack,
  getEquippedArmorValue,
  getMonsterDamageBonusLabel,
  getMonsterSkillDisplay,
  getSiblings,
  hasRollableMonsterAttacks,
  matchesMonsterAttackRoll,
  parseBaseWeaponSkillName,
  parseMonsterDamageBonus,
  parseNumericValue,
  type MonsterData,
  type MonsterGearItem,
} from './partyEncounterShared';

const combatant = (id: string, name: string, monsterId: string | null) =>
  ({ id, display_name: name, monster_id: monsterId }) as unknown as EncounterCombatant;

describe('monster attack tables', () => {
  it('matches single values, lists and ranges, in either order', () => {
    expect(matchesMonsterAttackRoll('3', 3)).toBe(true);
    expect(matchesMonsterAttackRoll('1, 4, 6', 4)).toBe(true);
    expect(matchesMonsterAttackRoll('1-3', 2)).toBe(true);
    expect(matchesMonsterAttackRoll('3-1', 2)).toBe(true);
    expect(matchesMonsterAttackRoll('1-2, 5-6', 6)).toBe(true);
    expect(matchesMonsterAttackRoll('1-2, 5-6', 3)).toBe(false);
  });

  it('matches nothing when the entry is empty or not a number', () => {
    expect(matchesMonsterAttackRoll(undefined, 1)).toBe(false);
    expect(matchesMonsterAttackRoll('  ', 1)).toBe(false);
    expect(matchesMonsterAttackRoll('a-b', 1)).toBe(false);
    expect(matchesMonsterAttackRoll('1,,', 2)).toBe(false);
  });

  it('tells an attack that is rolled for from the one a monster always has', () => {
    const always = { name: 'Bite', effects: [], description: '', roll_values: '' };
    const rolled = { name: 'Tail', effects: [], description: '', roll_values: '1-3' };
    const monster = { id: 'm', name: 'Wyrm', attacks: [rolled, always] } as unknown as MonsterData;
    expect(hasRollableMonsterAttacks(monster)).toBe(true);
    expect(getDefaultMonsterAttack(monster)).toBe(always);
    expect(hasRollableMonsterAttacks({ id: 'm', name: 'Rat', attacks: [always] } as unknown as MonsterData)).toBe(false);
    expect(getDefaultMonsterAttack({ id: 'm', name: 'Rat', attacks: [] } as unknown as MonsterData)).toBeNull();
    expect(getDefaultMonsterAttack(undefined)).toBeNull();
  });
});

describe('initiative deck', () => {
  it('deals each card of a ten-card deck once', () => {
    expect([...generateDeck(10, [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('leaves out the cards already drawn by hand', () => {
    const deck = generateDeck(4, [1, 10]);
    expect(deck).toHaveLength(8);
    expect(deck).not.toContain(1);
    expect(deck).not.toContain(10);
  });

  it('adds a second deck when more than ten cards are needed', () => {
    const deck = generateDeck(11, []);
    expect(deck).toHaveLength(20);
    expect(deck.filter((card) => card === 7)).toHaveLength(2);
  });
});

describe('monsters that act more than once', () => {
  it('groups the entries of one monster, whatever their action number', () => {
    const all = [
      combatant('a', 'Troll', 'troll'),
      combatant('b', 'Troll (Act 2)', 'troll'),
      combatant('c', 'Troll B', 'troll'),
      combatant('d', 'Hero', null),
    ];
    expect(getSiblings(all[1], all).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('treats a character as its own group', () => {
    const hero = combatant('d', 'Hero', null);
    expect(getSiblings(hero, [hero, combatant('a', 'Hero', 'troll')])).toEqual([hero]);
  });
});

describe('monster stats', () => {
  it('reads a damage bonus from the structured field or the older text', () => {
    expect(parseMonsterDamageBonus({ DAMAGE_BONUS_CONFIG: { attribute: 'STR', die: 'D6' } } as never)).toEqual({ attribute: 'STR', die: 'd6' });
    expect(parseMonsterDamageBonus({ DAMAGE_BONUS: 'agl + d4' })).toEqual({ attribute: 'AGL', die: 'd4' });
    expect(parseMonsterDamageBonus({ DAMAGE_BONUS: 'a lot' })).toBeNull();
    expect(parseMonsterDamageBonus(undefined)).toBeNull();
    expect(getMonsterDamageBonusLabel({ DAMAGE_BONUS_CONFIG: { attribute: 'STR', die: 'd6' } } as never)).toBe('STR +D6');
    expect(getMonsterDamageBonusLabel({ DAMAGE_BONUS: ' STR+D4 ' })).toBe('STR+D4');
    expect(getMonsterDamageBonusLabel({})).toBeNull();
  });

  it('lists skills from structured entries before the older text', () => {
    expect(getMonsterSkillDisplay({ SKILL_ENTRIES: [{ name: 'Swords', level: 12 }], SKILLS: 'ignored' } as never)).toEqual(['Swords 12']);
    expect(getMonsterSkillDisplay({ SKILLS: ' Awareness 10 ' })).toEqual(['Awareness 10']);
    expect(getMonsterSkillDisplay(undefined)).toEqual([]);
  });

  it('adds up worn armour and falls back to the natural armour value', () => {
    const gear = [
      { name: 'Leather', armor_rating: 1 },
      { name: 'Shield', armor_rating: '2', quantity: 2 },
      { name: 'Sword' },
    ] as unknown as MonsterGearItem[];
    expect(getEquippedArmorValue(gear, { ARMOR: 9 })).toBe(5);
    expect(getEquippedArmorValue([], { ARMOR: 3 })).toBe(3);
    expect(getEquippedArmorValue(undefined, undefined)).toBe(0);
  });

  it('reads numbers leniently and names skills without their attribute', () => {
    expect(parseNumericValue(4)).toBe(4);
    expect(parseNumericValue('7 points')).toBe(7);
    expect(parseNumericValue('none')).toBe(0);
    expect(parseNumericValue(Number.NaN)).toBe(0);
    expect(parseNumericValue(undefined)).toBe(0);
    expect(parseBaseWeaponSkillName('Swords (STR)')).toBe('Swords');
    expect(parseBaseWeaponSkillName(null)).toBeNull();
    expect(formatGearFeatures(['Long', 'Piercing'])).toBe('Long, Piercing');
    expect(formatGearFeatures('Subtle')).toBe('Subtle');
    expect(formatGearFeatures(undefined)).toBe('');
  });
});
