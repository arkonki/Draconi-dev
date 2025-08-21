import { GameItem, findItemByName as findItemByNameApi } from './api/items'; // Import from the new API file

// Keep the findEquipment function using the API call for now
// Note: This is async. Components using it might need adjustment.
export async function findEquipment(name: string): Promise<GameItem | null> {
  return findItemByNameApi(name);
}

// --- Utility Functions - Ensure these are exported ---

// Parse cost string (e.g., "2 gold, 5 silver") into an object
export function parseCost(costString: string | undefined | null): { gold: number; silver: number; copper: number } {
  const cost = { gold: 0, silver: 0, copper: 0 };
  if (!costString || typeof costString !== 'string') return cost;

  const parts = costString.toLowerCase().split(/,\s*|\s+/); // Split by comma or space

  for (let i = 0; i < parts.length; i++) {
    const value = parseInt(parts[i]);
    if (!isNaN(value) && i + 1 < parts.length) {
      const unit = parts[i + 1];
      if (unit.startsWith('gold') || unit.startsWith('g')) {
        cost.gold = value;
        i++; // Skip the unit part
      } else if (unit.startsWith('silver') || unit.startsWith('s')) {
        cost.silver = value;
        i++; // Skip the unit part
      } else if (unit.startsWith('copper') || unit.startsWith('c')) {
        cost.copper = value;
        i++; // Skip the unit part
      }
    }
  }
  return normalizeCurrency(cost); // Normalize after parsing
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

// Normalize currency values (e.g., 110 copper -> 1 silver, 10 copper)
export function normalizeCurrency(money: { gold: number; silver: number; copper: number }): { gold: number; silver: number; copper: number } {
  let { gold, silver, copper } = money;
  silver += Math.floor(copper / 100);
  copper %= 100;
  gold += Math.floor(silver / 100);
  silver %= 100;
  return { gold, silver, copper };
}


// Function to subtract cost (returns true if affordable, false otherwise)
export function subtractCost(
  currentMoney: { gold: number; silver: number; copper: number },
  itemCost: { gold: number; silver: number; copper: number }
): { success: boolean; newMoney: { gold: number; silver: number; copper: number } } {

  const totalCurrentCopper = currentMoney.gold * 10000 + currentMoney.silver * 100 + currentMoney.copper;
  const totalItemCopper = itemCost.gold * 10000 + itemCost.silver * 100 + itemCost.copper;

  if (totalCurrentCopper < totalItemCopper) {
    return { success: false, newMoney: currentMoney };
  }

  let remainingCopper = totalCurrentCopper - totalItemCopper;

  const newGold = Math.floor(remainingCopper / 10000);
  remainingCopper %= 10000;
  const newSilver = Math.floor(remainingCopper / 100);
  remainingCopper %= 100;
  const newCopper = remainingCopper;

  return { success: true, newMoney: { gold: newGold, silver: newSilver, copper: newCopper } };
}
