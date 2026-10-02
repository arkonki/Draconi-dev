import type { Character, InventoryItem } from '../types/character';
import type { GameItem } from './api/items';
import { calculateSlotEncumbrance, findItemDefinition, resolveItemSlots, finiteNonNegative } from '../../shared/encumbrance.js';
import type { SlotItem, SlotEncumbrance } from '../../shared/encumbrance.js';

export type Encumbrance = SlotEncumbrance;

export const getStrengthFromCharacter = (character: Character): number | null => {
  try {
    const attributes = typeof character.attributes === 'string' ? JSON.parse(character.attributes) : character.attributes;
    return finiteNonNegative(attributes?.STR);
  } catch { return null; }
};

export const calculateEncumbrance = (character: Character | null, allGameItems: GameItem[]): Encumbrance => {
  const empty = () => calculateSlotEncumbrance({ strength: 0 });
  if (!character) return empty();
  try {
    const equipment = typeof character.equipment === 'string' ? JSON.parse(character.equipment) : character.equipment;
    const strength = getStrengthFromCharacter(character);
    if (strength === null || !equipment) return empty();
    const mapItem = (value: InventoryItem | string, slot: string): SlotItem => {
      const item: Partial<InventoryItem> & { name: string } = typeof value === 'string' ? { name: value } : value;
      const definition = findItemDefinition(item, allGameItems);
      const details = { ...definition, ...item };
      const slots = resolveItemSlots(item, definition);
      return {
        id: item.id, name: item.name, slot, equipped: slot !== 'inventory',
        quantity: item.quantity, weight: slots.unitWeight, unknownWeight: slots.unknownWeight,
        containerId: item.containerId, equippedOn: item.equippedOn,
        isContainer: Boolean(details.is_container), containerCapacity: details.container_capacity,
        encumbranceModifier: details.encumbrance_modifier,
        temporarilyPlaced: item.temporarilyPlaced, carriedByActorId: item.carriedByActorId,
      };
    };
    const worn = equipment.equipped || {};
    const equipped = [
      ...(worn.armor ? [mapItem(worn.armor, 'armor')] : []),
      ...(worn.helmet ? [mapItem(worn.helmet, 'helmet')] : []),
      ...(worn.shield ? [mapItem(worn.shield, 'shield')] : []),
      ...(worn.weapons || []).filter(Boolean).map((item: InventoryItem) => mapItem(item, 'weapon')),
      ...(worn.wornClothes || []).filter(Boolean).map((item: InventoryItem | string) => mapItem(item, 'clothing')),
      ...(worn.containers || []).filter(Boolean).map((item: InventoryItem) => mapItem(item, 'container')),
      ...(worn.animals || []).filter(Boolean).map((item: InventoryItem) => mapItem(item, 'animal')),
    ];
    return calculateSlotEncumbrance({
      strength, actorId: character.id, equipped,
      inventory: (equipment.inventory || []).filter((item: InventoryItem) => item?.name).map((item: InventoryItem) => mapItem(item, 'inventory')),
    });
  } catch { return empty(); }
};
