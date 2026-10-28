// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ITEM_SYSTEM_PROMPT, buildItemMessages, itemContext, parseEnhancedItem } from './lootEnhancer.js';

const good = {
  name: 'Gravewarden\'s Dagger',
  category: 'melee weapons',
  cost: '12 gold',
  weight: 0.5,
  effect: 'Cold to the touch. Once per shift, spend 2 WP to make an attack against an undead with a boon.',
  damage: '2D4',
  grip: '1H',
  range: 'STR',
  durability: 9,
  armor_rating: '',
  features: 'Piercing, Subtle',
};

describe('loot item enhancer', () => {
  it('reads a clean answer into form fields', () => {
    expect(parseEnhancedItem(JSON.stringify(good))).toEqual({
      name: 'Gravewarden\'s Dagger',
      category: 'MELEE WEAPONS',
      cost: '12 gold',
      weight: 0.5,
      effect: good.effect,
      damage: '2D4',
      grip: '1H',
      range: 'STR',
      durability: '9',
      armor_rating: '',
      features: ['Piercing', 'Subtle'],
    });
  });

  it('copes with a code fence, list features and missing fields', () => {
    const item = parseEnhancedItem(`Here you go:\n\`\`\`json\n${JSON.stringify({ name: 'Old Key', features: ['Rusty'], weight: 'heavy' })}\n\`\`\``);
    expect(item).toMatchObject({ name: 'Old Key', category: 'LOOT', weight: 0, damage: '', features: ['Rusty'] });
  });

  it('gives up without a name or JSON', () => {
    expect(parseEnhancedItem('I cannot help with that.')).toBeNull();
    expect(parseEnhancedItem(JSON.stringify({ ...good, name: '' }))).toBeNull();
    expect(parseEnhancedItem('{ not json }')).toBeNull();
  });

  it('cuts long values and keeps weight sensible', () => {
    const item = parseEnhancedItem(JSON.stringify({ name: 'x'.repeat(500), weight: 9999 }));
    expect(item.name.length).toBe(120);
    expect(item.weight).toBe(100);
  });

  it('tells the model what the GM has, the categories, references and the wish', () => {
    const context = itemContext({
      item: { name: 'Bone flute', category: 'LOOT', cost: '0', weight: 0, features: ['Fragile'] },
      instructions: 'make it haunt its owner',
      categories: ['LOOT', 'MELEE WEAPONS'],
      references: [{ name: 'Dagger', damage: 'D8', features: ['Subtle', 'Piercing'] }],
    });
    expect(context).toContain('name: Bone flute');
    expect(context).toContain('features: Fragile');
    expect(context).not.toContain('cost: 0');
    expect(context).toContain('CATEGORIES: LOOT, MELEE WEAPONS');
    expect(context).toContain('- Dagger (damage D8, features Subtle, Piercing)');
    expect(context).toContain('make it haunt its owner');
  });

  it('keeps JSON keys in English when the campaign is narrated in another language', () => {
    const [system, user] = buildItemMessages({ context: 'THE ITEM SO FAR', language: 'et' });
    expect(system.content.startsWith(ITEM_SYSTEM_PROMPT)).toBe(true);
    expect(system.content).toContain('keep the JSON keys exactly as shown in English');
    expect(user.content).toBe('THE ITEM SO FAR');
  });
});
