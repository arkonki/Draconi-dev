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

const isItemEquippable = (details?: any): boolean => {
    if (details?.equippable === true) return true;
    return details?.category ? DEFAULT_EQUIPPABLE_CATEGORIES.includes(details.category) : false;
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
        if (typeof item !== 'string' && (item as any).weight !== undefined) { return { ...staticDetails, ...item }; }
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
    allEquippedItems.forEach(itemName => { const details = getItemData(itemName); if (details?.encumbrance_modifier) { capacity += details.encumbrance_modifier; } });
    let load = 0;
    let rationCount = 0;
    (equipment.inventory || []).forEach((item: InventoryItem) => { 
        if (!item || !item.name) return;
        if (item.name.toLowerCase().includes('ration')) { rationCount += (item.quantity || 1); return; }
        const details = getItemData(item);
        if (details && Number(details.weight) === 0) return;
        let weightPerUnit = 1; 
        if (details && details.weight !== undefined) {
            weightPerUnit = Number(details.weight);
            if (!item.weight && details.name) { 
                const packMatch = details.name.match(/\((\d+)(?:\s*\w*)?\)/);
                if (packMatch) {
                    const packSize = parseInt(packMatch[1], 10);
                    const unit = details.name.match(/\d+\s*([a-zA-Z]+)/)?.[1]?.toLowerCase();
                    const isMeasurement = unit && MEASUREMENT_UNITS.includes(unit) && !['dose', 'doses', 'unit', 'units'].includes(unit);
                    if (packSize > 0 && !isMeasurement) { weightPerUnit = details.weight / packSize; }
                }
            }
        }
        load += weightPerUnit * (item.quantity || 1); 
    });
    if (rationCount > 0) { load += Math.ceil(rationCount / 4); }
    return { capacity, load, isEncumbered: load > capacity };
};

const mergeIntoInventory = (inventory: InventoryItem[], itemToMerge: InventoryItem): InventoryItem[] => {
    const existingItemIndex = inventory.findIndex(item => item.name === itemToMerge.name);
    let newInventory = [...inventory];
    if (existingItemIndex > -1) { newInventory[existingItemIndex].quantity += itemToMerge.quantity; } else { newInventory.push({ ...itemToMerge, id: itemToMerge.id || generateId() }); }
    return newInventory;
};

// --- DISPLAY HELPERS ---

const formatCleanCost = (costStr: string | undefined): string => {
    if (!costStr) return 'N/A';
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
    if (item.range) stats.push({ label: 'Range', value: item.range });
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
        <div className="flex flex-col p-3 border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white h-full">
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
                <Button variant="primary" size="xs" onClick={() => onBuy(item)} disabled={!item.cost || cleanCost === 'N/A'} className="h-7">Buy</Button>
            </div>
        </div>
    );
};

