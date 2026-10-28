import { describe, expect, it } from 'vitest';
import { parseStoryMonsters } from './storyMonsters';

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
