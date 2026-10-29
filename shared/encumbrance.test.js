// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateEncumbrance as uiEncumbrance } from '../src/lib/encumbrance.ts';
import { calculateEncumbrance as mcpEncumbrance, normalizeCharacterEquipment } from '../server/helper/actors.js';
import { calculateSlotEncumbrance, coinCount, itemBundle, listingContents, resolveItemSlots } from './encumbrance.js';

const actorId = '3ced9760-b661-4a31-b219-8a754e815b55';
const definitions = [
  { id: 'backpack', name: 'Backpack', weight: 1, is_container: false, encumbrance_modifier: 2 },
  { id: 'horse', name: 'Horse', weight: 0, is_container: true, container_capacity: 20 },
  { id: 'saddle', name: 'Saddle bag', weight: 1, is_container: true, container_capacity: 4, encumbrance_modifier: 2 },
  { id: 'arrows', name: 'Arrows (20)', weight: 1 },
  { id: 'rope', name: 'Rope', weight: 1 },
  { id: 'armor', name: 'Armor', weight: 3 },
  { id: 'bow', name: 'Short bow', weight: 1, encumbrance_modifier: 1 },
  { id: 'dagger', name: 'Dagger', weight: 1, encumbrance_modifier: 1 },
];

describe('shared encumbrance rules and UI/MCP parity', () => {
  const cases = [
    { name: 'legacy weapon modifiers do not grant extra storage', strength: 14, expectedCapacity: 7, inventory: [{ name: 'Rope', quantity: 7 }], equipped: { weapons: [{ name: 'Short bow' }, { name: 'Dagger' }] } },
    { name: 'worn gear excluded', inventory: [], equipped: { armor: 'Armor', weapons: [{ name: 'Rope' }] } },
    { name: 'pack contents carried', inventory: [{ name: 'Rope', quantity: 8, containerId: 'pack' }], equipped: { containers: [{ id: 'pack', name: 'Backpack' }] } },
    { name: 'mount and mounted-bag cargo excluded', inventory: [{ name: 'Rope', quantity: 9, containerId: 'bag' }], equipped: { animals: [{ id: 'horse', name: 'Horse' }], containers: [{ id: 'bag', name: 'Saddle bag', equippedOn: 'horse' }] } },
    { name: 'unknown container counted', inventory: [{ name: 'Rope', quantity: 8, containerId: 'missing' }] },
    { name: 'legacy ammo bundle', inventory: [{ name: 'Arrows', quantity: 20, weight: 1 }] },
    { name: 'unit ammo weight', inventory: [{ name: 'Arrows', quantity: 20, weight: 0.05, weightBasis: 'unit' }] },
    { name: 'rations pooled across carried locations', inventory: [{ name: 'Rations', quantity: 2 }, { name: 'Rations', quantity: 2, containerId: 'pack' }], equipped: { containers: [{ id: 'pack', name: 'Backpack' }] } },
    { name: 'null weight defaults to one', inventory: [{ name: 'Unknown', quantity: 8, weight: null }] },
    { name: 'zero weight and quantity preserved', inventory: [{ name: 'Tiny', quantity: 50, weight: 0 }, { name: 'Rope', quantity: 0 }] },
    { name: 'cached items excluded', inventory: [{ name: 'Rope', quantity: 8, temporarilyPlaced: true }] },
    { name: 'coins weigh one slot per full hundred', inventory: [{ name: 'Rope', quantity: 2 }], money: { gold: 3, silver: 150, copper: 60 } },
    { name: 'items carried by another actor excluded', inventory: [{ name: 'Rope', quantity: 8, carriedByActorId: 'another-actor' }] },
  ];
  for (const example of cases) {
    it(example.name, () => {
      const document = { inventory: example.inventory, equipped: { weapons: [], ...example.equipped }, money: example.money };
      const character = { id: actorId, attributes: { STR: example.strength ?? 11 }, equipment: document };
      const ui = uiEncumbrance(character, definitions);
      const normalized = normalizeCharacterEquipment(actorId, document, { definitions });
      const mcp = mcpEncumbrance({ id: actorId, attributes: character.attributes, ...normalized });
      expect(mcp.capacity).toBe(ui.capacity);
      if (example.expectedCapacity !== undefined) expect(ui.capacity).toBe(example.expectedCapacity);
      expect(mcp.totalCarriedLoad).toBe(ui.load);
      expect(mcp.isEncumbered).toBe(ui.isEncumbered);
      const storageSummary = containers => containers.map(({ name, load, capacity, storageKind }) => ({ name, load, capacity, storageKind }));
      expect(storageSummary(mcp.containerLoads)).toEqual(storageSummary(Object.values(ui.containerStats)));
      // Persisting normalized IDs and unit weights must not change the next UI calculation.
      const persisted = {
        ...normalized.document,
        inventory: normalized.inventory.map(entry => ({ ...entry._stored, id: entry.id, weight: entry.weight, weightBasis: 'unit', containerId: entry.placement.containerId })),
      };
      expect(uiEncumbrance({ ...character, equipment: persisted }, definitions).load).toBe(ui.load);
    });
  }

  it('does not split measurement-based item names or divide custom weights', () => {
    expect(itemBundle('Rope (10 m)')).toEqual({ name: 'Rope (10 m)', size: 1 });
    expect(resolveItemSlots({ name: 'Arrows', weight: 0.25 }, definitions[3]).unitWeight).toBe(0.25);
  });

  it('splits a purchase into units and gives each unit its share of the weight', () => {
    const bandages = { id: 'bandages', name: 'Bandages', quantity: 10, weight: 0.1 };
    const rope = { id: 'rope', name: 'Rope (hemp), 10 meters', quantity: 1, weight: 1 };
    expect(listingContents(bandages)).toEqual({ name: 'Bandages', quantity: 10 });
    expect(listingContents({ name: 'Bandages (10)', quantity: 1 })).toEqual({ name: 'Bandages', quantity: 10 });
    expect(listingContents(rope)).toEqual({ name: 'Rope (hemp), 10 meters', quantity: 1 });
    expect(resolveItemSlots({ name: 'Bandages' }, bandages).unitWeight).toBeCloseTo(0.01);
    expect(resolveItemSlots({ name: 'Rope (hemp), 10 meters' }, rope).unitWeight).toBe(1);
    // A looted pack is still the whole pack; old shop purchases kept the pack's name on single units.
    expect(resolveItemSlots({ name: 'Bandages (10)' }, bandages).unitWeight).toBe(0.1);
    expect(resolveItemSlots({ name: 'Bandages (10)', quantity: 20 }, bandages).unitWeight).toBeCloseTo(0.01);
    // Legacy shop purchases copied the purchase's weight onto each unit.
    expect(resolveItemSlots({ name: 'Bandages', weight: 0.1 }, bandages).unitWeight).toBeCloseTo(0.01);
  });

  it('counts coins as tiny until there are a hundred', () => {
    expect(coinCount({ gold: 3, silver: 150, copper: 60 })).toBe(213);
    expect(calculateSlotEncumbrance({ strength: 10, coins: 99 })).toMatchObject({ load: 0, coinLoad: 0 });
    expect(calculateSlotEncumbrance({ strength: 10, coins: 100 })).toMatchObject({ load: 1, coinLoad: 1 });
    expect(calculateSlotEncumbrance({ strength: 10, coins: 299 })).toMatchObject({ load: 2, coinLoad: 2 });
  });
});
