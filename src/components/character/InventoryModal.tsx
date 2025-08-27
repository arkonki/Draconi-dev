import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Search, Filter, ShoppingBag, Coins, AlertCircle, Shield, Sword,
  ArrowRight, ArrowLeft, Plus, Scale, X, Edit2, Wrench, Trash2, CheckSquare, MinusSquare,
  MinusCircle, Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { formatCost, subtractCost, parseCost, normalizeCurrency } from '../../lib/equipment';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Character, InventoryItem, EquippedWeapon } from '../../types/character';

// --- UTILITY FUNCTIONS (No separate file needed) ---

export const parseItemString = (itemString: string, allGameItems: GameItem[]): InventoryItem => {
  const quantityRegex = /(?:(\d+)\s*x\s+)|(?:x\s*(\d+))|(?:[(\[]x?(\d+)[)\]])|^(\d+)\s+/;
  const match = itemString.match(quantityRegex);
  let quantity = 1;
  let cleanName = itemString.trim();

  if (match) {
    const quantityStr = match[1] || match[2] || match[3] || match[4];
    if (quantityStr) quantity = parseInt(quantityStr, 10);
    cleanName = itemString.replace(match[0], '').trim();
  }

  const itemData = allGameItems.find(item => item.name.toLowerCase() === cleanName.toLowerCase());
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: cleanName,
    quantity: quantity,
    originalName: itemString,
    ...itemData
  };
};

export const formatInventoryItemName = (item: InventoryItem): string => {
  let name = item.name;
  if (item.quantity > 1) { name += ` (x${item.quantity})`; }
  if (item.unit) { name += ` (${item.unit})`; }
  return name;
};

export const mergeIntoInventory = (inventory: InventoryItem[], newItem: InventoryItem): InventoryItem[] => {
  const existingItemIndex = inventory.findIndex(item => item.name === newItem.name && !item.unit && !newItem.unit);
  const newInventory = [...inventory];
  if (existingItemIndex > -1) {
    newInventory[existingItemIndex].quantity += newItem.quantity;
  } else {
    newInventory.push(newItem);
  }
  return newInventory;
};

// --- COMPONENT START ---

interface InventoryModalProps {
  onClose: () => void;
}

