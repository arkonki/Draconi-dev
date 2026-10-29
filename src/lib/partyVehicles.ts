import type { GameItem } from './api/items';
import { finiteNonNegative, resolveItemSlots } from '../../shared/encumbrance.js';

// Vehicles belong to the party: they sit in the party stash, and stash items can be loaded onto them. The rulebook
// (page 81) gives each one a number of weight units it can carry; carts and wagons need animals to pull them.

export interface StashRow {
  id: string;
  name: string;
  quantity: number;
  category?: string;
  stored_in?: string | null;
}

export interface VehicleCargo {
  id: string;
  name: string;
  load: number;
  capacity: number;
  isOverloaded: boolean;
  /** Horses or donkeys needed to pull it, and how many the party has. */
  draftNeeded: number;
  draftAvailable: number;
}

export function isVehicle(row: Pick<StashRow, 'category'>, definition?: Pick<GameItem, 'category'>): boolean {
  return [row.category, definition?.category].some(category => String(category || '').trim().toUpperCase() === 'MEANS OF TRAVEL');
}

/** "Pulled by one horse or donkey" (cart) or two (wagon). Boats and canoes need none. */
export function draftAnimalsNeeded(name: string): number {
  if (/\bwagon\b/i.test(name)) return 2;
  if (/\bcart\b/i.test(name)) return 1;
  return 0;
}

export const isDraftAnimal = (name: string) => /\b(horse|donkey|mule|ox|oxen)\b/i.test(name);

const cleanLoad = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Each vehicle's cargo load against what it can carry. `draftAvailable` counts the party's horses and donkeys. */
export function vehicleCargo(
  rows: StashRow[],
  definitionFor: (name: string) => GameItem | undefined,
  draftAvailable: number,
): VehicleCargo[] {
  const vehicles = rows.filter(row => isVehicle(row, definitionFor(row.name)));
  return vehicles.map(vehicle => {
    const definition = definitionFor(vehicle.name);
    const capacity = (finiteNonNegative(definition?.container_capacity) ?? 0) * Math.max(1, vehicle.quantity);
    let rations = 0;
    const load = rows.filter(row => row.stored_in === vehicle.id).reduce((sum, row) => {
      if (/ration/i.test(row.name)) { rations += row.quantity; return sum; }
      return sum + resolveItemSlots({ name: row.name }, definitionFor(row.name)).unitWeight * row.quantity;
    }, 0) + Math.ceil(rations / 4);
    return {
      id: vehicle.id,
      name: vehicle.name,
      load: cleanLoad(load),
      capacity,
      isOverloaded: load > capacity,
      draftNeeded: draftAnimalsNeeded(vehicle.name) * Math.max(1, vehicle.quantity),
      draftAvailable,
    };
  });
}
