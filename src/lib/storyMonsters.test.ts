import { describe, expect, it } from 'vitest';
import { buildMonsterGearDamageRoll, getMonsterSkillEntries } from '../components/party/partyEncounterShared';
import { linkNpcToGameData, parseNpcWeapons, parseSkillList, parseStoryMonsters } from './storyMonsters';

const answer = `Here they are.

\`\`\`monster
### Bog Wight
*Large undead*
___
| Ferocity | Size | Movement | Armor | HP |
|:---:|:---:|:---:|:---:|:---:|
| 2 | Large | 10 | 3 | 30 |
**Skills:** Awareness 12, Sneaking 14
___
**Abilities:**
* **Cold Grip:** Victims become Exhausted.

#### Monster Attacks
| d6 | Attack |
|:---|:---|
| 1 | **Claw:** 2D6 slashing damage. |
| 2-3 | **Wail:** All heroes make a WIL roll or become Scared. |
\`\`\`

\`\`\`npc
### Captain Rusk
*Human Fighter*
___
**Appearance:** Scarred and grey.
**Motivation:** Gold.
___
| STR | CON | AGL | INT | WIL | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 15 | 14 | 12 | 10 | 11 | 9 |
___
**Movement:** 10 · **HP:** 14 · **WP:** 11 · **Armor:** 2
**Skills:** Swords 14, Awareness 11
**Weapons:** Broadsword (skill 14, damage 2D6)
\`\`\``;

describe('story monsters', () => {
  it('reads a monster block into stats, an attack table and abilities', () => {
    const [wight] = parseStoryMonsters(answer);
    expect(wight).toMatchObject({
      name: 'Bog Wight',
      category: 'Large undead',
      stats: { FEROCITY: 2, SIZE: 'Large', MOVEMENT: 10, ARMOR: 3, HP: 30, SKILLS: 'Awareness 12, Sneaking 14' },
      effectsSummary: '- Cold Grip: Victims become Exhausted.',
    });
    expect(wight.attacks).toEqual([
      { roll_values: '1', name: 'Claw', description: '2D6 slashing damage.', effects: [] },
      { roll_values: '2-3', name: 'Wail', description: 'All heroes make a WIL roll or become Scared.', effects: [] },
    ]);
  });

  it('reads an NPC block as an NPC with its pools, skills and weapons', () => {
    const [, rusk] = parseStoryMonsters(answer);
    expect(rusk).toMatchObject({
      name: 'Captain Rusk',
      category: 'NPC',
      description: 'Appearance: Scarred and grey.\nMotivation: Gold.',
      stats: { IS_NPC: true, TYPE: 'Human Fighter', HP: 14, WP: 11, MOVEMENT: 10, ARMOR: 2, SKILLS: 'Swords 14, Awareness 11', GEAR: 'Broadsword (skill 14, damage 2D6)' },
      effectsSummary: 'Attributes: STR 15, CON 14, AGL 12, INT 10, WIL 11, CHA 9',
    });
  });

  it('fills in safe defaults and skips nameless blocks', () => {
    const [bare] = parseStoryMonsters('```monster\n### Rat Swarm\n```');
    expect(bare.stats).toMatchObject({ HP: 1, FEROCITY: 1, SIZE: 'Normal' });
    expect(parseStoryMonsters('```monster\nNo name\n```')).toEqual([]);
  });
});

