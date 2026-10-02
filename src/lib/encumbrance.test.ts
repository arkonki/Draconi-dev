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

  it('includes carried backpack contents regardless of the storage flag', () => {
    for (const is_container of [false, true]) {
      const hero = character(11, [{ id: 'rope', name: 'Rope', quantity: 8, containerId: 'pack' }], {
        containers: [{ id: 'pack', name: 'Backpack', quantity: 1 }],
      });
      const result = calculateEncumbrance(hero, [item('Rope', 1), item('Backpack', 1, { is_container, encumbrance_modifier: 2 })]);
      expect(result).toMatchObject({ baseCapacity: 6, capacity: 8, load: 8, isEncumbered: false });
      expect(result.containerStats.pack).toMatchObject({ load: 8, countsTowardCarriedLoad: true });
    }
  });

  it('counts missing-container and missing-weight items conservatively, preserving explicit zero', () => {
    const hero = character(11, [
      { id: 'orphan', name: 'Rope', quantity: 6, containerId: 'missing' },
      { id: 'unknown', name: 'Cargo', quantity: 2, weight: null as unknown as number },
      { id: 'tiny', name: 'Tiny item', quantity: 30, weight: 0 },
    ]);
    expect(calculateEncumbrance(hero, [item('Rope', 1)]))
      .toMatchObject({ load: 8, isEncumbered: true, unresolvedContainerItemIds: ['orphan'], unknownWeightItemIds: ['unknown'] });
  });

  it('normalizes legacy purchases and explicit unit weights without double division', () => {
    const definitions = [item('Arrows (20)', 1)];
    for (const arrows of [
      { name: 'Arrows (20)', quantity: 20 },
      { name: 'Arrows', quantity: 20, weight: 1 },
      { name: 'Arrows', quantity: 20, weight: 0.05, weightBasis: 'unit' as const },
    ]) {
      expect(calculateEncumbrance(character(12, [arrows]), definitions).load).toBe(1);
    }
    expect(calculateEncumbrance(character(12, [{ name: 'Arrows', quantity: 20, weight: 1, weightBasis: 'unit' }]), definitions).load).toBe(20);
  });

  it('separates mount bags, does not grant their bonus to the hero, and supports externally placed items', () => {
    const hero = character(12, [
      { name: 'Rope', quantity: 3 },
      { id: 'cargo', name: 'Rope', quantity: 9, containerId: 'bag' },
      { id: 'cache', name: 'Rope', quantity: 7, temporarilyPlaced: true, carriedByActorId: null },
    ], {
      animals: [{ id: 'horse', name: 'Horse', quantity: 1 }],
      containers: [{ id: 'bag', name: 'Saddle bag', quantity: 1, equippedOn: 'horse' }],
    });
    const result = calculateEncumbrance(hero, [item('Rope', 1), item('Horse', 0, { is_container: true, container_capacity: 20 }), item('Saddle bag', 1, { encumbrance_modifier: 2 })]);
    expect(result).toMatchObject({ capacity: 6, load: 3, externalLoad: 16 });
    expect(result.containerStats.horse.capacity).toBe(22);
    expect(result.containerStats.bag).toMatchObject({ load: 9, storageKind: 'mount', countsTowardCarriedLoad: false });
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
