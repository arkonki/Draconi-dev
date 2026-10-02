import { describe, expect, it } from 'vitest';
import type { Character, EquippedItems, InventoryItem } from '../types/character';
import type { GameItem } from './api/items';
import { calculateEncumbrance } from './encumbrance';

function character(strength: number, inventory: InventoryItem[], equipped: Partial<EquippedItems> = {}): Character {
  return {
    attributes: { STR: strength },
    equipment: { inventory, equipped: { weapons: [], ...equipped } },
  } as Character;
}

const item = (name: string, weight: number, extra: Partial<GameItem> = {}): GameItem => ({
  id: name, name, weight, category: 'TOOLS', cost: '0', ...extra,
});

describe('shared character encumbrance', () => {
  it('only becomes heavy above the rounded-up STR capacity and responds to STR changes', () => {
    const hero = character(11, [{ name: 'Rope', quantity: 6 }]);
    expect(calculateEncumbrance(hero, [item('Rope', 1)])).toMatchObject({ capacity: 6, load: 6, isEncumbered: false });
    hero.equipment.inventory[0].quantity = 7;
    expect(calculateEncumbrance(hero, [item('Rope', 1)]).isEncumbered).toBe(true);
    hero.attributes.STR = 14;
    expect(calculateEncumbrance(hero, [item('Rope', 1)]).isEncumbered).toBe(false);
  });

  it('uses catalogue weights, ration bundles, and inventory weight overrides', () => {
    const hero = character(12, [
      { name: 'Tent, Large', quantity: 2 },
      { name: 'Field Rations', quantity: 5 },
      { name: 'Memento', quantity: 1 },
      { name: 'Custom cargo', quantity: 1, weight: 3 },
    ]);
    expect(calculateEncumbrance(hero, [item('Tent, Large', 2), item('Memento', 0)]))
      .toMatchObject({ capacity: 6, load: 9, isEncumbered: true });
    expect(calculateEncumbrance(character(12, [{ name: 'Custom cargo', quantity: 7, weight: 1 }]), []))
      .toMatchObject({ load: 7, isEncumbered: true });
  });

  it('includes equipped capacity modifiers but keeps mount cargo separate from carried load', () => {
    const hero = character(12, [
      { name: 'Rope', quantity: 7 },
      { name: 'Tent, Large', quantity: 4, containerId: 'horse' },
    ], {
      containers: [{ id: 'pack', name: 'Backpack', quantity: 1 }],
      animals: [{ id: 'horse', name: 'Horse', quantity: 1 }],
    });
    const result = calculateEncumbrance(hero, [
      item('Rope', 1), item('Tent, Large', 2),
      item('Backpack', 1, { is_container: false, encumbrance_modifier: 2 }),
      item('Horse', 0, { is_container: true, container_capacity: 20 }),
    ]);
    expect(result).toMatchObject({ capacity: 8, load: 7, isEncumbered: false });
    expect(result.containerStats.horse).toMatchObject({ load: 8, capacity: 20 });
  });

  it('preserves fractional pack weights', () => {
    const hero = character(12, [{ name: 'Arrows (20)', quantity: 20 }]);
    expect(calculateEncumbrance(hero, [item('Arrows (20)', 1)]).load).toBe(1);
  });

  it('accepts legacy JSON fields and handles missing or malformed equipment without crashing the sheet', () => {
    const hero = character(10, [{ name: 'Cargo', quantity: 6 }]);
    const legacy = { ...hero, attributes: JSON.stringify(hero.attributes), equipment: JSON.stringify(hero.equipment) } as unknown as Character;
    expect(calculateEncumbrance(legacy, [])).toMatchObject({ capacity: 5, load: 6, isEncumbered: true });
    const noEquipped = { ...hero, equipment: { inventory: hero.equipment.inventory } } as Character;
    expect(calculateEncumbrance(noEquipped, []).isEncumbered).toBe(true);
    expect(calculateEncumbrance({ ...hero, equipment: 'invalid JSON' } as unknown as Character, []).isEncumbered).toBe(false);
    expect(calculateEncumbrance(null, []).isEncumbered).toBe(false);
  });
});
