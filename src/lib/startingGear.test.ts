import { describe, expect, it } from 'vitest';
import type { GameItem } from './api/items';
import { findGearItem, parseGearLine, startingInventoryItem } from './startingGear';

const item = (id: string, name: string, quantity = 1) => ({ id, name, quantity, category: 'GEAR', cost: '', weight: 1 } as GameItem);
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
    expect(parseGearLine('­ Grappling hook')).toEqual({ name: 'Grappling hook', quantity: 1 });
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
});
