import { describe, expect, it } from 'vitest';
import type { GameItem } from './api/items';
import { equipStartingGear, findGearItem, parseGearLine, startingInventoryItem } from './startingGear';

const item = (id: string, name: string, quantity = 1, category = 'GEAR', extra: Partial<GameItem> = {}) => ({ id, name, quantity, category, cost: '', weight: 1, ...extra } as GameItem);
const items = [
  item('warhammer', 'Warhammer, Light'),
  item('morningstar', 'Morningstar'),
  item('bandages', 'Bandages', 10),
  item('oil', 'Lamp oil', 10),
  item('dagger', 'Dagger'),
  item('rations', 'Field Rations'),
];

describe('starting gear', () => {
  it('reads counts before or after the name', () => {
    expect(parseGearLine('Dagger x2')).toEqual({ name: 'Dagger', quantity: 2 });
    expect(parseGearLine('2 x Dagger')).toEqual({ name: 'Dagger', quantity: 2 });
    expect(parseGearLine('4 Field Rations')).toEqual({ name: 'Field Rations', quantity: 4 });
    expect(parseGearLine('\u00AD Grappling hook')).toEqual({ name: 'Grappling hook', quantity: 1 });
  });

  it('finds catalogue items despite spacing and punctuation', () => {
    expect(findGearItem('Warhammer (light)', items)?.id).toBe('warhammer');
    expect(findGearItem('Morning star', items)?.id).toBe('morningstar');
    expect(findGearItem('Quill', items)).toBeUndefined();
  });

  it('hands out packs whole and linked to the catalogue', () => {
    expect(startingInventoryItem('Bandages', items, 'a')).toEqual({ id: 'a', name: 'Bandages', quantity: 10, definitionId: 'bandages' });
    expect(startingInventoryItem('Lamp oil', items, 'b')?.quantity).toBe(10);
    expect(startingInventoryItem('Dagger x2', items, 'c')).toEqual({ id: 'c', name: 'Dagger', quantity: 2, definitionId: 'dagger' });
    expect(startingInventoryItem('5 Field Rations', items, 'd')?.quantity).toBe(5);
    expect(startingInventoryItem('Lucky coin', items, 'e')).toEqual({ id: 'e', name: 'Lucky coin', quantity: 1 });
  });

  it('equips weapons, armor, a backpack and animals, and leaves the rest in the inventory', () => {
    const catalogue = [
      item('sword', 'Short Sword', 1, 'MELEE WEAPONS', { damage: 'D10', grip: '1H' }),
      item('lance', 'Lance', 1, 'MELEE WEAPONS'),
      item('shield', 'Shield (small)', 1, 'MELEE WEAPONS'),
      item('dagger', 'Dagger', 1, 'MELEE WEAPONS'),
      item('mail', 'Chainmail', 1, 'ARMOR & HELMETS'),
      item('helm', 'Open Helmet', 1, 'ARMOR & HELMETS'),
      item('pack', 'Backpack', 1, 'CONTAINERS'),
      item('horse', 'Combat trained horse', 1, 'ANIMALS'),
      item('torch', 'Torch', 1, 'LIGHT SOURCES'),
    ];
    const entry = (definitionId: string, name: string, quantity = 1) => ({ id: definitionId, name, quantity, definitionId });
    let n = 0;
    const { inventory, equipped } = equipStartingGear([
      entry('sword', 'Short Sword'), entry('lance', 'Lance'), entry('shield', 'Shield (small)'), entry('dagger', 'Dagger', 2),
      entry('mail', 'Chainmail'), entry('helm', 'Open Helmet'), entry('pack', 'Backpack'), entry('horse', 'Combat trained horse'),
      entry('torch', 'Torch'), { id: 'coin', name: 'Lucky coin', quantity: 1 },
    ], catalogue, () => `id-${++n}`);
    expect(equipped.weapons.map(weapon => weapon.name)).toEqual(['Short Sword', 'Lance', 'Shield (small)']);
    expect(equipped.weapons[0]).toMatchObject({ damage: 'D10', grip: '1H' });
    expect(equipped).toMatchObject({ armor: 'Chainmail', helmet: 'Open Helmet' });
    expect(equipped.containers?.map(container => container.name)).toEqual(['Backpack']);
    expect(equipped.animals?.map(animal => animal.name)).toEqual(['Combat trained horse']);
    // Only three weapons fit at hand, so both daggers stay in the inventory.
    expect(inventory.map(({ name, quantity }) => [name, quantity])).toEqual([['Dagger', 2], ['Torch', 1], ['Lucky coin', 1]]);
  });
});
