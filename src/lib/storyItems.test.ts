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
        quantity: 1,
      },
      { name: 'Bone Flute', category: 'LOOT', description: '', quantity: 1 },
    ]);
  });

  it('reads how many there are from a Quantity line or a counted name', () => {
    expect(parseStoryItems('```item\n### Bandages\n*MEDICINE*\n**Quantity:** 6\n**Cost:** 1 silver\n```')).toEqual([
      { name: 'Bandages', category: 'MEDICINE', description: 'Cost: 1 silver', quantity: 6 },
    ]);
    expect(parseStoryItems('```item\n### Arrows (20)\n```')).toEqual([{ name: 'Arrows', category: 'LOOT', description: '', quantity: 20 }]);
  });

  it('skips blocks without a name', () => {
    expect(parseStoryItems('```item\n*LOOT*\nJust text\n```')).toEqual([]);
    expect(parseStoryItems('')).toEqual([]);
  });
});
