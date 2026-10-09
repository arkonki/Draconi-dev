import { describe, expect, it } from 'vitest';
import { buildCombatSummary, type SummaryCombatant, type SummaryLogEntry } from './combatSummary';

const combatants: SummaryCombatant[] = [
  { display_name: 'Anna', is_player_character: true, monster_id: null, current_hp: 0, max_hp: 12 },
  { display_name: 'Borin', is_player_character: true, monster_id: null, current_hp: 9, max_hp: 14 },
  { display_name: 'Wolf (Act 1)', is_player_character: false, monster_id: 'm1', current_hp: 0, max_hp: 10 },
  { display_name: 'Wolf (Act 2)', is_player_character: false, monster_id: 'm1', current_hp: 0, max_hp: 10 },
  { display_name: 'Troll', is_player_character: false, monster_id: 'm2', current_hp: 7, max_hp: 30 },
];

describe('buildCombatSummary', () => {
  const log: SummaryLogEntry[] = [
    { type: 'round_advanced', round: 2 },
    { type: 'attack_resolve', target: 'Wolf', targetIsPlayer: false, damage: 8, absorbed: 2, defeated: true },
    { type: 'attack_resolve', target: 'Anna', targetIsPlayer: true, damage: 12, absorbed: 3, dying: true },
    { type: 'attack_resolve', target: 'Anna', targetIsPlayer: true, damage: 0, parried: true },
    { type: 'attack_resolve', target: 'Anna', targetIsPlayer: true, damage: 4, dying: true },
  ];

  it('adds up damage by side, armor and parries', () => {
    const summary = buildCombatSummary(log, combatants, 3);
    expect(summary).toMatchObject({ rounds: 3, damageToMonsters: 8, damageToPlayers: 16, armorAbsorbed: 5, parries: 1 });
  });

  it('lists each creature that fell once, and who is still down', () => {
    const summary = buildCombatSummary(log, combatants, 3);
    expect(summary.defeated).toEqual(['Wolf']);
    expect(summary.wentDown).toEqual(['Anna']);
    expect(summary.stillDown).toEqual(['Anna']);
    expect(summary.playerHp).toEqual([
      { name: 'Anna', current: 0, max: 12 },
      { name: 'Borin', current: 9, max: 14 },
    ]);
  });

  it('counts monsters at 0 HP even when nothing was logged for them', () => {
    expect(buildCombatSummary([], combatants, 1).defeated).toEqual(['Wolf']);
  });

  it('records outright deaths', () => {
    const summary = buildCombatSummary([{ type: 'attack_resolve', target: 'Anna', targetIsPlayer: true, damage: 30, dying: true, instantDeath: true }], combatants, 1);
    expect(summary.died).toEqual(['Anna']);
  });
});
