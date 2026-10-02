import type { GameItem } from './api/items';
import { currencyToCopper, parseCost } from './equipment';
import { itemBundle } from '../../shared/encumbrance.js';

export interface ShopCartLine {
  item: GameItem;
  quantity: number; // Number of shop purchases/bundles, not individual contents.
}

export function shopPriceInCopper(item: GameItem): number | null {
  const cost = String(item.cost || '').trim();
  if (!cost || /-\s*\d/.test(cost)) return null;
  if (/^(free|0)$/i.test(cost)) return 0;
  const price = currencyToCopper(parseCost(cost));
  if (price > 0) return price;
  return /^0\s+(gold|silver|copper|g|s|c)$/i.test(cost) ? 0 : null;
}

export function shopPurchaseContents(item: GameItem): { name: string; quantity: number } {
  const bundle = itemBundle(item.name);
  const count = Number(item.quantity);
  return {
    name: bundle.name,
    quantity: bundle.size > 1 ? bundle.size : Number.isSafeInteger(count) && count > 0 ? count : 1,
  };
}

export function shopCartTotal(lines: ShopCartLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const price = shopPriceInCopper(line.item);
    if (price === null || !Number.isSafeInteger(line.quantity) || line.quantity < 1) return null;
    total += price * line.quantity;
  }
  return Number.isSafeInteger(total) ? total : null;
}