describe('answers that stray from the format', () => {
  const wyrm = parseStoryMonsters([
    '```monster',
    '### Marsh Wyrm',
    '*Beast*',
    '| Ferocity | Size | Move | Armour | Hit Points |',
    '|:---:|:---:|:---:|:---:|:---:|',
    '| 2 | huge | 16 | 4 | 48 |',
    '#### Monster Attacks',
    '| D6 | Attack |',
    '|:---|:---|',
    '| 1–2 | **Bite:** 2D10 piercing damage. |',
    '| 3 — 4 | **Tail Sweep:** Everyone within 4 meters takes 2D6 bludgeoning damage. |',
    '| 5-6 | **Roar:** A WIL roll or become Scared. |',
    '```',
  ].join('\n'))[0];

  it('reads other spellings of the stat headings', () => {
    expect(wyrm.stats).toMatchObject({ FEROCITY: 2, SIZE: 'Huge', MOVEMENT: 16, ARMOR: 4, HP: 48 });
  });

  it('keeps attack rows whose ranges use a long dash', () => {
    expect(wyrm.attacks?.map((attack) => `${attack.roll_values} ${attack.name}`)).toEqual(['1-2 Bite', '3-4 Tail Sweep', '5-6 Roar']);
  });

  it('keeps an NPC damage bonus in the form the fight reads', () => {
    const npc = (bonus: string) => parseStoryMonsters(['```npc', '### Guard', '*Human Fighter*', `**Movement:** 10 · **HP:** 12 · **WP:** 9 · **Armor:** 2 · **Damage Bonus:** ${bonus}`, '```'].join('\n'))[0];
    expect(npc('str+d4').stats.DAMAGE_BONUS).toBe('STR +D4');
    expect(npc('AGL +D6').stats.DAMAGE_BONUS).toBe('AGL +D6');
    expect(npc('None').stats.DAMAGE_BONUS).toBeUndefined();
    expect(npc('STR +D4').stats).toMatchObject({ MOVEMENT: 10, HP: 12, WP: 9, ARMOR: 2 });
  });
});

