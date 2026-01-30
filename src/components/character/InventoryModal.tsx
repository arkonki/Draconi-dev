import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Package, Search, ShoppingBag, Coins, Shield, Sword,
    ArrowRight, ArrowLeft, Plus, Scale, X, Edit2, Wrench, Trash2, CheckSquare, MinusCircle,
    Info, Target, Star, Heart, Zap, AlertTriangle, Weight, ChevronDown, ChevronUp,
    Feather, Utensils, MoreVertical, Flame, Anchor, MinusSquare, Minus, Shirt, Backpack,
    Dumbbell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { formatCost, subtractCost, parseCost, normalizeCurrency } from '../../lib/equipment';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Character, InventoryItem, EquippedWeapon, Money } from '../../types/character';
import { useDice } from '../dice/DiceContext';

// --- CONSTANTS ---
const DEFAULT_EQUIPPABLE_CATEGORIES = ["ARMOR & HELMETS", "MELEE WEAPONS", "RANGED WEAPONS", "CLOTHES"];
const CONSUMABLE_KEYWORDS = ['ration', 'food', 'bread', 'meat', 'drink', 'potion', 'elixir', 'salve', 'antidote', 'torch', 'lamp oil', 'tinder', 'bandage', 'kit', 'arrow', 'bolt', 'stone', 'rope', 'chalk', 'parchment', 'ink'];
const MEASUREMENT_UNITS = ['m', 'meter', 'meters', 'ft', 'feet', 'kg', 'l', 'liter', 'liters', 'dose', 'doses'];

