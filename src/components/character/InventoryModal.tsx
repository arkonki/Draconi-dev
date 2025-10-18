import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Search, ShoppingBag, Coins, Shield, Sword,
  ArrowRight, ArrowLeft, Plus, Scale, X, Edit2, Wrench, Trash2, CheckSquare, MinusSquare,
  MinusCircle, Info, Target, Star, Heart, Zap, AlertTriangle, Weight
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
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes);
    } catch { return null; }
  }
  return (typeof attributes?.STR === 'number') ? attributes.STR : null;
};

// --- Encumbrance Calculation Logic ---
const calculateEncumbrance = (character: Character) => {
    const strength = getStrengthFromCharacter(character);
    const equipment = typeof character.equipment === 'string' 
        ? JSON.parse(character.equipment) 
        : character.equipment;

    if (strength === null || !equipment) {
        return { capacity: 0, load: 0, isEncumbered: false };
    }

    const inventory = equipment.inventory || [];
    const money = equipment.money || { gold: 0, silver: 0, copper: 0 };

    const baseCapacity = Math.ceil(strength / 2);
    // *** UPDATED: Bonus is now conditional on the backpack being equipped ***
    const hasEquippedBackpack = inventory.some((item: InventoryItem) => item.name.toLowerCase().includes('backpack') && item.isEquipped);
    const capacity = baseCapacity + (hasEquippedBackpack ? 2 : 0);

    let load = 0;
    const totalCoins = (money.gold || 0) + (money.silver || 0) + (money.copper || 0);
    load += Math.floor(totalCoins / 100);

    const totalRations = inventory
        .filter((item: InventoryItem) => item.name.toLowerCase().includes('ration'))
        .reduce((sum: number, item: InventoryItem) => sum + (item.quantity || 1), 0);
    load += Math.ceil(totalRations / 4);

    inventory
      .filter((item: InventoryItem) => !item.name.toLowerCase().includes('ration'))
      .forEach((item: InventoryItem) => {
          const itemWeight = typeof item.weight === 'number' ? item.weight : 1;
          if (itemWeight > 0 && !item.name.toLowerCase().includes('backpack')) {
              load += itemWeight * (item.quantity || 1);
          }
      });

    return { capacity, load, isEncumbered: load > capacity };
};


// --- HELPER COMPONENT: MissingStatWarning ---
const MissingStatWarning = () => (
  <div className="p-3 mt-4 border border-orange-300 bg-orange-50 rounded-lg flex items-center gap-3">
    <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
    <div>
      <h4 className="font-bold text-orange-800">Cannot Calculate Encumbrance</h4>
      <p className="text-sm text-orange-700">Character's Strength (STR) value is missing or invalid in the 'attributes' field.</p>
    </div>
  </div>
);


// --- COMPONENT: EncumbranceMeter ---
const EncumbranceMeter = ({ load, capacity, isEncumbered }: { load: number, capacity: number, isEncumbered: boolean }) => {
  const percentage = capacity > 0 ? (load / capacity) * 100 : 0;
  let barColor = 'bg-green-500';
  if (percentage >= 100) barColor = 'bg-red-500';
  else if (percentage > 75) barColor = 'bg-yellow-500';

  return (
    <div className="p-3 border rounded-lg bg-white mt-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
          <Weight size={16} /> Encumbrance
        </h4>
        <span className="font-mono font-semibold text-sm">{load} / {capacity}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className={`${barColor} h-2.5 rounded-full`} style={{ width: `${Math.min(percentage, 100)}%` }}></div>
      </div>
      {isEncumbered && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
          <AlertTriangle size={16} />
          <div>
            <span className="font-bold">Over-encumbered:</span> You must make a STR roll to move in combat or travel.
          </div>
        </div>
      )}
    </div>
  );
};


// --- COMPONENT: MoneyManagementModal ---
interface MoneyManagementModalProps {
  onClose: () => void;
  currentMoney: Money;
  onUpdateMoney: (updatedMoney: Money) => void;
}

