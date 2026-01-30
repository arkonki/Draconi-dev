import { GameItem, findItemByName as findItemByNameApi } from './api/items';

// Keep the findEquipment function using the API call for now
export async function findEquipment(name: string): Promise<GameItem | null> {
  return findItemByNameApi(name);
}

// --- Utility Functions ---

// Parse cost string (e.g., "2 gold, 5 silver") into an object
export function parseCost(costString: string | undefined | null): { gold: number; silver: number; copper: number } {
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
export function formatCost(cost: { gold: number; silver: number; copper: number } | undefined | null): string {
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
export function normalizeCurrency(money: { gold: number; silver: number; copper: number }): { gold: number; silver: number; copper: number } {
  let { gold, silver, copper } = money;

  // 10 Copper -> 1 Silver
  silver += Math.floor(copper / 10);
  copper %= 10;

  // 10 Silver -> 1 Gold
  gold += Math.floor(silver / 10);
  silver %= 10;

  return { gold, silver, copper };
}


// ---------------------------------------------------------
//  Subtract cost using Dragonbane values
// ---------------------------------------------------------
export function subtractCost(
  currentMoney: { gold: number; silver: number; copper: number },
  itemCost: { gold: number; silver: number; copper: number }
): { success: boolean; newMoney: { gold: number; silver: number; copper: number } } {

  // Dragonbane: Gold is 100 copper (10*10), Silver is 10 copper
  const totalCurrentCopper = currentMoney.gold * 100 + currentMoney.silver * 10 + currentMoney.copper;
  const totalItemCopper = itemCost.gold * 100 + itemCost.silver * 10 + itemCost.copper;

  if (totalCurrentCopper < totalItemCopper) {
    return { success: false, newMoney: currentMoney };
  }

  let remainingCopper = totalCurrentCopper - totalItemCopper;

  // Convert back to Gold (100 copper = 1 gold)
  const newGold = Math.floor(remainingCopper / 100);
  remainingCopper %= 100;

  // Convert remainder to Silver (10 copper = 1 silver)
  const newSilver = Math.floor(remainingCopper / 10);
  remainingCopper %= 10;

  const newCopper = remainingCopper;

  return { success: true, newMoney: { gold: newGold, silver: newSilver, copper: newCopper } };
}