const shopGroups = [
    { name: 'Armor & Weapons', categories: ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS'], Icon: Shield },
    { name: 'Clothing', categories: ['CLOTHES'], Icon: Shirt },
    { name: 'Tools & Trade', categories: ['MUSICAL INSTRUMENTS', 'TRADE GOODS', 'TOOLS'], Icon: Wrench },
    { name: 'Magic', categories: ['STUDIES & MAGIC'], Icon: Zap },
    { name: 'Survival', categories: ['LIGHT SOURCES', 'CONTAINERS', 'MEDICINE', 'HUNTING & FISHING', 'MEANS OF TRAVEL'], Icon: Flame },
    { name: 'Services & Mounts', categories: ['SERVICES', 'ANIMALS'], Icon: Anchor }
];

// --- HELPER FUNCTIONS ---

const formatInventoryItemName = (item: InventoryItem): string => {
    return `${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`;
};

const formatCategoryLabel = (cat: string) => {
    return cat
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace('&', '&');
};

const isItemEquippable = (details?: any): boolean => {
    if (details?.equippable === true) return true;
    const cat = details?.category?.toUpperCase();
    return cat ? DEFAULT_EQUIPPABLE_CATEGORIES.includes(cat) : false;
};

const isItemConsumable = (item: InventoryItem, details?: any): boolean => {
    if (details?.is_consumable === true) return true;
    if (isItemEquippable(details)) return false;
    const name = item.name.toLowerCase();
    return CONSUMABLE_KEYWORDS.some(k => name.includes(k));
};

const getStrengthFromCharacter = (character: Character): number | null => {
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

const parsePackName = (name: string, dbQuantity?: number): { name: string, quantity: number } => {
    const packMatch = name.match(/^(.*?)\s*\((\d+)(?:\s*\w*)?\)$/);
    if (packMatch) {
        const itemName = packMatch[1].trim();
        const number = parseInt(packMatch[2], 10);
        const unit = name.match(/\d+\s*([a-zA-Z]+)/)?.[1]?.toLowerCase();
        if (unit && MEASUREMENT_UNITS.includes(unit) && !['dose', 'doses', 'unit', 'units'].includes(unit)) {
            return { name, quantity: dbQuantity || 1 };
        }
        return { name: itemName, quantity: number };
    }
    return { name, quantity: dbQuantity || 1 };
};

const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) { return crypto.randomUUID(); }
    return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const calculateEncumbrance = (character: Character, allGameItems: GameItem[]) => {
    const strength = getStrengthFromCharacter(character);
    const equipment = typeof character.equipment === 'string' ? JSON.parse(character.equipment) : character.equipment;
    if (strength === null || !equipment) return { capacity: 0, load: 0, isEncumbered: false };

    const getItemData = (item: InventoryItem | string) => {
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
        ...(equipment.equipped.armor ? [equipment.equipped.armor] : []),
        ...(equipment.equipped.helmet ? [equipment.equipped.helmet] : []),
        ...(equipment.equipped.weapons?.map((w: EquippedWeapon) => w?.name).filter(Boolean) || []),
        ...(equipment.equipped.wornClothes?.filter(Boolean) || []),
        ...(equipment.equipped.containers?.map((c: InventoryItem) => c?.name).filter(Boolean) || []),
        ...(equipment.equipped.animals?.map((a: InventoryItem) => a?.name).filter(Boolean) || []),
    ];

    // --- CONTAINER LOGIC ---
    const containerStats: Record<string, { id: string, name: string, load: number, capacity: number }> = {};

    // Initialize container stats from equipped containers AND animals
    const allStorageProviders = [
        ...(equipment.equipped.containers || []),
        ...(equipment.equipped.animals || [])
    ];

    allStorageProviders.forEach((c: InventoryItem) => {
        if (!c.id) return;
        const details = getItemData(c);

        // STRICT CHECK: Only treat as a separate storage container if is_container is TRUE.
        if (!(details as any)?.is_container) return;

        let containerCap = 0;
        if (details && details.container_capacity) {
            containerCap = details.container_capacity;
        } else {
            containerCap = 10;
        }

        // SADDLE BAG LOGIC: Check for saddle bags equipped on THIS animal
        const saddleBags = (equipment.equipped.containers || []).filter((sb: InventoryItem) => sb.equippedOn === c.id);
        saddleBags.forEach((sb: InventoryItem) => {
            const sbDetails = getItemData(sb);
            if (sbDetails && (sbDetails as any).encumbrance_modifier) {
                containerCap += Number((sbDetails as any).encumbrance_modifier);
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
        const isStorageContainer = (details as any)?.is_container;

        if (!isStorageContainer && (details as any)?.encumbrance_modifier) {
            capacity += Number((details as any).encumbrance_modifier);
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

        if (details && (Number(details.weight) === 0 || details.weight === "0")) {
            return;
        }

        let weightPerUnit = 1;

        if (details && details.weight !== undefined && details.weight !== null && details.weight !== "") {
            weightPerUnit = Number(details.weight);
            if (!item.weight && details.name) {
                const packMatch = details.name.match(/\((\d+)(?:\s*\w*)?\)/);
                if (packMatch) {
                    const packSize = parseInt(packMatch[1], 10);
                    const unit = details.name.match(/\d+\s*([a-zA-Z]+)/)?.[1]?.toLowerCase();
                    const isMeasurement = unit && MEASUREMENT_UNITS.includes(unit) && !['dose', 'doses', 'unit', 'units'].includes(unit);
                    if (packSize > 0 && !isMeasurement) {
                        weightPerUnit = details.weight / packSize;
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

// FIX: Ensure we don't accidentally merge non-stackable items (like weapons/armor) if they have unique IDs
// But we DO want to stack commodities (torches, rations).
const mergeIntoInventory = (inventory: InventoryItem[], itemToMerge: InventoryItem): InventoryItem[] => {
    // 1. Identify if item is stackable
    // Simple logic: if it has durability or specific stats (like separate IDs for custom items), don't stack.
    // However, for general store logic, we usually stack by name.

    const existingItemIndex = inventory.findIndex(item =>
        item.name === itemToMerge.name &&
        item.containerId === itemToMerge.containerId &&
        item.equippedOn === itemToMerge.equippedOn
    );
    let newInventory = [...inventory];

    if (existingItemIndex > -1) {
        newInventory[existingItemIndex].quantity += itemToMerge.quantity;
    } else {
        newInventory.push({ ...itemToMerge, id: itemToMerge.id || generateId() });
    }
    return newInventory;
};

// --- DISPLAY HELPERS ---

const formatCleanCost = (costStr: string | undefined): string => {
    if (!costStr || costStr === '0') return 'N/A';
    const cost = parseCost(costStr);
    if (!cost) return costStr;

    const parts = [];
    if (cost.gold > 0) parts.push(`${cost.gold} Gold`);
    if (cost.silver > 0) parts.push(`${cost.silver} Silver`);
    if (cost.copper > 0) parts.push(`${cost.copper} Copper`);

    return parts.length > 0 ? parts.join(', ') : 'Free';
};

const getCompactStats = (item: GameItem) => {
    const stats: { label: string, value: string | number, color?: string }[] = [];
    if (item.damage) stats.push({ label: 'Dmg', value: item.damage, color: 'text-red-600' });
    if (item.armor_rating) stats.push({ label: 'AR', value: item.armor_rating, color: 'text-blue-600' });
    if (item.grip) stats.push({ label: 'Grip', value: item.grip });
    if (item.range) stats.push({ label: 'Rng', value: item.range });
    if (item.durability) stats.push({ label: 'Dur', value: item.durability });
    if (item.strength_requirement) stats.push({ label: 'STR', value: item.strength_requirement });
    if (item.weight !== undefined && item.weight !== null) stats.push({ label: 'W', value: item.weight });
    return stats;
};

// --- COMPONENTS ---

const ShopItemCard = ({ item, onBuy }: { item: GameItem, onBuy: (item: GameItem) => void }) => {
    const stats = getCompactStats(item);
    const cleanCost = formatCleanCost(item.cost);
    const featuresList = Array.isArray(item.features) ? item.features.join(', ') : item.features;

    return (
        <div className="flex flex-col p-3 border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white h-full relative group">
            <div className="mb-2">
                <div className="flex justify-between items-start gap-2">
                    <h4 className="font-bold text-sm text-gray-800 leading-tight">{item.name}</h4>
                    {item.skill && <span className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter">{item.skill}</span>}
                </div>
                <p className="text-[10px] text-gray-500 uppercase font-medium">{item.category}</p>
            </div>

            <div className="flex-1 space-y-2 mb-3">
                {stats.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                        {stats.map((stat, i) => (
                            <div key={i} className="flex gap-1 items-center">
                                <span className="text-gray-400 font-bold uppercase text-[9px]">{stat.label}</span>
                                <span className={`font-mono font-medium ${stat.color || 'text-gray-700'}`}>{stat.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {featuresList && (
                    <div className="flex items-start gap-1.5 text-xs text-indigo-700">
                        <Star size={10} className="mt-0.5 flex-shrink-0" />
                        <span className="font-medium leading-tight">{featuresList}</span>
                    </div>
                )}

                {item.effect && (
                    <div className="text-xs text-gray-600 italic leading-snug">{item.effect}</div>
                )}
            </div>

            <div className="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{cleanCost}</span>
                <Button variant="primary" size="sm" onClick={() => onBuy(item)} disabled={!item.cost || cleanCost === 'N/A'} className="h-7 text-xs px-2">Buy</Button>
            </div>
        </div>
    );
};

const LoadoutSlot = ({ icon: Icon, label, item, onUnequip, subItems }: { icon: any, label: string, item?: string | InventoryItem | EquippedWeapon, onUnequip: () => void, subItems?: React.ReactNode }) => {
    // Determine the name safely. For EquippedWeapon, it's just .name
    const name = typeof item === 'string' ? item : item?.name;

    return (
        <div className={`relative flex flex-col p-2 rounded-lg border transition-all ${name ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-200 border-dashed'}`}>
            <div className="flex items-center gap-2 mb-1">
                <div className={`p-1 rounded ${name ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-400'}`}><Icon size={14} /></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
            </div>
            {name ? (
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight pr-4">{name}</span>
                    <button onClick={onUnequip} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors" title="Unequip"><MinusSquare size={14} /></button>
                </div>
            ) : <span className="text-xs text-gray-400 italic">Empty</span>}
            {subItems}
        </div>
    );
};

export const MoneyManagementModal = ({ onClose, currentMoney, onUpdateMoney }: any) => {
    const [gold, setGold] = useState(0); const [silver, setSilver] = useState(0); const [copper, setCopper] = useState(0); const [error, setError] = useState<string | null>(null);
    const handleTransaction = (multiplier: 1 | -1) => {
        setError(null); if (gold === 0 && silver === 0 && copper === 0) { setError("Please enter an amount."); return; }
        const newMoney = { gold: (currentMoney.gold || 0) + (gold * multiplier), silver: (currentMoney.silver || 0) + (silver * multiplier), copper: (currentMoney.copper || 0) + (copper * multiplier) };
        if (newMoney.gold < 0 || newMoney.silver < 0 || newMoney.copper < 0) { setError("Cannot remove more money than is available."); return; }
        onUpdateMoney(normalizeCurrency(newMoney)); onClose();
    };
    const CoinInput = ({ label, value, setter, color }: any) => (
        <div className="flex flex-col items-center"><label className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{label}</label><div className="flex items-center gap-3"><button onClick={() => setter(Math.max(0, value - 1))} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-95 touch-manipulation"><Minus size={20} strokeWidth={3} /></button><div className="w-16 h-12 flex items-center justify-center bg-gray-50 border-2 border-gray-200 rounded-xl"><span className="text-xl font-mono font-bold">{value}</span></div><button onClick={() => setter(value + 1)} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-95 touch-manipulation"><Plus size={20} strokeWidth={3} /></button></div><div className="flex gap-1 mt-2">{[5, 10].map(amt => (<button key={amt} onClick={() => setter(value + amt)} className="px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded text-gray-500 hover:bg-gray-100">+{amt}</button>))}</div></div>
    );
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 overflow-hidden"><div className="p-4 border-b bg-gray-50 flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">Wallet</h3><button onClick={onClose} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"><X size={18} /></button></div><div className="p-6"><div className="mb-8 p-4 bg-yellow-50 border border-yellow-100 text-center rounded-xl shadow-sm"><p className="text-xs text-yellow-700 font-bold uppercase tracking-widest mb-1">Current Balance</p><p className="text-3xl font-serif font-bold text-yellow-900">{formatCost(currentMoney)}</p></div><div className="space-y-6 mb-8"><CoinInput label="Gold" value={gold} setter={setGold} color="text-yellow-600" /><CoinInput label="Silver" value={silver} setter={setSilver} color="text-gray-500" /><CoinInput label="Copper" value={copper} setter={setCopper} color="text-orange-700" /></div>{error && <ErrorMessage message={error} />}<div className="grid grid-cols-2 gap-4"><button onClick={() => handleTransaction(-1)} className="py-4 bg-red-100 text-red-800 font-bold rounded-xl hover:bg-red-200 transition-colors flex items-center justify-center gap-2"><MinusCircle size={20} /> Spend</button><button onClick={() => handleTransaction(1)} className="py-4 bg-green-100 text-green-800 font-bold rounded-xl hover:bg-green-200 transition-colors flex items-center justify-center gap-2"><Plus size={20} /> Add</button></div></div></div></div>
    );
};

const ForageModal = ({ onClose, onAdd }: { onClose: () => void; onAdd: (amount: number) => void; }) => {
    const [amount, setAmount] = useState<number>(1);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]"><div className="bg-white rounded-lg shadow-xl w-full max-w-sm"><div className="p-4 border-b flex justify-between items-center bg-green-50 rounded-t-lg"><h3 className="text-lg font-bold flex items-center gap-2 text-green-800"><Utensils className="w-5 h-5" /> Forage & Hunt</h3><button onClick={onClose} className="p-1 rounded-full hover:bg-green-100 text-green-800"><X size={20} /></button></div><div className="p-6"><p className="text-sm text-gray-600 mb-4">Enter amount of rations obtained.</p><div className="bg-gray-50 p-3 rounded border border-gray-200 text-xs text-gray-500 mb-6 space-y-1"><p><strong>Fishing:</strong> Rod (D4), Net (D6)</p><p><strong>Hunting:</strong> Squirrel/Crow (1), Rabbit (D3), Fox (D4), Boar (2D6), Deer (2D8)</p><p><strong>Foraging:</strong> Mushrooms/Roots (D3)</p></div><div className="flex items-center justify-center gap-4 mb-6"><button onClick={() => setAmount(Math.max(1, amount - 1))} className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"><MinusCircle size={20} /></button><span className="text-3xl font-bold font-mono w-16 text-center">{amount}</span><button onClick={() => setAmount(amount + 1)} className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"><Plus size={20} /></button></div><Button variant="primary" className="w-full bg-green-700 hover:bg-green-800" onClick={() => onAdd(amount)}>Add {amount} Ration{amount !== 1 ? 's' : ''}</Button></div></div></div>
    );
};

// --- MAIN COMPONENT ---

export function InventoryModal({ onClose }: any) {
    const { character: rawCharacter, updateCharacterData } = useCharacterSheetStore();
    const { data: allGameItems = [] } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: () => fetchItems(), staleTime: Infinity });

    // States
    const [activeTab, setActiveTab] = useState<'inventory' | 'shop'>('inventory');

    // Separate Search States
    const [inventorySearch, setInventorySearch] = useState('');
    const [shopSearch, setShopSearch] = useState('');

    const [isMoneyModalOpen, setIsMoneyModalOpen] = useState(false);
    const [isForageModalOpen, setIsForageModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

    // Shop Navigation
    const [selectedShopGroup, setSelectedShopGroup] = useState<any>(null);
    const [activeShopSubCategory, setActiveShopSubCategory] = useState<string | null>(null);

    const [sortOrder, setSortOrder] = useState('name-asc');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [animalSelector, setAnimalSelector] = useState<{ item: InventoryItem, candidates: InventoryItem[] } | null>(null);
    const [activeInventoryTab, setActiveInventoryTab] = useState<string>('main'); // 'main' or containerID

    // Clearing
    const clearInventorySearch = () => setInventorySearch('');
    const clearShopSearch = () => setShopSearch('');

    // Reset sub-category when group changes
    useEffect(() => {
        setActiveShopSubCategory(null);
    }, [selectedShopGroup]);

    useEffect(() => {
        const handleClickOutside = () => setMenuOpenId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const character = useMemo(() => {
        if (!rawCharacter) return null;
        try {
            const equip = typeof rawCharacter.equipment === 'string' ? JSON.parse(rawCharacter.equipment) : rawCharacter.equipment;
            if (!equip.equipped) equip.equipped = {};
            ['weapons', 'wornClothes', 'animals', 'containers'].forEach(key => { if (!equip.equipped[key]) equip.equipped[key] = []; });
            return { ...rawCharacter, attributes: typeof rawCharacter.attributes === 'string' ? JSON.parse(rawCharacter.attributes) : rawCharacter.attributes, equipment: equip };
        } catch (e) { console.error("Failed to parse data:", e); return rawCharacter; }
    }, [rawCharacter]);

    // Smart Item Lookup
    const getItemData = (item: InventoryItem | string) => {
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

    const encumbrance = useMemo(() => (character && allGameItems.length > 0) ? calculateEncumbrance(character, allGameItems) : { capacity: 0, load: 0, isEncumbered: false, containerStats: {} }, [character, allGameItems]);

    if (!character) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><LoadingSpinner /></div>;

    const handleUpdateEquipment = (newEquipment: any) => updateCharacterData({ ...character, equipment: newEquipment });

    // [Actions]
    const handleAddRations = (amount: number) => {
        const rationItem: InventoryItem = { id: generateId(), name: "Field Rations", quantity: amount };
        const existingPlural = character.equipment?.inventory?.find((i: InventoryItem) => i.name === "Field Rations");
        if (existingPlural) rationItem.name = "Field Rations";
        const newInventory = mergeIntoInventory(character.equipment!.inventory!, rationItem);
        handleUpdateEquipment({ ...character.equipment, inventory: newInventory });
        setIsForageModalOpen(false);
    };

    const handleBuyItem = (item: GameItem) => {
        const itemCost = parseCost(item.cost);
        if (!itemCost) return;
        const { success, newMoney } = subtractCost(character.equipment!.money!, itemCost);
        if (!success) return;
        const { name, quantity } = parsePackName(item.name, item.quantity);
        // Ensure we add a brand new item if it's unique equipment
        const newItem = { name, quantity, weight: item.weight, id: generateId() };
        const newInventory = mergeIntoInventory(character.equipment!.inventory!, newItem);
        handleUpdateEquipment({ ...character.equipment, inventory: newInventory, money: newMoney });
    };

    const handleEquipItem = (itemToEquip: InventoryItem) => {
        const itemDetails = getItemData(itemToEquip); if (!itemDetails) return;

        let newEquipment = structuredClone(character.equipment!);
        let inventory = newEquipment.inventory;

        const invItemIndex = inventory.findIndex((i: InventoryItem) => i.id === itemToEquip.id);
        if (invItemIndex === -1) return;

        // Remove ONE count of the item from inventory
        const itemToMove = { ...inventory[invItemIndex], quantity: 1 };

        if (inventory[invItemIndex].quantity > 1) {
            inventory[invItemIndex].quantity -= 1;
        } else {
            inventory.splice(invItemIndex, 1);
        }

        const { category, name } = itemDetails;

        if (category === 'CLOTHES') {
            if (newEquipment.equipped.wornClothes.includes(name)) {
                // Already wearing -> put back in bag
                newEquipment.inventory = mergeIntoInventory(inventory, itemToMove);
                handleUpdateEquipment(newEquipment);
                return;
            }
            newEquipment.equipped.wornClothes.push(name);
        } else if (DEFAULT_EQUIPPABLE_CATEGORIES.includes(category!)) {
            const lowerName = name.toLowerCase();
            const isShield = category === 'ARMOR & HELMETS' && lowerName.includes('shield');
            const isHelmet = category === 'ARMOR & HELMETS' && !isShield && (lowerName.includes('helm') || lowerName.includes('hat') || lowerName.includes('cap') || lowerName.includes('coif'));
            const isArmor = category === 'ARMOR & HELMETS' && !isShield && !isHelmet;
            const isWeapon = category === 'MELEE WEAPONS' || category === 'RANGED WEAPONS' || isShield;

            if (isWeapon) {
                if (newEquipment.equipped.weapons.length >= 3) {
                    // Slots full -> return to inventory
                    newEquipment.inventory = mergeIntoInventory(inventory, itemToMove);
                    handleUpdateEquipment(newEquipment);
                    return;
                }
                newEquipment.equipped.weapons.push({
                    name: itemDetails.name,
                    grip: itemDetails.grip,
                    range: itemDetails.range,
                    damage: itemDetails.damage,
                    durability: itemDetails.durability,
                    features: itemDetails.features
                });
            } else if (isArmor) {
                // Swap Logic: If armor already equipped, move OLD armor to inventory
                if (newEquipment.equipped.armor) {
                    inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.armor, quantity: 1, id: generateId() });
                }
                newEquipment.equipped.armor = name;
            } else if (isHelmet) {
                if (newEquipment.equipped.helmet) {
                    inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.helmet, quantity: 1, id: generateId() });
                }
                newEquipment.equipped.helmet = name;
            }
        } else if (category === 'ANIMALS') {
            newEquipment.equipped.animals.push(itemToMove);
        } else if (category === 'CONTAINERS' || itemDetails.is_container) {
            // Container Logic (Backpacks, Sacks, Chests)

            // 1. Check for duplicate backpacks if it IS a backpack (limit 1 backpack typically?)
            // Actually, keep generous logic: allow multiple if functionality permits, but Dragonbane usually allows 1 backpack.
            // Existing logic:
            if (name.toLowerCase().includes('backpack') && newEquipment.equipped.containers.some((c: InventoryItem) => c?.name?.toLowerCase().includes('backpack'))) {
                newEquipment.inventory = mergeIntoInventory(inventory, itemToMove);
                handleUpdateEquipment(newEquipment);
                return;
            }

            // 2. Saddle Bag Logic (Auto-equip on mount)
            if (name.toLowerCase().includes('saddle bag')) {
                // Find animals that have < 2 saddle bags equipped
                const validAnimals = newEquipment.equipped.animals.filter((a: InventoryItem) => {
                    const bagsOnThisAnimal = newEquipment.equipped.containers.filter((c: InventoryItem) => c.equippedOn === a.id);
                    return bagsOnThisAnimal.length < 2;
                });

                if (validAnimals.length === 0) {
                    alert("You need a mount with available space (max 2 saddle bags per mount) to equip this.");
                    newEquipment.inventory = mergeIntoInventory(inventory, itemToMove);
                    handleUpdateEquipment(newEquipment);
                    return;
                }

                if (validAnimals.length === 1) {
                    // Auto-equip if only 1 valid choice
                    itemToMove.equippedOn = validAnimals[0].id;
                } else if (validAnimals.length > 1) {
                    // Multiple choices: Open Selector Modal
                    // We must revert the inventory change temporarily or handle it in the modal callback.
                    // Easier approach: Don't remove from inventory yet? or remove and hold in state.
                    // Current flow: itemToMove is already removed from inventory array in memory (not saved yet).
                    // We will save the state *without* the item in inventory, but *not yet* in containers.
                    // Wait, if we return here without saving, the removal is lost. 
                    // Let's SAVE the removal from inventory, but hold the item in state.
                    // IF user cancels, we must add it back.

                    setAnimalSelector({ item: itemToMove, candidates: validAnimals });

                    // We save the inventory update (item removed), but we haven't added it to containers yet.
                    // It is "in limbo" inside the modal state.
                    newEquipment.inventory = inventory;
                    handleUpdateEquipment(newEquipment);

                    return; // Stop here, modal handles the rest
                }
            }

            newEquipment.equipped.containers.push(itemToMove);
        }
        newEquipment.inventory = inventory;
        handleUpdateEquipment(newEquipment);
    };

    const handleUnequipItem = (itemName: string, type: 'armor' | 'helmet' | 'weapon' | 'clothing' | 'animal' | 'container', itemId?: string, itemIndex?: number) => {
        let newEquipment = structuredClone(character.equipment!);
        let itemToReturn: InventoryItem | null = { id: itemId || generateId(), name: itemName, quantity: 1 };

        if (type === 'armor' || type === 'helmet') {
            newEquipment.equipped[type] = undefined;
        } else {
            const arrKey = type === 'clothing' ? 'wornClothes' : (type + 's' as 'weapons' | 'animals' | 'containers');
            const arr = newEquipment.equipped[arrKey];
            let findIndex = -1;

            if (itemIndex !== undefined && (type === 'weapon' || type === 'clothing')) {
                findIndex = itemIndex;
            } else if (itemId) {
                findIndex = arr.findIndex((i: any) => i.id === itemId);
            } else {
                findIndex = arr.findIndex((i: any) => (i.name || i) === itemName);
            }

            if (findIndex > -1) {
                const [removed] = arr.splice(findIndex, 1);
                // For weapons/clothing stored as strings, we recreate object. For objects, we strip equippedOn.
                itemToReturn = (typeof removed === 'string') ? itemToReturn : { ...removed, quantity: 1, equippedOn: undefined };

                if (type === 'animal' && itemId) {
                    newEquipment.equipped.containers = newEquipment.equipped.containers.filter((c: InventoryItem) => {
                        if (c.equippedOn === itemId) {
                            newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, c);
                            return false;
                        }
                        return true;
                    });
                }

                // If unequipping a container OR animal, release all items inside it to the main inventory
                if ((type === 'container' || type === 'animal') && itemId) {
                    // 1. Move items stored INSIDE this container/animal back to main inventory
                    newEquipment.inventory = (newEquipment.inventory || []).map((i: InventoryItem) => {
                        if (i.containerId === itemId) {
                            return { ...i, containerId: undefined };
                        }
                        return i;
                    });

                    // 2. If it's an animal, also unequip any attached items (like Saddle Bags)
                    if (type === 'animal') {
                        const keptContainers: InventoryItem[] = [];
                        const returnedContainers: InventoryItem[] = [];

                        newEquipment.equipped.containers.forEach((c: InventoryItem) => {
                            if (c.equippedOn === itemId) {
                                returnedContainers.push({ ...c, equippedOn: undefined });
                            } else {
                                keptContainers.push(c);
                            }
                        });

                        newEquipment.equipped.containers = keptContainers;
                        returnedContainers.forEach((rc: InventoryItem) => {
                            newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, rc);
                        });
                    }
                }
            }
        }
        // CRITICAL: Ensure we move the unequipped item back to inventory safely
        newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, itemToReturn!);
        handleUpdateEquipment(newEquipment);
    };

    const handleUseItem = (itemToUse: InventoryItem) => {
        let newEquipment = structuredClone(character.equipment!);
        const invItemIndex = newEquipment.inventory.findIndex((i: InventoryItem) => i.id === itemToUse.id);
        if (invItemIndex === -1) return;
        if (newEquipment.inventory[invItemIndex].quantity > 1) {
            newEquipment.inventory[invItemIndex].quantity -= 1;
        } else {
            newEquipment.inventory.splice(invItemIndex, 1);
        }
        handleUpdateEquipment(newEquipment);
    };

    const handleDropItem = (itemToDrop: InventoryItem) => { setItemToDelete(itemToDrop); };
    const confirmDropItem = () => { if (itemToDelete) { handleUseItem(itemToDelete); setItemToDelete(null); } };

    // --- NEW CONTAINER MOVE LOGIC ---
    const handleMoveItemToContainer = (itemToMove: InventoryItem, targetContainerId: string | null) => {
        let newEquipment = structuredClone(character.equipment!);
        let inventory = newEquipment.inventory;

        // 1. Find and remove source item
        const invItemIndex = inventory.findIndex((i: InventoryItem) => i.id === itemToMove.id);
        if (invItemIndex === -1) return;

        // Check if just moving 1 or all? For now, let's say "Move All" or we handle quantity splits?
        // Let's assume user wants to move specific stack. 
        // If we want to move partial stack, we'd need a modal. For now, move ENTIRE stack.

        const [movedItem] = inventory.splice(invItemIndex, 1);

        // 2. Update containerId
        if (targetContainerId) {
            movedItem.containerId = targetContainerId;
        } else {
            delete movedItem.containerId; // Move to main inventory
        }

        // 3. Merge back
        newEquipment.inventory = mergeIntoInventory(inventory, movedItem);
        handleUpdateEquipment(newEquipment);
    };

    // --- RENDERERS ---

    const renderLoadout = () => {
        const eq = character.equipment?.equipped;
        if (!eq) return null;
        const clothes = eq.wornClothes || [];
        const backpack = eq.containers?.find(c => c.name.toLowerCase().includes('backpack'));

        return (
            <div className="bg-slate-50 border-b p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
                    <LoadoutSlot icon={Shield} label="Body" item={eq.armor} onUnequip={() => handleUnequipItem(eq.armor!, 'armor')} />
                    <LoadoutSlot icon={Shield} label="Head" item={eq.helmet} onUnequip={() => handleUnequipItem(eq.helmet!, 'helmet')} />
                    {[0, 1, 2].map(idx => (<LoadoutSlot key={idx} icon={Sword} label={`Hand ${idx + 1}`} item={eq.weapons[idx]} onUnequip={() => handleUnequipItem(eq.weapons[idx]?.name, 'weapon', undefined, idx)} />))}
                </div>
                {/* Worn Clothes (Just display chips, not tabs) */}
                {clothes.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mt-2 border-t pt-2 border-gray-100">
                        {clothes.map((c, i) => (<div key={i} className="flex items-center gap-2 px-2 py-1 bg-white border border-blue-100 rounded text-xs whitespace-nowrap text-blue-700"><Shirt size={12} className="text-blue-500" /> <span>{c}</span><button onClick={() => handleUnequipItem(c, 'clothing', undefined, i)} className="text-blue-300 hover:text-red-500"><X size={12} /></button></div>))}
                    </div>
                )}
            </div>
        );
    };

    const renderInventoryRow = (item: InventoryItem, itemDetails: any) => {
        const isEquippable = isItemEquippable(itemDetails);
        const isUsable = isItemConsumable(item, itemDetails);
        const isMenuOpen = menuOpenId === item.id;
        const toggleMenu = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : item.id); };
        const description = itemDetails?.effect || itemDetails?.description;

        // Get valid move targets (equipped containers OR animals THAT ARE STORAGE)
        const allEquippedStorage = [
            ...(character.equipment?.equipped?.containers || []),
            ...(character.equipment?.equipped?.animals || [])
        ];

        const equippedContainers = allEquippedStorage.filter((c: InventoryItem) => {
            const d = getItemData(c);
            return !!(d as any)?.is_container;
        });
        // Filter out the container we are currently in (if any)
        const currentContainerId = item.containerId;
        const moveTargets = equippedContainers.filter((c: InventoryItem) => c.id !== currentContainerId);
        // If we are in a container, we can also move back to "Main Inventory" (which is effectively null containerId)
        const canMoveToMain = !!currentContainerId;

        return (
            <div key={item.id} className="p-3 border border-gray-200 rounded-xl flex flex-col gap-3 bg-white relative shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0 flex-1">
                        <h3 className="font-bold text-sm text-gray-900">{formatInventoryItemName(item)}</h3>

                        <div className="flex flex-wrap gap-2 mt-1.5">
                            {itemDetails?.weight !== undefined && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium" title="Weight">
                                    <Weight size={10} /> {itemDetails.weight}
                                </span>
                            )}

                            {itemDetails?.damage && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold" title="Damage">
                                    <Sword size={10} /> {itemDetails.damage}
                                </span>
                            )}
                            {itemDetails?.armor_rating && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold" title="Armor Rating">
                                    <Shield size={10} /> {itemDetails.armor_rating}
                                </span>
                            )}
                            {itemDetails?.range && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium" title="Range">
                                    <Target size={10} /> {itemDetails.range}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                        {isEquippable ? (
                            <Button variant="secondary" size="sm" icon={CheckSquare} onClick={() => handleEquipItem(item)} className="h-8 text-xs px-3">
                                Equip
                            </Button>
                        ) : isUsable ? (
                            <Button variant="outline" size="sm" icon={MinusCircle} onClick={() => handleUseItem(item)} className="h-8 text-xs px-3">
                                Use
                            </Button>
                        ) : null}

                        <div className="relative">
                            <button onClick={toggleMenu} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <MoreVertical size={16} />
                            </button>
                            {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1 flex flex-col overflow-hidden ring-1 ring-black/5">
                                    {/* Move Actions */}
                                    {(moveTargets.length > 0 || canMoveToMain) && (
                                        <>
                                            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                                                Move To...
                                            </div>
                                            {canMoveToMain && (
                                                <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleMoveItemToContainer(item, null); }} className="w-full text-left px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 font-medium transition-colors">
                                                    <Package size={14} /> Main Inventory
                                                </button>
                                            )}
                                            {moveTargets.map((c: InventoryItem) => (
                                                <button key={c.id} onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleMoveItemToContainer(item, c.id!); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors">
                                                    <Backpack size={14} /> {c.name}
                                                </button>
                                            ))}
                                            <div className="h-px bg-gray-100 my-1"></div>
                                        </>
                                    )}

                                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleDropItem(item); }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium transition-colors"><Trash2 size={14} /> Drop Item</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {description && (
                    <div className="text-xs text-gray-600 leading-relaxed italic border-t border-gray-100 pt-2">
                        {description}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            {isMoneyModalOpen && <MoneyManagementModal onClose={() => setIsMoneyModalOpen(false)} currentMoney={character.equipment?.money || {}} onUpdateMoney={(newMoney: any) => handleUpdateEquipment({ ...character.equipment, money: newMoney })} />}
            {isForageModalOpen && <ForageModal onClose={() => setIsForageModalOpen(false)} onAdd={handleAddRations} />}

            {/* Animal Selector Modal */}
            {animalSelector && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 overflow-hidden animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Equip {animalSelector.item.name} to...</h3>
                        <div className="space-y-2 mb-6">
                            {animalSelector.candidates.map(animal => (
                                <button
                                    key={animal.id}
                                    onClick={() => {
                                        const newItem = { ...animalSelector.item, equippedOn: animal.id };
                                        const eq = structuredClone(character.equipment);
                                        eq.equipped.containers.push(newItem);
                                        handleUpdateEquipment(eq);
                                        setAnimalSelector(null);
                                    }}
                                    className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-lg transition-all flex items-center justify-between group"
                                >
                                    <span className="font-medium text-gray-700 group-hover:text-indigo-700">{animal.name}</span>
                                    <CheckSquare size={16} className="text-gray-300 group-hover:text-indigo-500" />
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full"
                            onClick={() => {
                                // Cancel: Put item back in inventory
                                const eq = structuredClone(character.equipment);
                                eq.inventory = mergeIntoInventory(eq.inventory, animalSelector.item);
                                handleUpdateEquipment(eq);
                                setAnimalSelector(null);
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {itemToDelete && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90] backdrop-blur-sm"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center transform transition-all scale-100"><div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-4 text-red-600"><Trash2 size={28} /></div><h3 className="text-xl font-bold text-gray-900 mb-2">Drop Item?</h3><p className="text-sm text-gray-500 mb-6">Are you sure you want to drop <strong>{itemToDelete.name}</strong>? {itemToDelete.quantity > 1 ? "1 unit will be removed." : "This cannot be undone."}</p><div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setItemToDelete(null)}>Cancel</Button><Button variant="danger" onClick={confirmDropItem}>Confirm</Button></div></div></div>
            )}
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-0 md:p-4 z-50">
                <div className="bg-white md:rounded-2xl w-full md:max-w-4xl h-full md:h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                    <div className="px-4 py-3 border-b flex items-center justify-between bg-white z-20">
                        <div className="flex items-center gap-3"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hidden sm:block"><Package size={20} /></div><div><h2 className="text-lg font-bold text-gray-900 leading-tight">Inventory</h2><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-gray-500 font-medium">{encumbrance.load} / {encumbrance.capacity} Load</span>{encumbrance.isEncumbered && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold">HEAVY</span>}</div></div></div>
                        <div className="flex items-center gap-2"><button onClick={() => setIsMoneyModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold hover:bg-amber-200 transition-colors"><Coins size={14} />{formatCost(character.equipment?.money || {})}</button><div className="h-8 w-px bg-gray-200 mx-1"></div><button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors"><X size={20} /></button></div>
                    </div>
                    <div className="px-4 py-2 bg-white border-b flex gap-2"><button onClick={() => setActiveTab('inventory')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'inventory' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>My Gear</button><button onClick={() => setActiveTab('shop')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'shop' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>Shop</button></div>
                    <div className="flex-1 overflow-y-auto bg-gray-50/50 relative">
                        {activeTab === 'inventory' && (
                            <div className="pb-20">
                                {renderLoadout()}

                                {/* STORAGE TABS */}
                                <div className="px-4 pb-0 pt-2 bg-slate-50 border-b border-gray-200 overflow-x-auto flex gap-2 no-scrollbar">
                                    <button
                                        onClick={() => setActiveInventoryTab('main')}
                                        className={`flex items-center gap-2 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${activeInventoryTab === 'main' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'}`}
                                    >
                                        <Package size={14} /> Main Inventory
                                    </button>

                                    {/* Render tabs for all storage providers (Containers + Animals) */}
                                    {(() => {
                                        const eq = character.equipment?.equipped;
                                        // Filter for actual STORAGE containers + Animals
                                        const storageTabs = [
                                            ...(eq?.containers || []),
                                            ...(eq?.animals || [])
                                        ].filter(c => {
                                            const d = getItemData(c);
                                            return !!(d as any)?.is_container;
                                        });

                                        return storageTabs.map(tab => {
                                            const isActive = activeInventoryTab === tab.id;
                                            const unequipType = eq?.animals?.some((a: InventoryItem) => a.id === tab.id) ? 'animal' : 'container';

                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveInventoryTab(tab.id!)}
                                                    className={`group relative flex items-center gap-2 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-all pr-8 ${isActive ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'}`}
                                                >
                                                    {unequipType === 'animal' ? <Anchor size={14} /> : <Backpack size={14} />}
                                                    {tab.name}
                                                    <div
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm(`Unequip ${tab.name}? Items inside will be moved to Main Inventory.`)) {
                                                                handleUnequipItem(tab.name, unequipType, tab.id);
                                                                if (isActive) setActiveInventoryTab('main');
                                                            }
                                                        }}
                                                        className={`absolute right-1 p-1 rounded-full hover:bg-red-100 hover:text-red-600 ${isActive ? 'text-indigo-400' : 'text-gray-300'}`}
                                                    >
                                                        <X size={12} />
                                                    </div>
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>

                                <div className="p-4">
                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <input
                                            type="text"
                                            placeholder="Filter my items..."
                                            value={inventorySearch}
                                            onChange={(e) => setInventorySearch(e.target.value)}
                                            className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none touch-manipulation"
                                        />
                                        {inventorySearch && (
                                            <button onClick={clearInventorySearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {(() => {
                                            const allItems = (character.equipment?.inventory || []).filter(item => item?.name && item.name.toLowerCase().includes(inventorySearch.toLowerCase()));

                                            // FILTER LIST BASED ON ACTIVE TAB
                                            const currentItems = allItems.filter(item => {
                                                if (activeInventoryTab === 'main') return !item.containerId;
                                                return item.containerId === activeInventoryTab;
                                            });

                                            // Get stats for current tab
                                            let currentStats = { load: encumbrance.load, capacity: encumbrance.capacity };
                                            if (activeInventoryTab !== 'main') {
                                                currentStats = encumbrance.containerStats?.[activeInventoryTab] || { load: 0, capacity: 10 };
                                            }

                                            return (
                                                <>
                                                    {/* Context Header for Current View */}
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                            {activeInventoryTab === 'main' ? "Items Carried" : "Container Contents"}
                                                        </h3>
                                                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentStats.load > currentStats.capacity ? 'bg-red-50 text-red-600 border-red-100' : 'bg-white text-gray-500 border-gray-200'}`}>
                                                            LOAD: {currentStats.load} / {currentStats.capacity}
                                                        </div>
                                                    </div>

                                                    {currentItems.length === 0 ? (
                                                        <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-lg">
                                                            <p className="text-gray-300 text-sm italic">Empty</p>
                                                            {activeInventoryTab !== 'main' && (
                                                                <p className="text-[10px] text-gray-400 mt-1">Move items here using the item menu.</p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const tinyItems: InventoryItem[] = [];
                                                            const carriedItems: InventoryItem[] = [];
                                                            currentItems.forEach(item => {
                                                                const details = getItemData(item);
                                                                if (details && (Number(details.weight) === 0 || details.weight === "0")) {
                                                                    tinyItems.push(item);
                                                                } else {
                                                                    carriedItems.push(item);
                                                                }
                                                            });

                                                            return (
                                                                <div className="space-y-3">
                                                                    {carriedItems.map(item => renderInventoryRow(item, getItemData(item)))}

                                                                    {tinyItems.length > 0 && (
                                                                        <div className="mt-6 pt-4 border-t border-gray-100">
                                                                            <h4 className="font-bold text-[10px] text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                                                <Feather size={12} /> Tiny Items <span className="text-gray-300 font-normal normal-case ml-auto">{tinyItems.length} items</span>
                                                                            </h4>
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                                {tinyItems.map(item => renderInventoryRow(item, getItemData(item)))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'shop' && (
                            <div className="p-4 min-h-full flex flex-col">

                                {/* Universal Shop Search Bar */}
                                <div className="relative mb-6 flex-shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder="Search everything in shop..."
                                        value={shopSearch}
                                        onChange={(e) => setShopSearch(e.target.value)}
                                        className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none touch-manipulation"
                                    />
                                    {shopSearch && (
                                        <button onClick={clearShopSearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Search Results (Global) */}
                                {shopSearch ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {allGameItems
                                            .filter(item => !item.is_custom && item.name.toLowerCase().includes(shopSearch.toLowerCase()))
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map(item => <ShopItemCard key={item.id} item={item} onBuy={handleBuyItem} />)
                                        }
                                        {allGameItems.filter(item => !item.is_custom && item.name.toLowerCase().includes(shopSearch.toLowerCase())).length === 0 && (
                                            <div className="col-span-full text-center py-10 text-gray-400">
                                                <Search size={32} className="mx-auto mb-2 opacity-30" />
                                                <p>No items found matching "{shopSearch}"</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // Browse Mode (Categories)
                                    <>
                                        {!selectedShopGroup ? (
                                            // Main Categories Grid
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                {shopGroups.map(g => (
                                                    <button
                                                        key={g.name}
                                                        onClick={() => setSelectedShopGroup(g)}
                                                        className="flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all group active:scale-95"
                                                    >
                                                        <g.Icon className="w-8 h-8 text-gray-400 group-hover:text-indigo-600 mb-3 transition-colors" />
                                                        <span className="font-bold text-gray-700 text-sm text-center">{g.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            // Selected Category View
                                            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-200">

                                                {/* Header & Back Button */}
                                                <div className="flex items-center gap-3 mb-4">
                                                    <button onClick={() => setSelectedShopGroup(null)} className="p-2 bg-white border rounded-lg hover:bg-gray-50 text-gray-600">
                                                        <ArrowLeft size={18} />
                                                    </button>
                                                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                                        <selectedShopGroup.Icon size={20} className="text-indigo-600" />
                                                        {selectedShopGroup.name}
                                                    </h3>
                                                </div>

                                                {/* Sub-Category Filter Tabs */}
                                                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                                                    <button
                                                        onClick={() => setActiveShopSubCategory(null)}
                                                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${!activeShopSubCategory ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                                    >
                                                        All
                                                    </button>
                                                    {selectedShopGroup.categories.map((cat: string) => (
                                                        <button
                                                            key={cat}
                                                            onClick={() => setActiveShopSubCategory(cat)}
                                                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${activeShopSubCategory === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                                        >
                                                            {formatCategoryLabel(cat)}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Sorting & Results */}
                                                <div className="flex justify-end mb-3">
                                                    <div className="relative">
                                                        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="appearance-none bg-transparent text-xs font-bold text-gray-500 py-1 pr-6 focus:outline-none cursor-pointer">
                                                            <option value="name-asc">Name (A-Z)</option>
                                                            <option value="name-desc">Name (Z-A)</option>
                                                            <option value="cost-asc">Price (Low)</option>
                                                            <option value="cost-desc">Price (High)</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-20">
                                                    {allGameItems
                                                        .filter(item => {
                                                            if (item.is_custom) return false;
                                                            // Filter by Group Categories
                                                            if (!selectedShopGroup.categories.includes(item.category?.toUpperCase())) return false;
                                                            // Filter by specific sub-category tab if active
                                                            if (activeShopSubCategory && item.category?.toUpperCase() !== activeShopSubCategory) return false;
                                                            return true;
                                                        })
                                                        .sort((a, b) => {
                                                            const costA = parseCost(a.cost)?.totalCopper || 0;
                                                            const costB = parseCost(b.cost)?.totalCopper || 0;
                                                            switch (sortOrder) {
                                                                case 'cost-asc': return costA - costB;
                                                                case 'cost-desc': return costB - costA;
                                                                case 'name-desc': return b.name.localeCompare(a.name);
                                                                case 'name-asc': default: return a.name.localeCompare(b.name);
                                                            }
                                                        })
                                                        .map(item => <ShopItemCard key={item.id} item={item} onBuy={handleBuyItem} />)
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* --- FLOATING ACTION BUTTON --- */}
                    {activeTab === 'inventory' && (
                        <div className="absolute bottom-6 right-6 z-50">
                            <button onClick={() => setIsForageModalOpen(true)} className="flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-full shadow-lg hover:bg-green-700 transition-transform hover:scale-105 active:scale-95 font-bold">
                                <Utensils size={18} /> Forage
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}