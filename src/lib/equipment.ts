import { GameItem, findItemByName as findItemByNameApi } from './api/items';
import type { Money } from '../types/character';

// Keep the findEquipment function using the API call for now
export async function findEquipment(name: string): Promise<GameItem | null> {
  return findItemByNameApi(name);
}

// --- Utility Functions ---

// Parse cost string (e.g., "2 gold, 5 silver") into an object
export function parseCost(costString: string | undefined | null): Money {
  const cost = { gold: 0, silver: 0, copper: 0 };
  if (!costString || typeof costString !== 'string') return cost;

  const parts = costString.toLowerCase().split(/,\s*|\s+/);

  for (let i = 0; i < parts.length; i++) {
    const value = parseInt(parts[i]);
    if (!isNaN(value) && i + 1 < parts.length) {
      const unit = parts[i + 1];
      if (unit.startsWith('gold') || unit.startsWith('g')) {
        cost.gold = value;
        i++;
      } else if (unit.startsWith('silver') || unit.startsWith('s')) {
        cost.silver = value;
        i++;
      } else if (unit.startsWith('copper') || unit.startsWith('c')) {
        cost.copper = value;
        i++;
      }
    }
  }
  return normalizeCurrency(cost);
}

// Format cost object back into a string
export function formatCost(cost: Money | undefined | null): string {
  if (!cost) return '0 copper';
  const parts = [];
  if (cost.gold > 0) parts.push(`${cost.gold} gold`);
  if (cost.silver > 0) parts.push(`${cost.silver} silver`);
  if (cost.copper > 0) parts.push(`${cost.copper} copper`);
  return parts.length > 0 ? parts.join(', ') : '0 copper';
}

// ---------------------------------------------------------
//  Normalize currency values for Dragonbane (1:10 Ratio)
//  10 Copper = 1 Silver
//  10 Silver = 1 Gold
// ---------------------------------------------------------
export function normalizeCurrency(money: Money): Money {
  let { gold, silver, copper } = money;

  // 10 Copper -> 1 Silver
  silver += Math.floor(copper / 10);
  copper %= 10;

  // 10 Silver -> 1 Gold
  gold += Math.floor(silver / 10);
  silver %= 10;

  return { gold, silver, copper };
}

export function currencyToCopper(money: Money): number {
  return (money.gold || 0) * 100 + (money.silver || 0) * 10 + (money.copper || 0);
}

export function copperToCurrency(totalCopper: number): Money {
  const safeCopper = Math.max(0, totalCopper);
  const gold = Math.floor(safeCopper / 100);
  const silver = Math.floor((safeCopper % 100) / 10);
  const copper = safeCopper % 10;

  return { gold, silver, copper };
}

export function applyMoneyDelta(currentMoney: Money, delta: Money): { success: boolean; newMoney: Money } {
  const newTotalCopper = currencyToCopper(currentMoney) + currencyToCopper(delta);

  if (newTotalCopper < 0) {
    return { success: false, newMoney: currentMoney };
  }

  return {
    success: true,
    newMoney: copperToCurrency(newTotalCopper),
  };
}


// ---------------------------------------------------------
//  Subtract cost using Dragonbane values
// ---------------------------------------------------------
export function subtractCost(
  currentMoney: Money,
  itemCost: Money
): { success: boolean; newMoney: Money } {
  return applyMoneyDelta(currentMoney, {
    gold: -itemCost.gold,
    silver: -itemCost.silver,
    copper: -itemCost.copper,
  });
}
