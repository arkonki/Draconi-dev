import type { GameItem } from './api/items';
import { copperToCurrency, currencyToCopper, formatCost, parseCost } from './equipment';

// A mastercrafted weapon (rulebook page 74) costs ten times as much, needs 3 less STR and has 3 more durability.

export const MASTERCRAFTED_FEATURE = 'MASTERCRAFTED';
const PREFIX = 'Mastercrafted ';

const featureList = (features: GameItem['features']) => (Array.isArray(features)
  ? features
  : String(features || '').split(',')).map(feature => String(feature).trim()).filter(Boolean);

export function isMastercrafted(item: Partial<GameItem>): boolean {
  return featureList(item.features).some(feature => feature.toUpperCase() === MASTERCRAFTED_FEATURE);
}

/** The same weapon, mastercrafted. Values that are not plain numbers (such as "STR" or "—") are left as they are. */
export function makeMastercrafted(item: Partial<GameItem>): Partial<GameItem> {
  if (isMastercrafted(item)) return item;
  const cost = currencyToCopper(parseCost(String(item.cost ?? '')));
  const strength = Number(item.strength_requirement);
  const durability = Number(item.durability);
  const name = String(item.name ?? '').trim();
  return {
    ...item,
    name: name && !name.toLowerCase().startsWith(PREFIX.toLowerCase()) ? `${PREFIX}${name}` : name,
    cost: cost > 0 ? formatCost(copperToCurrency(cost * 10)) : item.cost,
    strength_requirement: String(item.strength_requirement ?? '').trim() !== '' && Number.isFinite(strength)
      ? (strength > 3 ? String(strength - 3) : '')
      : item.strength_requirement,
    durability: String(item.durability ?? '').trim() !== '' && Number.isFinite(durability) ? String(durability + 3) : item.durability,
    features: [...featureList(item.features), MASTERCRAFTED_FEATURE],
  };
}
