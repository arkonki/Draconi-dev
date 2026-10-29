import { describe, expect, it } from 'vitest';
import type { GameItem } from './api/items';
import { draftAnimalsNeeded, isDraftAnimal, vehicleCargo } from './partyVehicles';

const catalogue: Record<string, Partial<GameItem>> = {
  cart: { name: 'Cart', category: 'MEANS OF TRAVEL', weight: 0, container_capacity: 50 },
  canoe: { name: 'Canoe', category: 'MEANS OF TRAVEL', weight: 0, container_capacity: 10 },
  chest: { name: 'Chest', category: 'CONTAINERS', weight: 3 },
  bandages: { name: 'Bandages', category: 'MEDICINE', weight: 1, quantity: 10 },
  'field rations': { name: 'Field Rations', category: 'TRADE GOODS', weight: 0 },
};
const definitionFor = (name: string) => catalogue[name.toLowerCase()] as GameItem | undefined;

describe('party vehicles', () => {
  it('adds up the cargo loaded onto each vehicle against what it carries', () => {
    const rows = [
      { id: 'cart', name: 'Cart', quantity: 1 },
      { id: 'canoe', name: 'Canoe', quantity: 1 },
      { id: 'c1', name: 'Chest', quantity: 2, stored_in: 'cart' },
      { id: 'c2', name: 'Bandages', quantity: 20, stored_in: 'cart' },
      { id: 'c3', name: 'Field Rations', quantity: 9, stored_in: 'canoe' },
      { id: 'loose', name: 'Chest', quantity: 5 },
    ];
    const [cart, canoe] = vehicleCargo(rows, definitionFor, 0);
    expect(cart).toMatchObject({ name: 'Cart', load: 8, capacity: 50, isOverloaded: false, draftNeeded: 1, draftAvailable: 0 });
    // Rations weigh four to a slot.
    expect(canoe).toMatchObject({ name: 'Canoe', load: 3, capacity: 10, draftNeeded: 0 });
  });

  it('flags an overloaded vehicle', () => {
    const rows = [{ id: 'canoe', name: 'Canoe', quantity: 1 }, { id: 'c', name: 'Chest', quantity: 4, stored_in: 'canoe' }];
    expect(vehicleCargo(rows, definitionFor, 0)[0]).toMatchObject({ load: 12, isOverloaded: true });
  });

  it('knows which vehicles need animals and which animals can pull', () => {
    expect([draftAnimalsNeeded('Cart'), draftAnimalsNeeded('Wagon'), draftAnimalsNeeded('Rowing Boat')]).toEqual([1, 2, 0]);
    expect([isDraftAnimal('Riding Horse'), isDraftAnimal('Donkey'), isDraftAnimal('Guard Dog')]).toEqual([true, true, false]);
  });
});