const itemCategories = ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS', 'CLOTHES', 'MUSICAL INSTRUMENTS', 'TRADE GOODS', 'STUDIES & MAGIC', 'LIGHT SOURCES', 'TOOLS', 'CONTAINERS', 'MEDICINE', 'SERVICES', 'HUNTING & FISHING', 'MEANS OF TRAVEL', 'ANIMALS'];
const shopGroups = [{ name: 'Armor & Weapons', categories: ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS'], Icon: Shield }, { name: 'Clothing & Accessories', categories: ['CLOTHES'], Icon: Package }, { name: 'Musical & Trade Goods', categories: ['MUSICAL INSTRUMENTS', 'TRADE GOODS'], Icon: ShoppingBag }, { name: 'Magic & Studies', categories: ['STUDIES & MAGIC'], Icon: Scale }, { name: 'Light & Tools', categories: ['LIGHT SOURCES', 'TOOLS'], Icon: Wrench }, { name: 'Containers & Medicine', categories: ['CONTAINERS', 'MEDICINE'], Icon: Package }, { name: 'Services', categories: ['SERVICES'], Icon: ShoppingBag }, { name: 'Hunting & Travel', categories: ['HUNTING & FISHING', 'MEANS OF TRAVEL'], Icon: ArrowRight }, { name: 'Animals', categories: ['ANIMALS'], Icon: Edit2 }];

// --- FIX: Restored the 'export' keyword ---
export function InventoryModal({ onClose }: InventoryModalProps) {
  const { isAdmin, isDM } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'shop' | 'money'>('inventory');
  const [filters, setFilters] = useState({ search: '', category: 'all' });
  const [customItem, setCustomItem] = useState({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1, unit: '' });
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [selectedShopGroup, setSelectedShopGroup] = useState<{ name: string; categories: string[]; Icon: React.ComponentType<{ className?: string }>; } | null>(null);

  const { character, updateCharacterData, updateInventory, isSaving, saveError } = useCharacterSheetStore();
  const { data: allGameItems = [], isLoading: isLoadingGameItems } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });

  useEffect(() => {
    if (character && allGameItems.length > 0) {
      const inventory = character.equipment?.inventory;
      if (inventory && inventory.length > 0 && typeof inventory[0] === 'string') {
        let hydratedInventory: InventoryItem[] = [];
        for (const itemString of inventory as unknown as string[]) {
          hydratedInventory = mergeIntoInventory(hydratedInventory, parseItemString(itemString, allGameItems));
        }
        updateInventory(hydratedInventory);
      }
    }
  }, [character, allGameItems, updateInventory]);
  
  if (!character) { return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 text-center"><LoadingSpinner /></div></div>; }

  const findItemDetails = (itemName: string): GameItem | undefined => allGameItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  
  const handleMoneyChange = (type: 'gold' | 'silver' | 'copper', amount: number) => {
    const currentMoney = character.equipment?.money || { gold: 0, silver: 0, copper: 0 };
    const newMoneyValue = Math.max(0, (currentMoney[type] || 0) + amount);
    updateCharacterData({ equipment: { ...character.equipment, money: normalizeCurrency({ ...currentMoney, [type]: newMoneyValue }) } as any });
  };

  const handleCreateCustomItem = () => {
    if (!customItem.name || !customItem.cost) { setError('Name and cost are required'); return; }
    const newItem: InventoryItem = { id: `custom-${Date.now()}`, name: customItem.name.trim(), quantity: customItem.quantity, unit: customItem.unit?.trim() || undefined, originalName: formatInventoryItemName(customItem), ...customItem };
    updateInventory(mergeIntoInventory(character.equipment?.inventory || [], newItem));
    setShowCustomItemForm(false);
    setCustomItem({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1, unit: '' });
  };

  const handleUseItem = (itemIndex: number) => {
    const currentInventory = [...(character.equipment?.inventory || [])];
    const itemToUse = { ...currentInventory[itemIndex] };
    if (itemToUse.quantity > 1) {
      itemToUse.quantity -= 1;
      currentInventory[itemIndex] = itemToUse;
    } else {
      currentInventory.splice(itemIndex, 1);
    }
    updateInventory(currentInventory);
  };

  const handleEquipItem = (itemToEquip: InventoryItem, itemIndex: number) => {
    const itemData = findItemDetails(itemToEquip.name);
    if (!itemData) { setError(`Details not found for: ${itemToEquip.name}`); return; }
    
    const currentEquipment = structuredClone(character.equipment!);
    const inventoryItem = currentEquipment.inventory[itemIndex];
    if (inventoryItem.quantity > 1) {
      inventoryItem.quantity -= 1;
    } else {
      currentEquipment.inventory.splice(itemIndex, 1);
    }

    const categoryUpper = itemData.category?.toUpperCase() || '';
    const isWeaponOrShield = categoryUpper.includes('WEAPON') || itemData.name.toLowerCase().includes('shield');
    const isArmor = categoryUpper === 'ARMOR & HELMETS' && !isWeaponOrShield && !itemData.name.toLowerCase().includes('helmet');
    const isHelmet = categoryUpper === 'ARMOR & HELMETS' && !isWeaponOrShield && !isArmor;

    let unequippedItem: InventoryItem | null = null;

    if (isWeaponOrShield) {
      if ((currentEquipment.equipped.weapons?.length || 0) >= 3) { setError("Max 3 weapons/shields at hand."); return; }
      const newWeapon: EquippedWeapon = { name: itemToEquip.name, grip: itemData.grip || '1H', range: itemData.range, damage: itemData.damage, durability: itemData.durability, features: itemData.features || [] };
      if (!currentEquipment.equipped.weapons) currentEquipment.equipped.weapons = [];
      currentEquipment.equipped.weapons.push(newWeapon);
    } else if (isArmor) {
      if (currentEquipment.equipped.armor) unequippedItem = parseItemString(currentEquipment.equipped.armor, allGameItems);
      currentEquipment.equipped.armor = itemToEquip.name;
    } else if (isHelmet) {
      if (currentEquipment.equipped.helmet) unequippedItem = parseItemString(currentEquipment.equipped.helmet, allGameItems);
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
      currentEquipment.inventory = mergeIntoInventory(currentEquipment.inventory, parseItemString(itemNameToUnequip, allGameItems));
      updateCharacterData({ equipment: currentEquipment });
    }
  };

  const handleBuyItem = (item: GameItem) => {
      const itemCost = parseCost(item.cost);
      if(!itemCost) { setError("Invalid item cost."); return; }
      const { success, newMoney } = subtractCost(character.equipment!.money!, itemCost);
      if(!success) { setError("Not enough money."); return; }
      const newInventory = mergeIntoInventory(character.equipment!.inventory!, parseItemString(item.name, allGameItems));
      updateCharacterData({ equipment: { ...character.equipment, inventory: newInventory, money: newMoney } as any});
  };

  const handleDropItem = (itemIndex: number) => {
      const newInventory = [...(character.equipment!.inventory || [])];
      newInventory.splice(itemIndex, 1);
      updateInventory(newInventory);
  };
  
  const filteredInventory = (character.equipment?.inventory || []).filter(item => typeof item === 'object' && item.name?.toLowerCase().includes(filters.search.toLowerCase()));
  const filteredShopItems = allGameItems.filter(item => {
    if (!selectedShopGroup) return false;
    const matchesCategory = selectedShopGroup.categories.includes(item.category || '');
    return item.name.toLowerCase().includes(filters.search.toLowerCase()) && matchesCategory;
  });

  const renderEquippedItems = () => {
    const equipped = character.equipment?.equipped;
    if (!equipped || (!equipped.armor && !equipped.helmet && (!equipped.weapons || equipped.weapons.length === 0))) return null;
    return (
      <div className="mt-6 pt-4 border-t"><h3 className="font-medium text-sm text-gray-600 mb-3">Equipped Items</h3><div className="space-y-2">
          {equipped.armor && <div className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{equipped.armor} (Armor)</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('armor', equipped.armor!)} disabled={isSaving}>Unequip</Button></div>}
          {equipped.helmet && <div className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{equipped.helmet} (Helmet)</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('helmet', equipped.helmet!)} disabled={isSaving}>Unequip</Button></div>}
          {equipped.weapons?.map((weapon, index) => (<div key={`${weapon.name}-${index}`} className="flex items-center justify-between p-2 bg-gray-100 rounded"><span className="text-sm font-medium">{weapon.name} ({weapon.grip === 'Shield' ? 'Shield' : `${weapon.grip} Weapon`})</span><Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('weapon', index)} disabled={isSaving}>Unequip</Button></div>))}
      </div></div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-4 md:p-6 border-b flex-shrink-0 bg-gray-50 rounded-t-lg">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div className="flex items-center gap-3"><h2 className="text-xl md:text-2xl font-bold text-gray-800">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2><div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium"><Coins className="w-4 h-4" />{formatCost(character.equipment?.money || { gold: 0, silver: 0, copper: 0 })}</div></div>
            <div className="flex gap-2"><Button size="sm" variant={activeTab === 'inventory' ? 'primary' : 'secondary'} onClick={() => setActiveTab('inventory')}>Inventory</Button><Button size="sm" variant={activeTab === 'shop' ? 'primary' : 'secondary'} onClick={() => setActiveTab('shop')}>Shop</Button><Button size="sm" variant={activeTab === 'money' ? 'primary' : 'secondary'} onClick={() => setActiveTab('money')}>Money</Button><button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200"><X className="w-5 h-5" /></button></div>
          </div>
          {activeTab === 'inventory' && (<div className="flex items-center gap-3 mt-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Search inventory..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"/></div>{(isAdmin() || isDM()) && (<Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowCustomItemForm(true)}>Custom Item</Button>)}</div>)}
          {activeTab === 'shop' && selectedShopGroup && (<div className="flex items-center gap-3 mt-3"><Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setSelectedShopGroup(null)}>Back</Button><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder={`Search in ${selectedShopGroup.name}...`} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"/></div></div>)}
        </div>
        <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-white">
          {(isLoadingGameItems || isSaving) && <div className="flex justify-center items-center py-10"><LoadingSpinner /><span className="ml-2">{isSaving ? 'Saving...' : 'Loading...'}</span></div>}
          {activeTab === 'money' && !isSaving && (
             <div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="p-4 bg-yellow-50 rounded-lg border"><h3 className="font-medium mb-3 text-center">Gold</h3><div className="flex items-center justify-center gap-3"><Button size="sm" variant="secondary" onClick={() => handleMoneyChange('gold', -1)}>-</Button><span className="text-xl font-bold min-w-[3ch] text-center">{character.equipment?.money?.gold || 0}</span><Button size="sm" variant="secondary" onClick={() => handleMoneyChange('gold', 1)}>+</Button></div></div><div className="p-4 bg-gray-100 rounded-lg border"><h3 className="font-medium mb-3 text-center">Silver</h3><div className="flex items-center justify-center gap-3"><Button size="sm" variant="secondary"onClick={() => handleMoneyChange('silver', -1)}>-</Button><span className="text-xl font-bold min-w-[3ch] text-center">{character.equipment?.money?.silver || 0}</span><Button size="sm" variant="secondary" onClick={() => handleMoneyChange('silver', 1)}>+</Button></div></div><div className="p-4 bg-orange-50 rounded-lg border"><h3 className="font-medium mb-3 text-center">Copper</h3><div className="flex items-center justify-center gap-3"><Button size="sm" variant="secondary" onClick={() => handleMoneyChange('copper', -1)}>-</Button><span className="text-xl font-bold min-w-[3ch] text-center">{character.equipment?.money?.copper || 0}</span><Button size="sm" variant="secondary" onClick={() => handleMoneyChange('copper', 1)}>+</Button></div></div></div></div>
          )}
          {activeTab === 'shop' && !isSaving && (
            selectedShopGroup ? (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filteredShopItems.map(item => (<div key={item.id} className="flex flex-col p-3 border rounded-lg"><div className="flex-1 mb-2"><h4 className="font-medium text-sm">{item.name}</h4><p className="text-xs text-gray-500">{item.category}</p></div><div className="flex justify-between items-center mt-2 pt-2 border-t"><span className="text-xs font-semibold text-green-700">{item.cost || 'N/A'}</span><Button variant="primary" size="xs" onClick={() => handleBuyItem(item)} disabled={!item.cost}>Buy</Button></div></div>))}</div>) : (<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{shopGroups.map((group) => (<div key={group.name} className="flex flex-col items-center justify-center p-4 border rounded-lg hover:shadow-lg cursor-pointer" onClick={() => setSelectedShopGroup(group)}><group.Icon className="w-10 h-10 text-blue-600 mb-2" /><span className="font-medium text-center text-sm">{group.name}</span></div>))}</div>)
          )}
          {activeTab === 'inventory' && !isSaving && (<>
              {renderEquippedItems()}
              <h3 className="font-medium text-sm text-gray-600 mt-6 mb-3 pt-4 border-t">Inventory Items</h3>
              <div className="space-y-3">
                {filteredInventory.map((item, index) => {
                  const originalIndex = character.equipment!.inventory.findIndex(invItem => invItem.id === item.id);
                  const itemData = findItemDetails(item.name);
                  const canBeEquipped = itemData && (itemData.category?.toUpperCase().includes('WEAPON') || itemData.category?.toUpperCase().includes('ARMOR'));
                  const canBeUsed = item.quantity > 0 && itemData && (itemData.category?.toUpperCase() === 'MEDICINE' || itemData.category?.toUpperCase() === 'TRADE GOODS');
                  return (
                    <div key={item.id || `${item.name}-${index}`} className="p-3 border rounded-lg flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0"><h3 className="font-medium text-sm truncate">{formatInventoryItemName(item)}</h3></div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                         {canBeUsed && (<Button variant="outline" size="xs" icon={MinusCircle} onClick={() => handleUseItem(originalIndex)}>Use</Button>)}
                         {canBeEquipped && (<Button variant="secondary" size="xs" icon={CheckSquare} onClick={() => handleEquipItem(item, originalIndex)}>Equip</Button>)}
                         <Button variant="dangerOutline" size="xs" icon={Trash2} onClick={() => handleDropItem(originalIndex)}>Drop</Button>
                         {(itemData?.effect || itemData?.description) && (
                            <span className="relative group flex items-center">
                                <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
                                <div className="absolute bottom-full right-0 mb-2 w-60 bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"><h5 className="font-bold mb-1 border-b pb-1">{itemData.name}</h5><p>{itemData.effect || itemData.description}</p><p className="mt-1 text-gray-300">W: {itemData.weight || 'N/A'}, Cost: {itemData.cost || 'N/A'}</p></div>
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
  );
}
