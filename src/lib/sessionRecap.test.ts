import { describe, expect, it } from 'vitest';
import { buildSessionRecap, fightLine, formatDuration, type RecapInput } from './sessionRecap';
import type { CombatSummary } from './combatSummary';

const summary: CombatSummary = {
  rounds: 4, damageToMonsters: 23, damageToPlayers: 11, armorAbsorbed: 5, parries: 2,
  defeated: ['Goblin', 'Goblin 2'], wentDown: ['Hero'], died: [], stillDown: [], playerHp: [],
};

const base: RecapInput = {
  title: 'The Dark Wood', startedAt: '2026-10-13T18:00:00Z', endedAt: new Date('2026-10-13T21:20:00Z'), clock: 'Day 3, shift 2',
  fights: [], dragons: [], demons: [], questsCompleted: [], questsAdded: [], messageCount: 0,
};

describe('session recap', () => {
  it('formats how long the session ran', () => {
    expect(formatDuration('2026-10-13T18:00:00Z', new Date('2026-10-13T21:20:00Z'))).toBe('3 h 20 min');
    expect(formatDuration('2026-10-13T18:00:00Z', new Date('2026-10-13T18:45:00Z'))).toBe('45 min');
    expect(formatDuration(null, new Date())).toBe('');
  });

  it('describes a fight in one line', () => {
    expect(fightLine({ name: 'Goblin ambush', rounds: 4, summary })).toBe('Goblin ambush: 4 rounds. Defeated Goblin, Goblin 2. Went down: Hero. 23 damage to the enemies, 11 to the party.');
    expect(fightLine({ name: 'Duel', rounds: 1, summary: { ...summary, defeated: [], wentDown: ['Hero'], died: ['Hero'] } })).toContain('(died: Hero)');
  });

  it('puts every recorded part into the draft', () => {
    const text = buildSessionRecap({
      ...base,
      fights: [{ name: 'Goblin ambush', rounds: 4, summary }],
      dragons: ['Sneaking', 'Bows'], demons: ['Swords'],
      questsCompleted: ['Find the well'], questsAdded: ['Follow the tracks'], messageCount: 142,
    });
    expect(text).toContain('The Dark Wood, played for 3 h 20 min.');
    expect(text).toContain('The game clock now reads Day 3, shift 2.');
    expect(text).toContain('• Goblin ambush: 4 rounds.');
    expect(text).toContain('• 2 dragons: Sneaking, Bows');
    expect(text).toContain('• 1 demon: Swords');
    expect(text).toContain('• Completed: Find the well');
    expect(text).toContain('• New: Follow the tracks');
    expect(text).toContain('142 chat messages at the table.');
  });

  it('says so when nothing was recorded', () => {
    const text = buildSessionRecap({ ...base, clock: null });
    expect(text).toContain('Nothing was recorded by the app this session.');
  });

  it('adds the story, keeping its newest part when it is long', () => {
    const text = buildSessionRecap({ ...base, story: 'The hero crossed the marsh.' });
    expect(text).toContain('Story\nThe hero crossed the marsh.');
    expect(text).not.toContain('Nothing was recorded');
    const long = buildSessionRecap({ ...base, story: `${'a'.repeat(4000)}THE END` });
    expect(long).toContain('THE END');
    expect(long).toContain('…');
  });
});