export const MoneyManagementModal = ({ onClose, currentMoney, onUpdateMoney }: MoneyManagementModalProps) => {
  const [gold, setGold] = useState(0);
  const [silver, setSilver] = useState(0);
  const [copper, setCopper] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleTransaction = (multiplier: 1 | -1) => {
    setError(null);
    if (gold === 0 && silver === 0 && copper === 0) {
      setError("Please enter an amount to transact.");
      return;
    }

    const newMoney = {
      gold: (currentMoney.gold || 0) + (gold * multiplier),
      silver: (currentMoney.silver || 0) + (silver * multiplier),
      copper: (currentMoney.copper || 0) + (copper * multiplier),
    };

    if (newMoney.gold < 0 || newMoney.silver < 0 || newMoney.copper < 0) {
      setError("Cannot remove more money than is available in the purse.");
      return;
    }

    onUpdateMoney(normalizeCurrency(newMoney));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h3 className="text-lg font-bold text-gray-800">Manage Money</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200"><X size={20} /></button>
        </div>
        <div className="p-6">
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">Current Balance</p>
            <p className="text-2xl font-bold text-yellow-800 tracking-wider">{formatCost(currentMoney)}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="gold-input" className="block text-sm font-medium text-gray-700 mb-1 text-center">Gold</label>
              <input
                id="gold-input"
                type="number"
                min="0"
                value={gold}
                onChange={(e) => setGold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-2 border-gray-300 rounded-lg text-center text-lg font-semibold"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="silver-input" className="block text-sm font-medium text-gray-700 mb-1 text-center">Silver</label>
              <input
                id="silver-input"
                type="number"
                min="0"
                value={silver}
                onChange={(e) => setSilver(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-2 border-gray-300 rounded-lg text-center text-lg font-semibold"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="copper-input" className="block text-sm font-medium text-gray-700 mb-1 text-center">Copper</label>
              <input
                id="copper-input"
                type="number"
                min="0"
                value={copper}
                onChange={(e) => setCopper(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-2 border-gray-300 rounded-lg text-center text-lg font-semibold"
                placeholder="0"
              />
            </div>
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="flex gap-4 mt-6">
            <Button size="lg" variant="secondary" className="w-full" onClick={() => handleTransaction(-1)}>
              Remove Amount
            </Button>
            <Button size="lg" variant="primary" className="w-full" onClick={() => handleTransaction(1)}>
              Add Amount
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- UTILITY FUNCTIONS ---
export const parseItemString = (itemString: string): Omit<InventoryItem, 'id'> => {
  const quantityRegex = /(?:(\d+)\s*x\s+)|(?:x\s*(\d+))|(?:[(\[]x?(\d+)[)\]])|^(\d+)\s+/;
  const match = itemString.match(quantityRegex);
  let quantity = 1;
  let cleanName = itemString.trim();

  if (match) {
    const quantityStr = match[1] || match[2] || match[3] || match[4];
    if (quantityStr) quantity = parseInt(quantityStr, 10);
    cleanName = itemString.replace(match[0], '').trim();
  }
  return { name: cleanName, quantity };
};

export const formatInventoryItemName = (item: InventoryItem): string => {
  let name = item.name;
  if (item.quantity > 1) { name += ` (x${item.quantity})`; }
  return name;
};

export const mergeIntoInventory = (inventory: InventoryItem[], newItem: Omit<InventoryItem, 'id'>, itemDetails?: GameItem): InventoryItem[] => {
  const existingItemIndex = inventory.findIndex(item => item.name === newItem.name);
  const newInventory = [...inventory];
  if (existingItemIndex > -1) {
    newInventory[existingItemIndex].quantity += newItem.quantity;
  } else {
    newInventory.push({ 
      ...newItem, 
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      ...(itemDetails && { weight: itemDetails.weight })
    });
  }
  return newInventory;
};

// --- HELPER COMPONENT: ShopItemDetail ---
const ShopItemDetail = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>, label: string, value: string | number | null | undefined }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <Icon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      <span className="font-medium">{label}:</span>
      <span className="text-gray-800 font-mono">{String(value)}</span>
    </div>
  );
};

// --- COMPONENT: ShopItemCard ---
const ShopItemCard = ({ item, onBuy }: { item: GameItem, onBuy: (item: GameItem) => void }) => {
  return (
    <div className="flex flex-col p-4 border rounded-lg shadow-sm hover:shadow-lg transition-shadow bg-white">
      <div className="flex-1 mb-4">
        <h4 className="font-bold text-gray-800">{item.name}</h4>
        <p className="text-xs text-gray-500 mb-2">{item.category}</p>
        {item.effect && (
          <p className="text-sm text-blue-800 bg-blue-50 p-2 rounded-md mt-2 italic">
            "{item.effect}"
          </p>
        )}
      </div>

      <div className="space-y-1.5 mb-4 text-sm">
        <ShopItemDetail icon={Scale} label="Weight" value={item.weight} />
        <ShopItemDetail icon={Shield} label="Armor" value={item.armor_rating} />
        <ShopItemDetail icon={Sword} label="Damage" value={item.damage} />
        <ShopItemDetail icon={Target} label="Range" value={item.range} />
        <ShopItemDetail icon={Heart} label="Durability" value={item.durability} />
        <ShopItemDetail icon={Star} label="Features" value={item.features} />
        <ShopItemDetail icon={Zap} label="Skill" value={item.skill} />
      </div>

      <div className="flex justify-between items-center mt-auto pt-3 border-t">
        <span className="text-sm font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">
          {item.cost || 'N/A'}
        </span>
        <Button variant="primary" size="sm" onClick={() => onBuy(item)} disabled={!item.cost}>
          Buy
        </Button>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT START ---
interface InventoryModalProps {
  onClose: () => void;
}

const itemCategories = ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS', 'CLOTHES', 'MUSICAL INSTRUMENTS', 'TRADE GOODS', 'STUDIES & MAGIC', 'LIGHT SOURCES', 'TOOLS', 'CONTAINERS', 'MEDICINE', 'SERVICES', 'HUNTING & FISHING', 'MEANS OF TRAVEL', 'ANIMALS'];
const shopGroups = [{ name: 'Armor & Weapons', categories: ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS'], Icon: Shield }, { name: 'Clothing & Accessories', categories: ['CLOTHES'], Icon: Package }, { name: 'Musical & Trade Goods', categories: ['MUSICAL INSTRUMENTS', 'TRADE GOODS'], Icon: ShoppingBag }, { name: 'Magic & Studies', categories: ['STUDIES & MAGIC'], Icon: Scale }, { name: 'Light & Tools', categories: ['LIGHT SOURCES', 'TOOLS'], Icon: Wrench }, { name: 'Containers & Medicine', categories: ['CONTAINERS', 'MEDICINE'], Icon: Package }, { name: 'Services', categories: ['SERVICES'], Icon: ShoppingBag }, { name: 'Hunting & Travel', categories: ['HUNTING & FISHING', 'MEANS OF TRAVEL'], Icon: ArrowRight }, { name: 'Animals', categories: ['ANIMALS'], Icon: Edit2 }];

export function InventoryModal({ onClose }: InventoryModalProps) {
  const { isAdmin, isDM } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'shop'>('inventory');
  const [filters, setFilters] = useState({ search: '', category: 'all' });
  const [customItem, setCustomItem] = useState({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1 });
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [selectedShopGroup, setSelectedShopGroup] = useState<{ name: string; categories: string[]; Icon: React.ComponentType<{ className?: string }>; } | null>(null);
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [isMoneyModalOpen, setIsMoneyModalOpen] = useState(false);

  const { character: rawCharacter, updateCharacterData, updateInventory, isSaving } = useCharacterSheetStore();
  const { data: allGameItems = [], isLoading: isLoadingGameItems } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });

  const character = useMemo(() => {
    if (!rawCharacter) return null;
    try {
      return {
        ...rawCharacter,
        attributes: typeof rawCharacter.attributes === 'string' ? JSON.parse(rawCharacter.attributes) : rawCharacter.attributes,
        equipment: typeof rawCharacter.equipment === 'string' ? JSON.parse(rawCharacter.equipment) : rawCharacter.equipment,
      };
    } catch (e) {
      console.error("Failed to parse character data:", e);
      return rawCharacter;
    }
  }, [rawCharacter]);

  const findItemDetails = (itemName: string): GameItem | undefined => allGameItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  
  const encumbrance = useMemo(() => character ? calculateEncumbrance(character) : { capacity: 0, load: 0, isEncumbered: false }, [character]);
  
  const hasValidStrength = useMemo(() => character?.attributes && typeof character.attributes.STR === 'number', [character]);

  if (!character) { return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 text-center"><LoadingSpinner /></div></div>; }

  const handleUpdateMoney = (newMoney: Money) => {
    updateCharacterData({ equipment: { ...character.equipment, money: normalizeCurrency(newMoney) } });
  };

  const handleCreateCustomItem = () => {
    if (!customItem.name || !customItem.cost) { setError('Name and cost are required'); return; }
    const newItemData = parseItemString(customItem.name);
    const itemDetails: GameItem = { name: customItem.name, weight: customItem.weight, id: '', category: customItem.category, cost: customItem.cost };
    const newInventory = mergeIntoInventory(character.equipment?.inventory || [], { ...newItemData, quantity: customItem.quantity }, itemDetails);
    updateInventory(newInventory);
    setShowCustomItemForm(false);
    setCustomItem({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1 });
  };

  const handleUseItem = (itemIndex: number) => {
    const newInventory = [...(character.equipment?.inventory || [])];
    if (newInventory[itemIndex].quantity > 1) {
      newInventory[itemIndex].quantity -= 1;
    } else {
      newInventory.splice(itemIndex, 1);
    }
    updateInventory(newInventory);
  };

  const handleToggleBackpackEquip = (backpackId: string) => {
    const currentInventory = character.equipment?.inventory || [];
    const newInventory = currentInventory.map((item: InventoryItem) => {
        if (item.id === backpackId) {
            // Toggle the clicked backpack
            return { ...item, isEquipped: !item.isEquipped };
        } else if (item.name.toLowerCase().includes('backpack')) {
            // Unequip any other backpacks
            return { ...item, isEquipped: false };
        }
        return item;
    });
    updateInventory(newInventory);
  };

  const handleEquipItem = (itemToEquip: InventoryItem, itemIndex: number) => {
    // --- UPDATED: Prevent equipping backpacks via this function ---
    if (itemToEquip.name.toLowerCase().includes('backpack')) {
        handleToggleBackpackEquip(itemToEquip.id);
        return;
    }

    const itemData = findItemDetails(itemToEquip.name);
    if (!itemData) { setError(`Details not found for: ${itemToEquip.name}`); return; }
    
    const currentEquipment = structuredClone(character.equipment!);
    if (currentEquipment.inventory[itemIndex].quantity > 1) {
      currentEquipment.inventory[itemIndex].quantity -= 1;
    } else {
      currentEquipment.inventory.splice(itemIndex, 1);
    }

    const categoryUpper = itemData.category?.toUpperCase() || '';
    const isWeaponOrShield = categoryUpper.includes('WEAPON') || itemData.name.toLowerCase().includes('shield');
    const isArmor = categoryUpper === 'ARMOR & HELMETS' && !isWeaponOrShield && !itemData.name.toLowerCase().includes('helmet');
    const isHelmet = categoryUpper === 'ARMOR & HELMETS' && !isWeaponOrShield && !isArmor;

    let unequippedItem: Omit<InventoryItem, 'id'> | null = null;

    if (isWeaponOrShield) {
        if ((currentEquipment.equipped.weapons?.length || 0) >= 3) {
            setError("Max 3 weapons/shields at hand.");
            const readdedInventory = mergeIntoInventory(currentEquipment.inventory, { name: itemToEquip.name, quantity: 1 });
            updateInventory(readdedInventory);
            return;
        }
        const newWeapon: EquippedWeapon = { name: itemToEquip.name, grip: itemData.grip || '1H', range: itemData.range, damage: itemData.damage, durability: itemData.durability, features: itemData.features || [] };
        if (!currentEquipment.equipped.weapons) currentEquipment.equipped.weapons = [];
        currentEquipment.equipped.weapons.push(newWeapon);
    } else if (isArmor) {
        if (currentEquipment.equipped.armor) unequippedItem = parseItemString(currentEquipment.equipped.armor);
        currentEquipment.equipped.armor = itemToEquip.name;
    } else if (isHelmet) {
        if (currentEquipment.equipped.helmet) unequippedItem = parseItemString(currentEquipment.equipped.helmet);
        currentEquipment.equipped.helmet = itemToEquip.name;
    }

    if (unequippedItem) {
        currentEquipment.inventory = mergeIntoInventory(currentEquipment.inventory, unequippedItem);
    }
    
    updateCharacterData({ equipment: currentEquipment });
  };

  const handleUnequipItem = (type: 'armor' | 'helmet' | 'weapon', identifier: string | number) => {
    const currentEquipment = structuredClone(character.equipment!);
    let itemNameToUnequip: string | null = null;
    if (type === 'armor') { itemNameToUnequip = currentEquipment.equipped.armor || null; currentEquipment.equipped.armor = undefined; }
    else if (type === 'helmet') { itemNameToUnequip = currentEquipment.equipped.helmet || null; currentEquipment.equipped.helmet = undefined; }
    else if (type === 'weapon' && typeof identifier === 'number') { itemNameToUnequip = currentEquipment.equipped.weapons?.[identifier]?.name || null; currentEquipment.equipped.weapons?.splice(identifier, 1); }
    if (itemNameToUnequip) {
      const newItem = parseItemString(itemNameToUnequip);
      const itemDetails = findItemDetails(itemNameToUnequip);
      currentEquipment.inventory = mergeIntoInventory(currentEquipment.inventory, newItem, itemDetails);
      updateCharacterData({ equipment: currentEquipment });
    }
  };

  const handleBuyItem = (item: GameItem) => {
      const itemCost = parseCost(item.cost);
      if(!itemCost) { setError("Invalid item cost."); return; }
      const { success, newMoney } = subtractCost(character.equipment!.money!, itemCost);
      if(!success) { setError("Not enough money."); return; }
      const newItem = parseItemString(item.name);
      const newInventory = mergeIntoInventory(character.equipment!.inventory!, newItem, item);
      updateCharacterData({ equipment: { ...character.equipment, inventory: newInventory, money: newMoney } });
  };

  const handleDropItem = (itemIndex: number) => {
      const newInventory = [...(character.equipment!.inventory || [])];
      newInventory.splice(itemIndex, 1);
      updateInventory(newInventory);
  };
  
  const equippedBackpack = useMemo(() => character.equipment?.inventory?.find((item: InventoryItem) => item.name.toLowerCase().includes('backpack') && item.isEquipped), [character.equipment?.inventory]);

  const filteredInventory = (character.equipment?.inventory || []).filter((item: InventoryItem) => 
      item.name?.toLowerCase().includes(filters.search.toLowerCase()) && !item.isEquipped
  );
  
  const sortedShopItems = allGameItems
    .filter(item => {
        if (!selectedShopGroup) return false;
        const matchesCategory = selectedShopGroup.categories.includes(item.category || '');
        return item.name.toLowerCase().includes(filters.search.toLowerCase()) && matchesCategory;
    })
    .sort((a, b) => {
        const costA = parseCost(a.cost)?.totalCopper || 0;
        const costB = parseCost(b.cost)?.totalCopper || 0;
        switch (sortOrder) {
            case 'cost-asc': return costA - costB;
            case 'cost-desc': return costB - costA;
            case 'name-desc': return b.name.localeCompare(a.name);
            case 'name-asc':
            default: return a.name.localeCompare(b.name);
        }
    });

  const renderEquippedItems = () => {
    const equipped = character.equipment?.equipped;
    if (!equipped || (!equipped.armor && !equipped.helmet && (!equipped.weapons || equipped.weapons.length === 0))) return null;
    return (
      <div className="pt-4 border-t"><h3 className="font-medium text-sm text-gray-600 mb-3">Equipped Items</h3><div className="space-y-2">
          {equipped.armor && <div className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{equipped.armor} (Armor)</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('armor', equipped.armor!)} disabled={isSaving}>Unequip</Button></div>}
          {equipped.helmet && <div className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{equipped.helmet} (Helmet)</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('helmet', equipped.helmet!)} disabled={isSaving}>Unequip</Button></div>}
          {equipped.weapons?.map((weapon, index) => (<div key={`${weapon.name}-${index}`} className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{weapon.name} ({weapon.grip === 'Shield' ? 'Shield' : `${weapon.grip} Weapon`})</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('weapon', index)} disabled={isSaving}>Unequip</Button></div>))}
      </div></div>
    );
  };
  
  // --- NEW: Component to render the equipped backpack ---
  const renderEquippedContainer = () => {
    if (!equippedBackpack) return null;
    return (
        <div className="mt-2">
            <h4 className="font-medium text-xs text-gray-500 mb-1">Equipped Container</h4>
            <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                <span className="text-sm font-medium text-blue-800">{equippedBackpack.name}</span>
                <Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleToggleBackpackEquip(equippedBackpack.id)} disabled={isSaving}>
                    Unequip
                </Button>
            </div>
        </div>
    );
  };


  return (
    <>
      {isMoneyModalOpen && (
        <MoneyManagementModal
          onClose={() => setIsMoneyModalOpen(false)}
          currentMoney={character.equipment?.money || { gold: 0, silver: 0, copper: 0 }}
          onUpdateMoney={handleUpdateMoney}
        />
      )}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-xl">
          <div className="p-4 md:p-6 border-b flex-shrink-0 bg-gray-50 rounded-t-lg">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
                <button
                  onClick={() => setIsMoneyModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium hover:bg-yellow-200 transition-colors"
                >
                  <Coins className="w-4 h-4" />
                  {formatCost(character.equipment?.money || { gold: 0, silver: 0, copper: 0 })}
                </button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={activeTab === 'inventory' ? 'primary' : 'secondary'} onClick={() => setActiveTab('inventory')}>Inventory</Button>
                <Button size="sm" variant={activeTab === 'shop' ? 'primary' : 'secondary'} onClick={() => setActiveTab('shop')}>Shop</Button>
                <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {activeTab === 'inventory' && (<div className="flex items-center gap-3 mt-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Search inventory..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"/></div>{(isAdmin() || isDM()) && (<Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowCustomItemForm(true)}>Custom Item</Button>)}</div>)}
            {activeTab === 'shop' && selectedShopGroup && (<div className="flex flex-wrap items-center gap-3 mt-3">
                <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setSelectedShopGroup(null)}>Back</Button>
                <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder={`Search in ${selectedShopGroup.name}...`} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"/></div>
                <div className="relative"><select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="appearance-none w-full bg-white border rounded-lg text-sm px-4 py-2 pr-8"><option value="name-asc">Sort: Name (A-Z)</option><option value="name-desc">Sort: Name (Z-A)</option><option value="cost-asc">Sort: Cost (Low-High)</option><option value="cost-desc">Sort: Cost (High-Low)</option></select></div>
            </div>)}
          </div>
          <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50">
            {(isLoadingGameItems || isSaving) && <div className="flex justify-center items-center py-10"><LoadingSpinner /><span className="ml-2">{isSaving ? 'Saving...' : 'Loading...'}</span></div>}
            
            {activeTab === 'shop' && !isSaving && (
              selectedShopGroup ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                      {sortedShopItems.map(item => (
                          <ShopItemCard key={item.id} item={item} onBuy={handleBuyItem} />
                      ))}
                  </div>
              ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {shopGroups.map((group) => (
                          <div key={group.name} className="flex flex-col items-center justify-center p-4 border bg-white rounded-lg hover:shadow-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setSelectedShopGroup(group)}>
                              <group.Icon className="w-12 h-12 text-blue-600 mb-3" />
                              <span className="font-medium text-center text-sm">{group.name}</span>
                          </div>
                      ))}
                  </div>
              )
            )}
            {activeTab === 'inventory' && !isSaving && (<>
                {renderEquippedItems()}
                
                {hasValidStrength ? (
                  <EncumbranceMeter load={encumbrance.load} capacity={encumbrance.capacity} isEncumbered={encumbrance.isEncumbered} />
                ) : (
                  <MissingStatWarning />
                )}

                {renderEquippedContainer()}

                <h3 className="font-medium text-sm text-gray-600 mt-6 mb-3 pt-4 border-t">Inventory Items</h3>
                <div className="space-y-3">
                  {filteredInventory.map((item, index) => {
                    const itemData = findItemDetails(item.name);
                    const originalIndex = character.equipment!.inventory.findIndex((invItem: InventoryItem) => invItem.id === item.id);
                    
                    const isBackpack = item.name.toLowerCase().includes('backpack');
                    const canBeEquipped = !isBackpack && itemData && (itemData.category?.toUpperCase().includes('WEAPON') || itemData.category?.toUpperCase().includes('ARMOR'));
                    const canBeUsed = item.quantity > 0 && itemData && (itemData.category?.toUpperCase() === 'MEDICINE' || itemData.category?.toUpperCase() === 'TRADE GOODS');
                    
                    return (
                      <div key={item.id} className="p-3 border rounded-lg flex items-center justify-between gap-2 bg-white">
                        <div className="flex-1 min-w-0"><h3 className="font-medium text-sm truncate">{formatInventoryItemName(item)}</h3></div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                           {canBeUsed && (<Button variant="outline" size="xs" icon={MinusCircle} onClick={() => handleUseItem(originalIndex)}>Use</Button>)}
                           {isBackpack && (<Button variant="secondary" size="xs" icon={CheckSquare} onClick={() => handleToggleBackpackEquip(item.id)}>Equip</Button>)}
                           {canBeEquipped && (<Button variant="secondary" size="xs" icon={CheckSquare} onClick={() => handleEquipItem(item, originalIndex)}>Equip</Button>)}
                           <Button variant="dangerOutline" size="xs" icon={Trash2} onClick={() => handleDropItem(originalIndex)}>Drop</Button>
                           {itemData && (
                              <span className="relative group flex items-center">
                                  <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
                                  <div className="absolute bottom-full right-0 mb-2 w-60 bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                      <h5 className="font-bold mb-1 border-b pb-1">{itemData.name}</h5>
                                      <p>{itemData.effect || itemData.description}</p>
                                      <p className="mt-1 text-gray-300">W: {itemData.weight ?? 'N/A'}, Cost: {itemData.cost || 'N/A'}</p>
                                  </div>
                              </span>
                           )}
                        </div>
                      </div>
                    );
                  })}
                  {(character.equipment?.inventory || []).length === 0 && !renderEquippedItems() && (<div className="text-center py-12"><Package className="w-12 h-12 mx-auto text-gray-300" /><p className="text-gray-500">Inventory is empty.</p><Button variant="link" size="sm" onClick={() => setActiveTab('shop')}>Go to Shop</Button></div>)}
                </div>
                {showCustomItemForm && (<div className="mt-6 p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-center mb-4"><h3 className="font-medium">Create Custom Item</h3><button onClick={() => setShowCustomItemForm(false)} className="p-1"><X className="w-5 h-5" /></button></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2"><label className="block text-xs mb-1">Name</label><input type="text" value={customItem.name} onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })} className="w-full p-1.5 border rounded text-sm"/></div>
                      <div><label className="block text-xs mb-1">Category</label><select value={customItem.category} onChange={(e) => setCustomItem({ ...customItem, category: e.target.value })} className="w-full p-1.5 border rounded text-sm">{itemCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                      <div><label className="block text-xs mb-1">Cost</label><input type="text" value={customItem.cost} onChange={(e) => setCustomItem({ ...customItem, cost: e.target.value })} className="w-full p-1.5 border rounded text-sm"/></div>
                      <div><label className="block text-xs mb-1">Weight</label><input type="number" value={customItem.weight} onChange={(e) => setCustomItem({ ...customItem, weight: Number(e.target.value) })} className="w-full p-1.5 border rounded text-sm"/></div>
                      <div><label className="block text-xs mb-1">Quantity</label><input type="number" value={customItem.quantity} onChange={(e) => setCustomItem({ ...customItem, quantity: Math.max(1, Number(e.target.value)) })} className="w-full p-1.5 border rounded text-sm"/></div>
                      <div className="md:col-span-3"><label className="block text-xs mb-1">Effect</label><textarea value={customItem.effect} onChange={(e) => setCustomItem({ ...customItem, effect: e.target.value })} className="w-full p-1.5 border rounded text-sm" rows={2}/></div>
                    </div>
                    <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" size="sm" onClick={() => setShowCustomItemForm(false)}>Cancel</Button><Button variant="primary" size="sm" icon={Plus} onClick={handleCreateCustomItem}>Add</Button></div>
                </div>)}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}