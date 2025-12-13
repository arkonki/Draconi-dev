import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Search, ShoppingBag, Coins, Shield, Sword,
  ArrowRight, ArrowLeft, Plus, Scale, X, Edit2, Wrench, Trash2, CheckSquare, MinusSquare,
  MinusCircle, Info, Target, Star, Heart, Zap, AlertTriangle, Weight, ChevronDown, ChevronUp,
  Feather
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { formatCost, subtractCost, parseCost, normalizeCurrency } from '../../lib/equipment';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Character, InventoryItem, EquippedWeapon, Money } from '../../types/character';

// --- DATA ACCESSOR & PARSING ---
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

// --- UTILITY: ID GENERATION ---
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// --- Encumbrance Calculation Logic ---
const calculateEncumbrance = (character: Character, allGameItems: GameItem[]) => {
    const strength = getStrengthFromCharacter(character);
    const equipment = typeof character.equipment === 'string' ? JSON.parse(character.equipment) : character.equipment;
    if (strength === null || !equipment) return { capacity: 0, load: 0, isEncumbered: false };

    const findDetails = (name: string) => {
        if (!name) return undefined; 
        return allGameItems.find(i => i.name?.toLowerCase() === name.toLowerCase());
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

    allEquippedItems.forEach(itemName => { 
        if (!itemName) return;
        const details = findDetails(itemName); 
        if (details?.encumbrance_modifier) { capacity += details.encumbrance_modifier; } 
    });

    let load = 0;
    (equipment.inventory || []).forEach((item: InventoryItem) => { 
        if (!item || !item.name) return;
        const details = findDetails(item.name);
        
        // --- LOGIC: Rations & Tiny Items ---
        let weightPerUnit = 1; // Default fallback

        if (details) {
            if (item.name.toLowerCase().includes('ration')) {
                // Rations: 4 count as 1 weight (0.25 each)
                weightPerUnit = 0.25;
            } else if (details.weight === 0) {
                // Tiny items: 0 weight
                weightPerUnit = 0;
            } else if (typeof details.weight === 'number') {
                weightPerUnit = details.weight;
            }
        }
        
        load += weightPerUnit * (item.quantity || 1); 
    });
    
    return { capacity, load, isEncumbered: load > capacity };
};


// --- HELPER COMPONENT: MissingStatWarning ---
const MissingStatWarning = () => ( <div className="p-3 mt-4 border border-orange-300 bg-orange-50 rounded-lg flex items-center gap-3"><AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" /><div><h4 className="font-bold text-orange-800">Cannot Calculate Encumbrance</h4><p className="text-sm text-orange-700">Character's Strength (STR) value is missing.</p></div></div> );

// --- COMPONENT: EncumbranceMeter ---
const EncumbranceMeter = ({ load, capacity, isEncumbered }: { load: number, capacity: number, isEncumbered: boolean }) => {
  // Display clean number (e.g., 5.25 if rations involved, or 5 if integers)
  const displayLoad = Number.isInteger(load) ? load : load.toFixed(2);
  
  const percentage = capacity > 0 ? (load / capacity) * 100 : 0;
  let barColor = 'bg-green-500';
  if (percentage >= 100) barColor = 'bg-red-500';
  else if (percentage > 75) barColor = 'bg-yellow-500';
  return (<div className="p-3 border rounded-lg bg-white mt-4"><div className="flex justify-between items-center mb-2"><h4 className="font-medium text-sm text-gray-700 flex items-center gap-2"><Weight size={16} /> Encumbrance</h4><span className="font-mono font-semibold text-sm">{displayLoad} / {capacity}</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${barColor} h-2.5 rounded-full`} style={{ width: `${Math.min(percentage, 100)}%` }}></div></div>{isEncumbered && (<div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2"><AlertTriangle size={16} /><div><span className="font-bold">Over-encumbered:</span> You must make a STR roll to move.</div></div>)}</div>);
};

// --- COMPONENT: MoneyManagementModal ---
interface MoneyManagementModalProps { onClose: () => void; currentMoney: Money; onUpdateMoney: (updatedMoney: Money) => void; }
export const MoneyManagementModal = ({ onClose, currentMoney, onUpdateMoney }: MoneyManagementModalProps) => {
  const [gold, setGold] = useState(0); const [silver, setSilver] = useState(0); const [copper, setCopper] = useState(0); const [error, setError] = useState<string | null>(null);
  const handleTransaction = (multiplier: 1 | -1) => {
    setError(null);
    if (gold === 0 && silver === 0 && copper === 0) { setError("Please enter an amount."); return; }
    const newMoney = { gold: (currentMoney.gold || 0) + (gold * multiplier), silver: (currentMoney.silver || 0) + (silver * multiplier), copper: (currentMoney.copper || 0) + (copper * multiplier) };
    if (newMoney.gold < 0 || newMoney.silver < 0 || newMoney.copper < 0) { setError("Cannot remove more money than is available."); return; }
    onUpdateMoney(normalizeCurrency(newMoney));
    onClose();
  };
  return (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]"><div className="bg-white rounded-lg shadow-xl w-full max-w-md"><div className="p-4 border-b flex justify-between items-center"><h3 className="text-lg font-bold">Manage Money</h3><button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><X size={20} /></button></div><div className="p-6"><div className="mb-6 p-4 bg-yellow-50 text-center rounded-lg"><p className="text-sm">Current Balance</p><p className="text-2xl font-bold">{formatCost(currentMoney)}</p></div><div className="grid grid-cols-3 gap-4 mb-4"><div><label className="block text-sm text-center">Gold</label><input type="number" min="0" value={gold} onChange={(e) => setGold(Math.max(0, parseInt(e.target.value) || 0))} className="w-full p-2 border rounded-lg text-center" /></div><div><label className="block text-sm text-center">Silver</label><input type="number" min="0" value={silver} onChange={(e) => setSilver(Math.max(0, parseInt(e.target.value) || 0))} className="w-full p-2 border rounded-lg text-center" /></div><div><label className="block text-sm text-center">Copper</label><input type="number" min="0" value={copper} onChange={(e) => setCopper(Math.max(0, parseInt(e.target.value) || 0))} className="w-full p-2 border rounded-lg text-center" /></div></div>{error && <ErrorMessage message={error} />}<div className="flex gap-4 mt-6"><Button variant="secondary" className="w-full" onClick={() => handleTransaction(-1)}>Remove</Button><Button variant="primary" className="w-full" onClick={() => handleTransaction(1)}>Add</Button></div></div></div></div>);
};

// --- UTILITY FUNCTIONS ---
export const formatInventoryItemName = (item: InventoryItem): string => `${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`;

export const mergeIntoInventory = (inventory: InventoryItem[], itemToMerge: InventoryItem): InventoryItem[] => {
  const existingItemIndex = inventory.findIndex(item => item.name === itemToMerge.name);
  let newInventory = [...inventory];
  if (existingItemIndex > -1) { newInventory[existingItemIndex].quantity += itemToMerge.quantity; } 
  else { newInventory.push({ ...itemToMerge, id: itemToMerge.id || generateId() }); }
  return newInventory;
};

// --- HELPER COMPONENT: ShopItemDetail & ShopItemCard ---
const ShopItemDetail = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>, label: string, value: string | number | null | undefined }) => {
  if (value === null || value === undefined || value === '') return null;
  return (<div className="flex items-center gap-2 text-xs text-gray-600"><Icon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" /><span className="font-medium">{label}:</span><span className="text-gray-800 font-mono">{String(value)}</span></div>);
};
const ShopItemCard = ({ item, onBuy }: { item: GameItem, onBuy: (item: GameItem) => void }) => (
  <div className="flex flex-col p-4 border rounded-lg shadow-sm hover:shadow-lg transition-shadow bg-white">
    <div className="flex-1 mb-4"><h4 className="font-bold text-gray-800">{item.name}</h4><p className="text-xs text-gray-500 mb-2">{item.category}</p>{item.effect && (<p className="text-sm text-blue-800 bg-blue-50 p-2 rounded-md mt-2 italic">"{item.effect}"</p>)}</div>
    <div className="space-y-1.5 mb-4 text-sm"><ShopItemDetail icon={Scale} label="Weight" value={item.weight} /><ShopItemDetail icon={Shield} label="Armor" value={item.armor_rating} /><ShopItemDetail icon={Sword} label="Damage" value={item.damage} /><ShopItemDetail icon={Target} label="Range" value={item.range} /><ShopItemDetail icon={Heart} label="Durability" value={item.durability} /><ShopItemDetail icon={Star} label="Features" value={item.features} /><ShopItemDetail icon={Zap} label="Skill" value={item.skill} /></div>
    <div className="flex justify-between items-center mt-auto pt-3 border-t"><span className="text-sm font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">{item.cost || 'N/A'}</span><Button variant="primary" size="sm" onClick={() => onBuy(item)} disabled={!item.cost}>Buy</Button></div>
  </div>
);


// --- MAIN COMPONENT START ---
const DEFAULT_EQUIPPABLE_CATEGORIES = ["ARMOR & HELMETS", "MELEE WEAPONS", "RANGED WEAPONS", "CLOTHES"];
const shopGroups = [{ name: 'Armor & Weapons', categories: ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS'], Icon: Shield }, { name: 'Clothing & Accessories', categories: ['CLOTHES'], Icon: Package }, { name: 'Musical & Trade Goods', categories: ['MUSICAL INSTRUMENTS', 'TRADE GOODS'], Icon: ShoppingBag }, { name: 'Magic & Studies', categories: ['STUDIES & MAGIC'], Icon: Scale }, { name: 'Light & Tools', categories: ['LIGHT SOURCES', 'TOOLS'], Icon: Wrench }, { name: 'Containers & Medicine', categories: ['CONTAINERS', 'MEDICINE'], Icon: Package }, { name: 'Services', categories: ['SERVICES'], Icon: ShoppingBag }, { name: 'Hunting & Travel', categories: ['HUNTING & FISHING', 'MEANS OF TRAVEL'], Icon: ArrowRight }, { name: 'Animals', categories: ['ANIMALS'], Icon: Edit2 }];

export function InventoryModal({ onClose }: any) {
  const [isEquippedOpen, setIsEquippedOpen] = useState(true);
  const { character: rawCharacter, updateCharacterData, isSaving } = useCharacterSheetStore();
  const { data: allGameItems = [] } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });
  
  const [activeTab, setActiveTab] = useState<'inventory' | 'shop'>('inventory');
  const [filters, setFilters] = useState({ search: '' });
  const [error, setError] = useState<string | null>(null);
  const [isMoneyModalOpen, setIsMoneyModalOpen] = useState(false);
  
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [selectedShopGroup, setSelectedShopGroup] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState('name-asc');

  const character = useMemo(() => {
    if (!rawCharacter) return null;
    try {
      const equip = typeof rawCharacter.equipment === 'string' ? JSON.parse(rawCharacter.equipment) : rawCharacter.equipment;
      if (!equip.equipped) equip.equipped = {};
      ['weapons', 'wornClothes', 'animals', 'containers'].forEach(key => { if (!equip.equipped[key]) equip.equipped[key] = []; });
      return { ...rawCharacter, attributes: typeof rawCharacter.attributes === 'string' ? JSON.parse(rawCharacter.attributes) : rawCharacter.attributes, equipment: equip };
    } catch (e) { console.error("Failed to parse data:", e); return rawCharacter; }
  }, [rawCharacter]);

  const findItemDetails = (itemName: string | undefined): GameItem | undefined => {
    if (!itemName) return undefined;
    return allGameItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase() || parseComplexItemName(item.name).baseName.toLowerCase() === parseComplexItemName(itemName).baseName.toLowerCase());
  };

  const encumbrance = useMemo(() => (character && allGameItems.length > 0) ? calculateEncumbrance(character, allGameItems) : { capacity: 0, load: 0, isEncumbered: false }, [character, allGameItems]);
  const hasValidStrength = useMemo(() => character?.attributes && typeof character.attributes.STR === 'number', [character]);

  if (!character) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><LoadingSpinner /></div>;

  const handleUpdateEquipment = (newEquipment: any) => updateCharacterData({ ...character, equipment: newEquipment });

  const handleEquipItem = (itemToEquip: InventoryItem) => {
    setError(null);
    const itemDetails = findItemDetails(itemToEquip.name);
    if (!itemDetails) return;

    let newEquipment = structuredClone(character.equipment!);
    let inventory = newEquipment.inventory;
    const invItemIndex = inventory.findIndex((i: InventoryItem) => i.id === itemToEquip.id);
    if (invItemIndex === -1) return;

    const itemToMove = { ...inventory[invItemIndex], quantity: 1 };
    if (inventory[invItemIndex].quantity > 1) inventory[invItemIndex].quantity -= 1;
    else inventory.splice(invItemIndex, 1);
    
    const { category, name } = itemDetails;

    if (category === 'CLOTHES') {
        if (newEquipment.equipped.wornClothes.includes(name)) { setError("Already wearing one."); newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
        newEquipment.equipped.wornClothes.push(name);
    } else if (DEFAULT_EQUIPPABLE_CATEGORIES.includes(category!)) {
        const isWeaponOrShield = category !== 'ARMOR & HELMETS' || name.toLowerCase().includes('shield');
        const isArmor = category === 'ARMOR & HELMETS' && !isWeaponOrShield;
        
        if (isWeaponOrShield) {
            if (newEquipment.equipped.weapons.length >= 3) { setError("Max 3 at hand."); newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
            const newWeapon: EquippedWeapon = {
                name: itemDetails.name,
                grip: itemDetails.grip,
                range: itemDetails.range,
                damage: itemDetails.damage,
                durability: itemDetails.durability,
                features: itemDetails.features,
            };
            newEquipment.equipped.weapons.push(newWeapon);
        } else if (isArmor) {
            if (newEquipment.equipped.armor) inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.armor, quantity: 1, id: generateId() });
            newEquipment.equipped.armor = name;
        } else {
            if (newEquipment.equipped.helmet) inventory = mergeIntoInventory(inventory, { name: newEquipment.equipped.helmet, quantity: 1, id: generateId() });
            newEquipment.equipped.helmet = name;
        }
    } else if (category === 'ANIMALS') {
        newEquipment.equipped.animals.push(itemToMove);
    } else if (category === 'CONTAINERS') {
        if(name.toLowerCase().includes('backpack')){
             if(newEquipment.equipped.containers.some((c:InventoryItem) => c?.name?.toLowerCase().includes('backpack'))) { setError("Only one backpack equipped."); newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
        }
        if(name.toLowerCase().includes('saddle bag')){
            const animalWithSpace = newEquipment.equipped.animals.find((a:InventoryItem) => newEquipment.equipped.containers.filter((c:InventoryItem) => c.equippedOn === a.id).length < 2);
            if(!animalWithSpace) { setError("No animal has space."); newEquipment.inventory = mergeIntoInventory(inventory, itemToMove); handleUpdateEquipment(newEquipment); return; }
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
    
    if (type === 'armor' || type === 'helmet') {
        newEquipment.equipped[type] = undefined;
    } else {
        const arrKey = type === 'clothing' ? 'wornClothes' : (type + 's' as 'weapons' | 'animals' | 'containers');
        const arr = newEquipment.equipped[arrKey];
        
        let findIndex = -1;
        if (itemIndex !== undefined && (type === 'weapon' || type === 'clothing')) {
             findIndex = itemIndex;
        } else if(itemId) {
            findIndex = arr.findIndex((i: any) => i.id === itemId);
        } else {
            findIndex = arr.findIndex((i: any) => (i.name || i) === itemName);
        }

        if (findIndex > -1) { 
            const [removed] = arr.splice(findIndex, 1);
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
        }
    }
    
    newEquipment.inventory = mergeIntoInventory(newEquipment.inventory, itemToReturn!);
    handleUpdateEquipment(newEquipment);
};
  
  const handleUseItem = (itemToUse: InventoryItem) => {
    let newEquipment = structuredClone(character.equipment!);
    const invItemIndex = newEquipment.inventory.findIndex((i: InventoryItem) => i.id === itemToUse.id);
    if(invItemIndex === -1) return;

    const parsed = parseComplexItemName(itemToUse.name);

    if (parsed.quantity !== null) {
        const newQuantity = parsed.quantity - 1;
        if (newQuantity > 0) {
            newEquipment.inventory[invItemIndex].name = `${parsed.baseName} ${parsed.unit ? '' : '('}${newQuantity}${parsed.unit ? ` ${parsed.unit}` : ')'}`;
        } else {
            newEquipment.inventory.splice(invItemIndex, 1);
        }
    } else {
        if (newEquipment.inventory[invItemIndex].quantity > 1) {
            newEquipment.inventory[invItemIndex].quantity -= 1;
        } else {
            newEquipment.inventory.splice(invItemIndex, 1);
        }
    }
    handleUpdateEquipment(newEquipment);
  };
  
  const handleDropItem = (itemToDrop: InventoryItem) => {
    setItemToDelete(itemToDrop);
  };

  const confirmDropItem = () => {
    if (itemToDelete) {
        handleUseItem(itemToDelete);
        setItemToDelete(null);
    }
  };
  
  const handleBuyItem = (item: GameItem) => {
    const itemCost = parseCost(item.cost);
    if (!itemCost) { setError("Invalid item cost."); return; }
    const { success, newMoney } = subtractCost(character.equipment!.money!, itemCost);
    if (!success) { setError("Not enough money."); return; }
    const newItem = { name: item.name, quantity: 1, weight: item.weight, id: generateId() };
    const newInventory = mergeIntoInventory(character.equipment!.inventory!, newItem);
    handleUpdateEquipment({ ...character.equipment, inventory: newInventory, money: newMoney });
  };
  
  const renderEquippedItems = () => {
    const eq = character.equipment?.equipped;
    if (!eq) return null;
    const items = [
        ...(eq.armor ? [{ id: 'armor', name: eq.armor, type: 'armor' }] : []),
        ...(eq.helmet ? [{ id: 'helmet', name: eq.helmet, type: 'helmet' }] : []),
        ...(eq.weapons?.filter(Boolean).map((w, i) => ({ id: `w-${i}-${w.name}`, name: w.name, type: 'weapon', index: i })) || []),
        ...(eq.wornClothes?.filter(Boolean).map((c, i) => ({ id: `c-${i}-${c}`, name: c, type: 'clothing', index: i })) || []),
        ...(eq.containers?.filter(Boolean).map(c => ({ ...c, type: 'container' })) || []),
        ...(eq.animals?.filter(Boolean).map(a => ({ ...a, type: 'animal' })) || []),
    ];

    if (items.length === 0) return null;

    return (
      <div className="pt-4 border-t">
        <button onClick={() => setIsEquippedOpen(!isEquippedOpen)} className="w-full flex justify-between items-center text-left mb-2">
            <h3 className="font-medium text-sm text-gray-600">Equipped Items ({items.length})</h3>
            {isEquippedOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </button>
        {isEquippedOpen && (
            <div className="space-y-2 pl-2 border-l-2">
                {items.map(item => (
                    <div key={item.id} className="p-2 bg-gray-100 rounded">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{item.name} <span className="text-xs text-gray-500">({item.type})</span></span>
                            <Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem(item.name, item.type as any, item.id, (item as any).index)} disabled={isSaving}>Unequip</Button>
                        </div>
                        {item.type === 'animal' && (
                            <div className="mt-2 pl-4 border-l-2 border-gray-300 space-y-1">
                                {eq.containers.filter(c => c.equippedOn === item.id).map(bag => (
                                    <div key={bag.id} className="text-xs text-gray-600 flex items-center justify-between">
                                        <span>- {bag.name}</span>
                                        <Button variant="outline" size="xs" onClick={() => handleUnequipItem(bag.name, 'container', bag.id)}>Remove</Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>
    );
  };
  
  const renderItemRow = (item: InventoryItem, itemDetails: GameItem | undefined) => {
        const isEquippable = itemDetails?.equippable || (itemDetails?.category && DEFAULT_EQUIPPABLE_CATEGORIES.includes(itemDetails.category));
        const canBeUsed = !isEquippable;
        
        return (
          <div key={item.id} className="p-3 border rounded-lg flex items-center justify-between gap-2 bg-white">
              <h3 className="font-medium text-sm truncate">{formatInventoryItemName(item)}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                  {canBeUsed && <Button variant="outline" size="xs" icon={MinusCircle} onClick={() => handleUseItem(item)}>Use</Button>}
                  {isEquippable && <Button variant="secondary" size="xs" icon={CheckSquare} onClick={() => handleEquipItem(item)}>Equip</Button>}
                  <Button variant="dangerOutline" size="xs" icon={Trash2} onClick={() => handleDropItem(item)}>Drop</Button>
                  {itemDetails && (
                      <span className="relative group flex items-center">
                          <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
                          <div className="absolute bottom-full right-0 mb-2 w-60 bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                              <h5 className="font-bold mb-1 border-b pb-1">{itemDetails.name}</h5>
                              <p>{itemDetails.effect || itemDetails.description}</p>
                              <p className="mt-1 text-gray-300">W: {itemDetails.weight ?? 'N/A'}, Cost: {itemDetails.cost || 'N/A'}</p>
                          </div>
                      </span>
                  )}
              </div>
          </div>
        );
  };

  return (
    <>
      {isMoneyModalOpen && <MoneyManagementModal onClose={() => setIsMoneyModalOpen(false)} currentMoney={character.equipment?.money || {}} onUpdateMoney={(newMoney) => handleUpdateEquipment({ ...character.equipment, money: newMoney })} />}
      
      {itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Drop</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Are you sure you want to drop <strong>{itemToDelete.name}</strong>? 
                    {itemToDelete.quantity > 1 ? " This will remove 1 unit." : " This cannot be undone."}
                </p>
                <div className="flex gap-3 justify-center">
                    <Button variant="secondary" onClick={() => setItemToDelete(null)}>Cancel</Button>
                    <Button variant="dangerOutline" onClick={confirmDropItem}>Confirm Drop</Button>
                </div>
            </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-xl">
              <div className="p-4 md:p-6 border-b flex-shrink-0 bg-gray-50 rounded-t-lg">
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                      {/* HEADER TITLE & MONEY BADGE */}
                      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                          <h2 className="text-xl md:text-2xl font-bold text-gray-800">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
                          <button onClick={() => setIsMoneyModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium hover:bg-yellow-200 transition-colors">
                              <Coins className="w-4 h-4" />{formatCost(character.equipment?.money || {})}
                          </button>
                      </div>
                      
                      {/* MOBILE-FRIENDLY TABS (Segmented Control Style) */}
                      <div className="flex items-center gap-2 w-full md:w-auto">
                          <div className="flex p-1 bg-gray-100 rounded-lg flex-1 md:flex-none">
                              <button
                                  onClick={() => setActiveTab('inventory')}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
                                      activeTab === 'inventory' 
                                      ? 'bg-white text-blue-700 shadow-sm' 
                                      : 'text-gray-500 hover:text-gray-700'
                                  }`}
                              >
                                  <Package size={14} />
                                  <span>Inventory</span>
                              </button>
                              <button
                                  onClick={() => setActiveTab('shop')}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
                                      activeTab === 'shop' 
                                      ? 'bg-white text-blue-700 shadow-sm' 
                                      : 'text-gray-500 hover:text-gray-700'
                                  }`}
                              >
                                  <ShoppingBag size={14} />
                                  <span>Shop</span>
                              </button>
                          </div>
                          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                              <X size={20} />
                          </button>
                      </div>
                  </div>
                  {activeTab === 'inventory' && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder="Search carried items..." 
                          value={filters.search} 
                          onChange={(e) => setFilters({ search: e.target.value })} 
                          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {activeTab === 'shop' && (
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      {!selectedShopGroup ? (
                        <div className="flex-1"></div>
                      ) : (
                        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setSelectedShopGroup(null)}>
                          Back
                        </Button>
                      )}
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder={selectedShopGroup ? `Search in ${selectedShopGroup.name}...` : "Search shop..."} 
                          value={filters.search} 
                          onChange={(e) => setFilters({ ...filters, search: e.target.value })} 
                          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      {selectedShopGroup && (
                        <div className="relative">
                          <select 
                            value={sortOrder} 
                            onChange={(e) => setSortOrder(e.target.value)} 
                            className="appearance-none w-full bg-white border rounded-lg text-sm px-4 py-2 pr-8"
                          >
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="cost-asc">Cost (Low-High)</option>
                            <option value="cost-desc">Cost (High-Low)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
              </div>
              <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50">
                  {isSaving && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
                  {activeTab === 'shop' && !isSaving ? (
                      selectedShopGroup ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                              {allGameItems.filter(item => selectedShopGroup.categories.includes(item.category || '') && item.name?.toLowerCase().includes(filters.search.toLowerCase())).sort((a,b) => {
                                const costA = parseCost(a.cost)?.totalCopper || 0;
                                const costB = parseCost(b.cost)?.totalCopper || 0;
                                switch (sortOrder) {
                                  case 'cost-asc': return costA - costB;
                                  case 'cost-desc': return costB - costA;
                                  case 'name-desc': return b.name.localeCompare(a.name);
                                  case 'name-asc': default: return a.name.localeCompare(b.name);
                                }
                              }).map(item => <ShopItemCard key={item.id} item={item} onBuy={handleBuyItem} />)}
                          </div>
                      ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                              {shopGroups.map((group) => <div key={group.name} className="flex flex-col items-center justify-center p-4 border bg-white rounded-lg hover:shadow-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setSelectedShopGroup(group)}><group.Icon className="w-12 h-12 text-blue-600 mb-3" /><span className="font-medium text-center text-sm">{group.name}</span></div>)}
                          </div>
                      )
                  ) : !isSaving && (
                      <>
                          {renderEquippedItems()}
                          {hasValidStrength ? <EncumbranceMeter load={encumbrance.load} capacity={encumbrance.capacity} isEncumbered={encumbrance.isEncumbered} /> : <MissingStatWarning />}
                          
                          {/* --- SPLIT ITEMS LOGIC --- */}
                          {(() => {
                              const allItems = (character.equipment?.inventory || []).filter(item => item?.name && item.name.toLowerCase().includes(filters.search.toLowerCase()));
                              
                              const tinyItems: InventoryItem[] = [];
                              const carriedItems: InventoryItem[] = [];
                              
                              allItems.forEach(item => {
                                  const details = findItemDetails(item.name);
                                  if (details?.weight === 0) {
                                      tinyItems.push(item);
                                  } else {
                                      carriedItems.push(item);
                                  }
                              });

                              return (
                                  <>
                                      {/* --- CARRIED ITEMS SECTION --- */}
                                      <h3 className="font-medium text-sm text-gray-600 mt-6 mb-3 pt-4 border-t">Carried Items</h3>
                                      <div className="space-y-3">
                                          {carriedItems.map(item => renderItemRow(item, findItemDetails(item.name)))}
                                          {carriedItems.length === 0 && <p className="text-gray-400 text-sm italic">No standard items carried.</p>}
                                      </div>

                                      {/* --- TINY ITEMS SECTION --- */}
                                      {tinyItems.length > 0 && (
                                          <div className="mt-8 pt-4 border-t">
                                              <h3 className="font-medium text-sm text-gray-600 mb-3 flex items-center gap-2">
                                                  <Feather className="w-4 h-4" /> Tiny Items (Weight 0)
                                              </h3>
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                  {tinyItems.map(item => renderItemRow(item, findItemDetails(item.name)))}
                                              </div>
                                          </div>
                                      )}
                                      
                                      {carriedItems.length === 0 && tinyItems.length === 0 && (
                                          <div className="text-center py-12">
                                              <Package className="w-12 h-12 mx-auto text-gray-300" />
                                              <p className="mt-2 text-gray-500">Your pack is empty.</p>
                                          </div>
                                      )}
                                  </>
                              );
                          })()}
                      </>
                  )}
              </div>
          </div>
      </div>
    </>
  );
}
