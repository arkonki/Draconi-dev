import { InventoryItem } from '../types/character';
import { GameItem } from './api/items'; // Assuming GameItem has details like weight, cost, category etc.

/**
 * Parses an item string (e.g., "4 Field Rations", "Rope 10 meters") into an InventoryItem object.
 * @param itemString The string to parse.
 * @param allGameItems Optional array of all game items to look up details.
 * @returns An InventoryItem object.
 */
export function parseItemString(itemString: string, allGameItems?: GameItem[]): InventoryItem {
  const originalName = itemString.trim();
  let name = originalName;
  let quantity = 1;
  let unit: string | undefined = undefined;

  // Regex attempts:
  // 1. Number at the start: "4 Field Rations" -> quantity=4, name="Field Rations"
  const matchStartNum = originalName.match(/^(\d+)\s+(.*)/);
  // 2. Number at the end, possibly with unit: "Rope 10 meters", "Arrows 20"
  const matchEndNumUnit = originalName.match(/^(.*?)\s+(\d+)\s*(\w+)?$/);

  if (matchStartNum) {
    quantity = parseInt(matchStartNum[1], 10);
    name = matchStartNum[2].trim();
    // Check if the remaining name *also* ends in a number/unit (e.g., "10 Arrows 20") - less common
    const nestedMatch = name.match(/^(.*?)\s+(\d+)\s*(\w+)?$/);
    if (nestedMatch) {
        // This case is ambiguous, prioritize the start number for quantity
        // but maybe log a warning. Let's assume "10 Arrows 20" means 10 items called "Arrows 20" for now.
        console.warn(`Ambiguous item string: "${originalName}". Using quantity ${quantity} for name "${name}".`);
    }
  } else if (matchEndNumUnit) {
    name = matchEndNumUnit[1].trim();
    quantity = parseInt(matchEndNumUnit[2], 10);
    unit = matchEndNumUnit[3]?.trim(); // Capture unit if present
  }

  // Attempt to find matching game data based on the parsed base 'name'
  const gameItemDetails = allGameItems?.find(item => item.name?.toLowerCase() === name.toLowerCase());

  return {
    name: name, // Base name
    quantity: quantity,
    unit: unit,
    originalName: originalName, // Store the original full string
    // Populate details from game data if found
    description: gameItemDetails?.description,
    weight: gameItemDetails?.weight,
    cost: gameItemDetails?.cost,
    category: gameItemDetails?.category,
    damage: gameItemDetails?.damage,
    armor_rating: gameItemDetails?.armor_rating,
    grip: gameItemDetails?.grip,
    range: gameItemDetails?.range,
    durability: gameItemDetails?.durability,
    features: gameItemDetails?.features,
    effect: gameItemDetails?.effect,
    // Generate a simple unique ID for client-side key prop usage if needed
    id: `${name}-${Date.now()}-${Math.random()}`
  };
}

/**
 * Formats an InventoryItem back into a display string.
 * @param item The InventoryItem object.
 * @returns A formatted string (e.g., "Field Ration (x4)", "Rope (Hemp) (10 meters)").
 */
export function formatInventoryItemName(item: InventoryItem): string {
    let details = '';
    if (item.quantity > 1) {
        details = ` (x${item.quantity}${item.unit ? ' ' + item.unit : ''})`;
    } else if (item.unit) {
        // Show unit even for quantity 1 if it exists
        details = ` (${item.quantity} ${item.unit})`;
    }
    return `${item.name}${details}`;
}

/**
 * Merges an item into an existing inventory list, incrementing quantity if the base name matches.
 * @param inventory The current inventory array.
 * @param itemToAdd The InventoryItem object to add or merge.
 * @returns A new inventory array with the item added or merged.
 */
export function mergeIntoInventory(inventory: InventoryItem[], itemToAdd: InventoryItem): InventoryItem[] {
    const existingItemIndex = inventory.findIndex(invItem =>
        invItem.name.toLowerCase() === itemToAdd.name.toLowerCase() &&
        invItem.unit === itemToAdd.unit // Ensure units match for merging
    );

    if (existingItemIndex > -1) {
        // Item exists, increment quantity
        const newInventory = [...inventory];
        const existingItem = newInventory[existingItemIndex];
        newInventory[existingItemIndex] = {
            ...existingItem,
            quantity: existingItem.quantity + itemToAdd.quantity,
            // Update originalName? Maybe keep the first one or the latest? Let's keep first.
            // Or maybe generate a new one? Let's regenerate based on new quantity.
            originalName: `${itemToAdd.quantity > 1 ? itemToAdd.quantity + ' ' : ''}${existingItem.name}${itemToAdd.unit ? ' ' + itemToAdd.unit : ''}`.trim() // Simplistic regeneration
        };
        return newInventory;
    } else {
        // Item doesn't exist, add it
        return [...inventory, itemToAdd];
    }
}
