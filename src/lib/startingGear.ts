import type { GameItem } from './api/items';
import type { InventoryItem } from '../types/character';
import { listingContents } from '../../shared/encumbrance.js';

// A profession's starting gear is a list of plain names such as "Dagger x2", "4 Field Rations" or
// "Warhammer (light)". These turn them into catalogue items and inventory entries.

/** Lowercase letters and digits only, so "Warhammer (light)" finds "Warhammer, Light" and "Morning star" finds "Morningstar". */
const itemKey = (name: string) => name.replace(/­/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Splits a gear line into a name and how many of it: "Dagger x2" and "2 x Dagger" are two daggers, "4 Field Rations" four. */
export function parseGearLine(line: string): { name: string; quantity: number } {
  const text = line.replace(/­/g, '').trim();
  const match = text.match(/^(\d+)\s*x\s+(.+)$/i) || text.match(/^(.+?)\s+x\s*(\d+)$/i) || text.match(/^(\d+)\s+(.+)$/);
  if (!match) return { name: text, quantity: 1 };
  const [count, name] = /^\d+$/.test(match[1]) ? [match[1], match[2]] : [match[2], match[1]];
  return { name: name.trim(), quantity: Math.max(1, parseInt(count, 10)) };
}

/** The catalogue item a gear name means, matching exactly first and then ignoring spacing and punctuation. */
export function findGearItem(name: string, items: GameItem[]): GameItem | undefined {
  const lower = name.trim().toLowerCase();
  const shared = items.filter(item => !item.party_id);
  const exact = shared.find(item => item.name.trim().toLowerCase() === lower);
  if (exact) return exact;
  const key = itemKey(name);
  return key ? shared.find(item => itemKey(item.name) === key) : undefined;
}

/**
 * One line of starting gear as an inventory entry. A catalogue item comes as the shop sells it, so "Bandages" is a
 * pack of ten and "Lamp oil" a flask of ten doses, and it keeps its link to the catalogue.
 */
export function startingInventoryItem(line: string, items: GameItem[], id: string): InventoryItem | null {
  const { name, quantity } = parseGearLine(line);
  if (!name) return null;
  const definition = findGearItem(name, items);
  if (!definition) return { id, name, quantity };
  const contents = listingContents(definition);
  return { id, name: contents.name, quantity: quantity * contents.quantity, definitionId: definition.id };
}
