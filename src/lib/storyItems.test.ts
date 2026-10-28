import { describe, expect, it } from 'vitest';
import { parseStoryItems } from './storyItems';

const hoard = `A dusty chest holds **40 gold** and:

\`\`\`item
### Gravewarden's Dagger
*MELEE WEAPONS*
___
**Cost:** 12 gold · **Weight:** 0.5
**Damage:** 2D4 · **Grip:** 1H · **Range:** STR
___
**Effect:** Cold to the touch.
\`\`\`

\`\`\`monster
### Not an item
\`\`\`

\`\`\`item
### Bone Flute
\`\`\``;

describe('story items', () => {
  it('reads every item block and nothing else', () => {
    expect(parseStoryItems(hoard)).toEqual([
      {
        name: "Gravewarden's Dagger",
        category: 'MELEE WEAPONS',
        description: 'Cost: 12 gold · Weight: 0.5\nDamage: 2D4 · Grip: 1H · Range: STR\nEffect: Cold to the touch.',
      },
      { name: 'Bone Flute', category: 'LOOT', description: '' },
    ]);
  });

  it('skips blocks without a name', () => {
    expect(parseStoryItems('```item\n*LOOT*\nJust text\n```')).toEqual([]);
    expect(parseStoryItems('')).toEqual([]);
  });
});
