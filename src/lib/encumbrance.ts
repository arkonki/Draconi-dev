import type { Character, InventoryItem, EquippedItems } from '../types/character';
import type { GameItem } from './api/items';

export interface Encumbrance {
    capacity: number;
    load: number;
    isEncumbered: boolean;
    containerStats: Record<string, { id: string; name: string; load: number; capacity: number }>;
}

type EncumbranceItemDetails = Partial<Pick<GameItem, 'name' | 'weight' | 'is_container' | 'container_capacity'>> & {
    encumbrance_modifier?: unknown;
};

const MEASUREMENT_UNITS = ['m', 'meter', 'meters', 'ft', 'feet', 'kg', 'l', 'liter', 'liters', 'dose', 'doses'];

export const getStrengthFromCharacter = (character: Character): number | null => {
    if (!character?.attributes) return null;
    let attributes = character.attributes;
    if (typeof attributes === 'string') { try { attributes = JSON.parse(attributes); } catch { return null; } }
    return (typeof attributes?.STR === 'number') ? attributes.STR : null;
};

const parseComplexItemName = (name: string): { baseName: string, quantity: number | null, unit: string | null } => {
    if (!name) return { baseName: '', quantity: null, unit: null };
    const bracketRegex = /^(.*)\s\((\d+)\)$/;
    const unitRegex = /^(.*)\s(\d+)\s([a-zA-Z\s]+)$/;
    let match = name.match(bracketRegex);
    if (match) return { baseName: match[1].trim(), quantity: parseInt(match[2]), unit: null };
    match = name.match(unitRegex);
    if (match) return { baseName: match[1].trim(), quantity: parseInt(match[2]), unit: match[3].trim() };
    return { baseName: name, quantity: null, unit: null };
};