describe('an NPC the fight can roll for', () => {
  const block = (weapons: string, skills = 'Awareness 12, Hunting & Fishing 10') => parseStoryMonsters([
    '```npc', '### Brigand', '*Human Thief*',
    '**Movement:** 10 · **HP:** 12 · **WP:** 9 · **Armor:** 1 · **Damage Bonus:** AGL +D4',
    `**Skills:** ${skills}`,
    `**Weapons:** ${weapons}`,
    '```',
  ].join('\n'))[0];

  it('reads skills as separate entries with their levels', () => {
    expect(parseSkillList('Awareness 14, Hunting & Fishing 12, Myths & Legends: 9')).toEqual([
      { name: 'Awareness', level: 14 }, { name: 'Hunting & Fishing', level: 12 }, { name: 'Myths & Legends', level: 9 },
    ]);
    expect(parseSkillList('Sneaking')).toEqual([]);
    expect(parseSkillList(undefined)).toEqual([]);
  });

  it('reads weapons with a named skill, a bare skill level, and a range', () => {
    expect(parseNpcWeapons('Dagger (Knives 12, damage D8), Short bow (skill 13, damage D10, range 30)')).toEqual([
      { name: 'Dagger', skill: 'Knives', level: 12, damage: 'D8', range: null },
      { name: 'Short bow', skill: 'Bows', level: 13, damage: 'D10', range: '30' },
    ]);
    expect(parseNpcWeapons('Broadsword (skill 14, damage 2d6)')[0]).toMatchObject({ skill: 'Swords', level: 14, damage: '2D6' });
    expect(parseNpcWeapons('Lucky charm')[0]).toEqual({ name: 'Lucky charm', skill: null, level: null, damage: null, range: null });
  });

  it('gives the fight weapons with damage and the skill their damage bonus depends on', () => {
    const npc = block('Dagger (Knives 12, damage D8), Short bow (Bows 13, damage D10, range 30)');
    expect(npc.stats.GEAR_ITEMS).toEqual([
      { item_id: 'story-weapon-0', name: 'Dagger', category: 'MELEE WEAPONS', quantity: 1, damage: 'D8', skill: 'Knives' },
      { item_id: 'story-weapon-1', name: 'Short bow', category: 'RANGED WEAPONS', quantity: 1, damage: 'D10', range: '30', skill: 'Bows' },
    ]);
    // The text is kept as well, for the stat table.
    expect(npc.stats.GEAR).toContain('Dagger');
  });

  it('lists a weapon skill among the skills when the block left it out, so the attack can be rolled', () => {
    const npc = block('Dagger (Knives 12, damage D8)');
    expect(npc.stats.SKILL_ENTRIES?.map((entry) => `${entry.name} ${entry.level}`)).toEqual(['Awareness 12', 'Hunting & Fishing 10', 'Knives 12']);
    const listed = block('Dagger (Knives 12, damage D8)', 'Knives 15');
    expect(listed.stats.SKILL_ENTRIES?.map((entry) => `${entry.name} ${entry.level}`)).toEqual(['Knives 15']);
  });

  it('ties weapons and skills to the game\'s own data where the names match', () => {
    const npc = block('dagger (Knives 12, damage D6), Whalebone club (skill 11, damage D8)');
    const linked = linkNpcToGameData(npc, {
      items: [{ id: 'item-dagger', name: 'Dagger', category: 'MELEE WEAPONS', damage: 'D8', grip: '1H', durability: 9, features: ['Subtle', 'Piercing'], skill: 'Knives' }],
      skills: [{ id: 'skill-awareness', name: 'Awareness', attribute: 'INT' }, { id: 'skill-knives', name: 'Knives', attribute: 'AGL' }],
    });
    expect(linked.stats.GEAR_ITEMS?.[0]).toMatchObject({ item_id: 'item-dagger', name: 'Dagger', damage: 'D8', grip: '1H', durability: 9, features: ['Subtle', 'Piercing'], skill: 'Knives' });
    // A weapon the game does not have stays as the block described it.
    expect(linked.stats.GEAR_ITEMS?.[1]).toMatchObject({ item_id: 'story-weapon-1', name: 'Whalebone club', damage: 'D8', skill: 'Hammers' });
    expect(linked.stats.SKILL_ENTRIES?.find((entry) => entry.name === 'Awareness')).toMatchObject({ skill_id: 'skill-awareness', attribute: 'INT' });
    expect(linked.stats.SKILL_ENTRIES?.find((entry) => entry.name === 'Hunting & Fishing')?.skill_id).toMatch(/^story-skill-/);
    // The original is left as it was.
    expect(npc.stats.GEAR_ITEMS?.[0].item_id).toBe('story-weapon-0');
  });

  it('leaves monsters alone', () => {
    const monster = parseStoryMonsters('```monster\n### Rat\n| Ferocity | Size | Movement | Armor | HP |\n|---|---|---|---|---|\n| 1 | Small | 12 | 0 | 4 |\n```')[0];
    expect(linkNpcToGameData(monster, { items: [], skills: [] })).toBe(monster);
    expect(monster.stats.GEAR_ITEMS).toBeUndefined();
  });
});

describe('what the fight makes of a saved NPC', () => {
  const npc = parseStoryMonsters([
    '```npc', '### Brigand', '*Human Thief*',
    '**Movement:** 10 · **HP:** 12 · **WP:** 9 · **Armor:** 1 · **Damage Bonus:** AGL +D4',
    '**Skills:** Awareness 12',
    '**Weapons:** Dagger (Knives 12, damage D8), Club (Hammers 10, damage D8)',
    '```',
  ].join('\n'))[0];
  const stats = npc.stats as never;
  const gear = npc.stats.GEAR_ITEMS as never[];

  it('rolls the weapon\'s damage, with the damage bonus when the weapon uses that attribute', () => {
    expect(buildMonsterGearDamageRoll(gear[0], stats)).toMatchObject({ dicePool: ['d8', 'd4'], display: 'D8 + D4' });
    // A club is swung with STR, so an AGL bonus does not apply.
    expect(buildMonsterGearDamageRoll(gear[1], stats)).toMatchObject({ dicePool: ['d8'], display: 'D8' });
  });

  it('offers each skill on its own, at its level', () => {
    expect(getMonsterSkillEntries(stats).map((skill) => `${skill.name} ${skill.level}`)).toEqual(['Awareness 12', 'Knives 12', 'Hammers 10']);
  });
});