const StatBadge = ({ icon: Icon, value, color, label }: { icon: any, value: string | number, color: string, label?: string }) => (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${color}`}>
        <Icon size={10} strokeWidth={3} />
        <span>{value}</span>
        {label && <span className="opacity-70 ml-0.5">{label}</span>}
    </div>
);

const LoadoutSlot = ({ icon: Icon, label, item, onUnequip, subItems }: { icon: any, label: string, item?: string | InventoryItem | EquippedWeapon, onUnequip: () => void, subItems?: React.ReactNode }) => {
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
  const [isEquippedOpen, setIsEquippedOpen] = useState(true);
  const { character: rawCharacter, updateCharacterData, isSaving } = useCharacterSheetStore();
  const { data: allGameItems = [] } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });
  
  const [activeTab, setActiveTab] = useState<'inventory' | 'shop'>('inventory');
  const [filters, setFilters] = useState({ search: '' });
  const [isMoneyModalOpen, setIsMoneyModalOpen] = useState(false);
  const [isForageModalOpen, setIsForageModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [selectedShopGroup, setSelectedShopGroup] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const clearSearch = () => setFilters({ ...filters, search: '' });

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
      const staticDetails = allGameItems.find(i => i.name?.toLowerCase() === searchName.toLowerCase() || parseComplexItemName(i.name).baseName.toLowerCase() === searchName.toLowerCase());
      if (typeof item !== 'string') { return { ...staticDetails, ...item }; }
      return staticDetails;
  };

  const encumbrance = useMemo(() => (character && allGameItems.length > 0) ? calculateEncumbrance(character, allGameItems) : { capacity: 0, load: 0, isEncumbered: false }, [character, allGameItems]);
  const hasValidStrength = useMemo(() => character?.attributes && typeof character.attributes.STR === 'number', [character]);

  if (!character) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><LoadingSpinner /></div>;

  const handleUpdateEquipment = (newEquipment: any) => updateCharacterData({ ...character, equipment: newEquipment });

  const handleAddRations = (amount: number) => {
      const rationItem: InventoryItem = { id: generateId(), name: "Field rations", quantity: amount };
      const existingPlural = character.equipment?.inventory?.find((i: InventoryItem) => i.name === "Field rations");
      if(existingPlural) rationItem.name = "Field rations";
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
      const itemToMove = { ...inventory[invItemIndex], quantity: 1 };
      if (inventory[invItemIndex].quantity > 1) inventory[invItemIndex].quantity -= 1;
      else inventory.splice(invItemIndex, 1);
      const { category, name } = itemDetails;
      if (category === 'CLOTHES') {
          if (newEquipment.equipped.wornClothes.includes(name)) { newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
          newEquipment.equipped.wornClothes.push(name);
      } else if (DEFAULT_EQUIPPABLE_CATEGORIES.includes(category!)) {
          const lowerName = name.toLowerCase();
          const isShield = category === 'ARMOR & HELMETS' && lowerName.includes('shield');
          const isHelmet = category === 'ARMOR & HELMETS' && !isShield && (lowerName.includes('helm') || lowerName.includes('hat') || lowerName.includes('cap') || lowerName.includes('coif'));
          const isArmor = category === 'ARMOR & HELMETS' && !isShield && !isHelmet;
          const isWeapon = category === 'MELEE WEAPONS' || category === 'RANGED WEAPONS' || isShield;
          if (isWeapon) {
              if (newEquipment.equipped.weapons.length >= 3) { newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
              newEquipment.equipped.weapons.push({ name: itemDetails.name, grip: itemDetails.grip, range: itemDetails.range, damage: itemDetails.damage, durability: itemDetails.durability, features: itemDetails.features });
          } else if (isArmor) {
              if (newEquipment.equipped.armor) inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.armor, quantity: 1, id: generateId() });
              newEquipment.equipped.armor = name;
          } else if (isHelmet) {
              if (newEquipment.equipped.helmet) inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.helmet, quantity: 1, id: generateId() });
              newEquipment.equipped.helmet = name;
          }
      } else if (category === 'ANIMALS') { newEquipment.equipped.animals.push(itemToMove);
      } else if (category === 'CONTAINERS') {
          if(name.toLowerCase().includes('backpack') && newEquipment.equipped.containers.some((c:InventoryItem) => c?.name?.toLowerCase().includes('backpack'))) { newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
          if(name.toLowerCase().includes('saddle bag')){
              const animalWithSpace = newEquipment.equipped.animals.find((a:InventoryItem) => newEquipment.equipped.containers.filter((c:InventoryItem) => c.equippedOn === a.id).length < 2);
              if(!animalWithSpace) { newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
              itemToMove.equippedOn = animalWithSpace.id;
          }
          newEquipment.equipped.containers.push(itemToMove);
      }
      newEquipment.inventory = inventory;
      handleUpdateEquipment(newEquipment);
  };
  const handleUnequipItem = (itemName: string, type: 'armor' | 'helmet' | 'weapon' | 'clothing' | 'animal' | 'container', itemId?: string, itemIndex?: number) => {
      let newEquipment = structuredClone(character.equipment!);
      let itemToReturn: InventoryItem | null = { id: itemId || generateId(), name: itemName, quantity: 1 };
      if (type === 'armor' || type === 'helmet') { newEquipment.equipped[type] = undefined; } 
      else {
          const arrKey = type === 'clothing' ? 'wornClothes' : (type + 's' as 'weapons' | 'animals' | 'containers');
          const arr = newEquipment.equipped[arrKey];
          let findIndex = -1;
          if (itemIndex !== undefined && (type === 'weapon' || type === 'clothing')) { findIndex = itemIndex; } 
          else if(itemId) { findIndex = arr.findIndex((i: any) => i.id === itemId); } 
          else { findIndex = arr.findIndex((i: any) => (i.name || i) === itemName); }
          if (findIndex > -1) { 
              const [removed] = arr.splice(findIndex, 1);
              itemToReturn = (typeof removed === 'string') ? itemToReturn : { ...removed, quantity: 1, equippedOn: undefined };
              if (type === 'animal' && itemId) {
                  newEquipment.equipped.containers = newEquipment.equipped.containers.filter((c: InventoryItem) => {
                      if (c.equippedOn === itemId) { newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, c); return false; }
                      return true;
                  });
              }
          }
      }
      newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, itemToReturn!);
      handleUpdateEquipment(newEquipment);
  };
  const handleUseItem = (itemToUse: InventoryItem) => {
      let newEquipment = structuredClone(character.equipment!);
      const invItemIndex = newEquipment.inventory.findIndex((i: InventoryItem) => i.id === itemToUse.id);
      if(invItemIndex === -1) return;
      if (newEquipment.inventory[invItemIndex].quantity > 1) { newEquipment.inventory[invItemIndex].quantity -= 1; } 
      else { newEquipment.inventory.splice(invItemIndex, 1); }
      handleUpdateEquipment(newEquipment);
  };
  const handleDropItem = (itemToDrop: InventoryItem) => { setItemToDelete(itemToDrop); };
  const confirmDropItem = () => { if (itemToDelete) { handleUseItem(itemToDelete); setItemToDelete(null); } };

  const renderLoadout = () => {
      const eq = character.equipment?.equipped;
      if(!eq) return null;
      const clothes = eq.wornClothes || [];
      const backpack = eq.containers?.find(c => c.name.toLowerCase().includes('backpack'));
      return (
          <div className="bg-slate-50 border-b p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
                  <LoadoutSlot icon={Shield} label="Body" item={eq.armor} onUnequip={() => handleUnequipItem(eq.armor!, 'armor')} />
                  <LoadoutSlot icon={Shield} label="Head" item={eq.helmet} onUnequip={() => handleUnequipItem(eq.helmet!, 'helmet')} />
                  {[0, 1, 2].map(idx => (<LoadoutSlot key={idx} icon={Sword} label={`Hand ${idx+1}`} item={eq.weapons[idx]} onUnequip={() => handleUnequipItem(eq.weapons[idx].name, 'weapon', undefined, idx)} />))}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                   {backpack && (<div className="flex items-center gap-2 px-2 py-1 bg-white border rounded text-xs"><Backpack size={12} className="text-orange-500"/> <span>{backpack.name}</span><button onClick={() => handleUnequipItem(backpack.name, 'container', backpack.id)} className="text-gray-400 hover:text-red-500"><X size={12}/></button></div>)}
                   {clothes.map((c, i) => (<div key={i} className="flex items-center gap-2 px-2 py-1 bg-white border rounded text-xs whitespace-nowrap"><Shirt size={12} className="text-blue-500"/> <span>{c}</span><button onClick={() => handleUnequipItem(c, 'clothing', undefined, i)} className="text-gray-400 hover:text-red-500"><X size={12}/></button></div>))}
                   {eq.animals?.map((a: any) => (<div key={a.id} className="flex items-center gap-2 px-2 py-1 bg-white border rounded text-xs whitespace-nowrap"><Anchor size={12} className="text-green-500"/> <span>{a.name}</span><button onClick={() => handleUnequipItem(a.name, 'animal', a.id)} className="text-gray-400 hover:text-red-500"><X size={12}/></button></div>))}
              </div>
          </div>
      );
  };

  const renderInventoryRow = (item: InventoryItem, itemDetails: any) => {
      const isEquippable = isItemEquippable(itemDetails);
      const isUsable = isItemConsumable(item, itemDetails);
      const isMenuOpen = menuOpenId === item.id;
      const toggleMenu = (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : item.id); };
      const description = itemDetails?.effect || itemDetails?.description;

      return (
          <div key={item.id} className="p-3 border rounded-lg flex items-center justify-between gap-2 bg-white relative">
              <div className="flex flex-col min-w-0">
                 <h3 className="font-medium text-sm truncate">{formatInventoryItemName(item)}</h3>
                 <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                   {itemDetails?.weight !== undefined && <span>W: {itemDetails.weight}</span>}
                   {itemDetails?.damage && <span className="text-red-400">Dmg: {itemDetails.damage}</span>}
                   {itemDetails?.armor_rating && <span className="text-blue-400">AR: {itemDetails.armor_rating}</span>}
                 </div>
                 {description && (<p className="text-[10px] text-gray-500 truncate italic mt-1 max-w-[200px]">{description}</p>)}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                  {isEquippable ? <Button variant="secondary" size="xs" icon={CheckSquare} onClick={() => handleEquipItem(item)}>Equip</Button> : isUsable ? <Button variant="outline" size="xs" icon={MinusCircle} onClick={() => handleUseItem(item)}>Use</Button> : null}
                  <div className="relative">
                      <button onClick={toggleMenu} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"><MoreVertical size={16} /></button>
                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 flex flex-col">
                            {description && <div className="px-3 py-2 text-xs border-b border-gray-100 bg-gray-50 text-gray-600 mb-1 italic">{description}</div>}
                            <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleDropItem(item); }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium transition-colors"><Trash2 size={14} /> Drop Item</button>
                        </div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  const MissingStatWarning = () => ( <div className="p-3 mt-4 border border-orange-300 bg-orange-50 rounded-lg flex items-center gap-3"><AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" /><div><h4 className="font-bold text-orange-800">Cannot Calculate Encumbrance</h4><p className="text-sm text-orange-700">Character's Strength (STR) value is missing.</p></div></div> );
  const EncumbranceMeter = ({ load, capacity, isEncumbered }: { load: number, capacity: number, isEncumbered: boolean }) => {
      const displayLoad = Number.isInteger(load) ? load : load.toFixed(1).replace(/\.0$/, '');
      const percentage = capacity > 0 ? (load / capacity) * 100 : 0;
      let barColor = 'bg-green-500'; if (percentage >= 100) barColor = 'bg-red-500'; else if (percentage > 75) barColor = 'bg-yellow-500';
      return (<div className="p-3 border rounded-lg bg-white mt-4"><div className="flex justify-between items-center mb-2"><h4 className="font-medium text-sm text-gray-700 flex items-center gap-2"><Weight size={16} /> Encumbrance</h4><span className="font-mono font-semibold text-sm">{displayLoad} / {capacity}</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${barColor} h-2.5 rounded-full`} style={{ width: `${Math.min(percentage, 100)}%` }}></div></div>{isEncumbered && (<div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2"><AlertTriangle size={16} /><div><span className="font-bold">Over-encumbered:</span> You must make a STR roll to move.</div></div>)}</div>);
  };

  return (
    <>
      {isMoneyModalOpen && <MoneyManagementModal onClose={() => setIsMoneyModalOpen(false)} currentMoney={character.equipment?.money || {}} onUpdateMoney={(newMoney) => handleUpdateEquipment({ ...character.equipment, money: newMoney })} />}
      {isForageModalOpen && <ForageModal onClose={() => setIsForageModalOpen(false)} onAdd={handleAddRations} />}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90] backdrop-blur-sm"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center transform transition-all scale-100"><div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-4 text-red-600"><Trash2 size={28} /></div><h3 className="text-xl font-bold text-gray-900 mb-2">Drop Item?</h3><p className="text-sm text-gray-500 mb-6">Are you sure you want to drop <strong>{itemToDelete.name}</strong>? {itemToDelete.quantity > 1 ? "1 unit will be removed." : "This cannot be undone."}</p><div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setItemToDelete(null)}>Cancel</Button><Button variant="danger" onClick={confirmDropItem}>Confirm</Button></div></div></div>
      )}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-0 md:p-4 z-50">
          <div className="bg-white md:rounded-2xl w-full md:max-w-4xl h-full md:h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
              <div className="px-4 py-3 border-b flex items-center justify-between bg-white z-20">
                  <div className="flex items-center gap-3"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hidden sm:block"><Package size={20}/></div><div><h2 className="text-lg font-bold text-gray-900 leading-tight">Inventory</h2><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-gray-500 font-medium">{encumbrance.load} / {encumbrance.capacity} Load</span>{encumbrance.isEncumbered && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold">HEAVY</span>}</div></div></div>
                  <div className="flex items-center gap-2"><button onClick={() => setIsMoneyModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold hover:bg-amber-200 transition-colors"><Coins size={14} />{formatCost(character.equipment?.money || {})}</button><div className="h-8 w-px bg-gray-200 mx-1"></div><button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors"><X size={20}/></button></div>
              </div>
              <div className="px-4 py-2 bg-white border-b flex gap-2"><button onClick={() => setActiveTab('inventory')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'inventory' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>My Gear</button><button onClick={() => setActiveTab('shop')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'shop' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>Shop</button></div>
              <div className="flex-1 overflow-y-auto bg-gray-50/50 relative">
                  {activeTab === 'inventory' && (
                      <div className="pb-20">
                          {renderLoadout()}
                          <div className="p-4">
                              <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Filter items..." value={filters.search} onChange={(e) => setFilters({ search: e.target.value })} className="w-full pl-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"/>{filters.search && <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-gray-100 rounded-full text-gray-500"><X size={12}/></button>}</div>
                              <div className="space-y-3">
                                  {(() => {
                                      const allItems = (character.equipment?.inventory || []).filter(item => item?.name && item.name.toLowerCase().includes(filters.search.toLowerCase()));
                                      const tinyItems: InventoryItem[] = [];
                                      const carriedItems: InventoryItem[] = [];
                                      allItems.forEach(item => { const details = getItemData(item); if (details && Number(details.weight) === 0) tinyItems.push(item); else carriedItems.push(item); });
                                      return (
                                          <>
                                              {carriedItems.map(item => renderInventoryRow(item, getItemData(item)))}
                                              {carriedItems.length === 0 && <div className="text-center py-8 text-gray-400"><Package size={40} className="mx-auto mb-2 opacity-20"/><p className="text-sm">No items carried</p></div>}
                                              {tinyItems.length > 0 && (<div className="mt-8"><h3 className="font-bold text-xs text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Feather size={14}/> Tiny Items</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{tinyItems.map(item => renderInventoryRow(item, getItemData(item)))}</div></div>)}
                                          </>
                                      );
                                  })()}
                              </div>
                          </div>
                      </div>
                  )}
                  {activeTab === 'shop' && (
                      <div className="p-4">
                          {!selectedShopGroup && !filters.search ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{shopGroups.map(g => (<button key={g.name} onClick={() => setSelectedShopGroup(g)} className="flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all group"><g.Icon className="w-8 h-8 text-gray-400 group-hover:text-indigo-600 mb-3 transition-colors"/><span className="font-bold text-gray-700 text-sm">{g.name}</span></button>))}</div>
                          ) : (
                             <div>
                                <div className="flex items-center gap-2 mb-4"><button onClick={() => { setSelectedShopGroup(null); setFilters({search: ''}); }} className="p-2 bg-white border rounded-lg hover:bg-gray-50"><ArrowLeft size={16}/></button><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Search shop..." value={filters.search} onChange={(e) => setFilters({ search: e.target.value })} className="w-full pl-10 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"/></div>{/* Sort Dropdown */}{(selectedShopGroup || filters.search.length > 0) && (<div className="relative"><select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="appearance-none w-full bg-white border border-gray-300 rounded-lg text-sm px-4 py-2 pr-8 focus:ring-2 focus:ring-blue-500 outline-none"><option value="name-asc">Name (A-Z)</option><option value="name-desc">Name (Z-A)</option><option value="cost-asc">Cost (Low-High)</option><option value="cost-desc">Cost (High-Low)</option></select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" /></div>)}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                   {allGameItems.filter(item => { if (filters.search) return item.name.toLowerCase().includes(filters.search.toLowerCase()); return selectedShopGroup?.categories.includes(item.category); }).sort((a,b) => { const costA = parseCost(a.cost)?.totalCopper || 0; const costB = parseCost(b.cost)?.totalCopper || 0; switch (sortOrder) { case 'cost-asc': return costA - costB; case 'cost-desc': return costB - costA; case 'name-desc': return b.name.localeCompare(a.name); case 'name-asc': default: return a.name.localeCompare(b.name); } }).map(item => <ShopItemCard key={item.id} item={item} onBuy={handleBuyItem} />)}
                                </div>
                             </div>
                          )}
                      </div>
                  )}
              </div>
              
              {/* --- FLOATING ACTION BUTTON (Moved Outside Scroll Container) --- */}
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