// Shared by the inventory and movement warning so both report the same load.
export const calculateEncumbrance = (character: Character | null, allGameItems: GameItem[]): Encumbrance => {
    if (!character) return { capacity: 0, load: 0, isEncumbered: false, containerStats: {} };
    const strength = getStrengthFromCharacter(character);
    let equipment: Character['equipment'];
    try {
        equipment = typeof character.equipment === 'string' ? JSON.parse(character.equipment) : character.equipment;
    } catch {
        return { capacity: 0, load: 0, isEncumbered: false, containerStats: {} };
    }
    if (strength === null || !equipment) return { capacity: 0, load: 0, isEncumbered: false, containerStats: {} };
    const equipped: Partial<EquippedItems> = equipment.equipped || {};

    const getItemData = (item: InventoryItem | string): EncumbranceItemDetails | undefined => {
        const name = typeof item === 'string' ? item : item.name;
        if (!name) return undefined;

        const parsedQuery = parseComplexItemName(name);
        const searchName = parsedQuery.baseName || name;
        const staticDetails = allGameItems.find(i =>
            i.name?.toLowerCase() === searchName.toLowerCase() ||
            parseComplexItemName(i.name).baseName.toLowerCase() === searchName.toLowerCase()
        );
        if (typeof item !== 'string') { return { ...staticDetails, ...item }; }
        return staticDetails;
    };

    let capacity = Math.ceil(strength / 2);

    const allEquippedItems = [
        ...(equipped.armor ? [equipped.armor] : []),
        ...(equipped.helmet ? [equipped.helmet] : []),
        ...(equipped.weapons?.map(w => w?.name).filter(Boolean) || []),
        ...(equipped.wornClothes?.filter(Boolean) || []),
        ...(equipped.containers?.map((c: InventoryItem) => c?.name).filter(Boolean) || []),
        ...(equipped.animals?.map((a: InventoryItem) => a?.name).filter(Boolean) || []),
    ];

    // --- CONTAINER LOGIC ---
    const containerStats: Record<string, { id: string, name: string, load: number, capacity: number }> = {};

    // Initialize container stats from equipped containers AND animals
    const allStorageProviders = [
        ...(equipped.containers || []),
        ...(equipped.animals || [])
    ];

    allStorageProviders.forEach((c: InventoryItem) => {
        if (!c.id) return;
        const details = getItemData(c);

        // STRICT CHECK: Only treat as a separate storage container if is_container is TRUE.
        if (!details?.is_container) return;

        let containerCap = 0;
        if (details && details.container_capacity) {
            containerCap = details.container_capacity;
        } else {
            containerCap = 10;
        }

        // SADDLE BAG LOGIC: Check for saddle bags equipped on THIS animal
        const saddleBags = (equipped.containers || []).filter((sb: InventoryItem) => sb.equippedOn === c.id);
        saddleBags.forEach((sb: InventoryItem) => {
            const sbDetails = getItemData(sb);
            const modifier = Number(sbDetails?.encumbrance_modifier ?? 0);
            if (modifier) {
                containerCap += modifier;
            }
        });

        containerStats[c.id] = {
            id: c.id,
            name: c.name,
            load: 0,
            capacity: containerCap
        };
    });


    // --- MAIN CAPACITY ---
    allEquippedItems.forEach(itemName => {
        const details = getItemData(itemName);
        // If it is strictly a container (is_container=true), it does NOT add to main capacity
        // If it is NOT a container (e.g. Backpack with is_container=false), it SHOULD add encumbrance_modifier
        const isStorageContainer = details?.is_container;
        const modifier = Number(details?.encumbrance_modifier ?? 0);
        if (!isStorageContainer && modifier) {
            capacity += modifier;
        }
    });

    let load = 0;
    let rationCount = 0;

    (equipment.inventory || []).forEach((item: InventoryItem) => {
        if (!item || !item.name) return;

        // CHECK CONTAINER
        if (item.containerId) {
            if (containerStats[item.containerId]) {
                // Add to specific container load
                // Usually items in containers count as '1 slot' or 'weight'. 
                // Dragonbane rules usually simple: 1 item = 1 slot. Tiny items don't count?
                // Reuse weight logic or simple quantity?
                // Let's reuse "weightPerUnit" logic for consistency.

                const details = getItemData(item);
                let w = 1; // Default 1 slot
                if (details && (Number(details.weight) === 0 || String(details.weight) === "0")) {
                    w = 0;
                } else if (details?.weight) {
                    w = Number(details.weight);
                }

                // Rations in backpack? 
                if (item.name.toLowerCase().includes('ration')) {
                    // Rations usually 1/4 slot?
                    w = 0.25;
                }

                containerStats[item.containerId].load += (w * (item.quantity || 1));
            }
            return; // Don't add to main load
        }

        if (item.name.toLowerCase().includes('ration')) {
            rationCount += (item.quantity || 1);
            return;
        }

        const details = getItemData(item);

        if (details && (Number(details.weight) === 0 || String(details.weight) === "0")) {
            return;
        }

        let weightPerUnit = 1;

        if (details && details.weight !== undefined && details.weight !== null && String(details.weight) !== "") {
            weightPerUnit = Number(details.weight);
            if (!item.weight && details.name) {
                const packMatch = details.name.match(/\((\d+)(?:\s*\w*)?\)/);
                if (packMatch) {
                    const packSize = parseInt(packMatch[1], 10);
                    const unit = details.name.match(/\d+\s*([a-zA-Z]+)/)?.[1]?.toLowerCase();
                    const isMeasurement = unit && MEASUREMENT_UNITS.includes(unit) && !['dose', 'doses', 'unit', 'units'].includes(unit);
                    if (packSize > 0 && !isMeasurement) {
                        weightPerUnit = Number(details.weight) / packSize;
                    }
                }
            }
        }
        load += weightPerUnit * (item.quantity || 1);
    });

    if (rationCount > 0) {
        load += Math.ceil(rationCount / 4);
    }

    // Round container loads for display cleanliness
    Object.keys(containerStats).forEach(key => containerStats[key].load = Math.ceil(containerStats[key].load * 10) / 10);

    return {
        capacity,
        load,
        isEncumbered: load > capacity,
        containerStats
    };
};
