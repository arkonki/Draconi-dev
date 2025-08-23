import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Search, Filter, ShoppingBag, Coins, AlertCircle, Shield, Sword,
  ArrowRight, ArrowLeft, Plus, Scale, X, Edit2, Wrench, Trash2, CheckSquare, MinusSquare,
  MinusCircle, Info // Added Info for tooltip trigger
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { GameItem } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { formatCost, subtractCost, parseCost } from '../../lib/equipment';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Character, InventoryItem, EquippedItems, EquippedWeapon } from '../../types/character'; // Import necessary types
import { parseItemString, formatInventoryItemName, mergeIntoInventory } from '../../lib/inventoryUtils';

interface InventoryModalProps {
  onClose: () => void;
}

const itemCategories = [
  'ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS', 'CLOTHES',
  'MUSICAL INSTRUMENTS', 'TRADE GOODS', 'STUDIES & MAGIC', 'LIGHT SOURCES',
  'TOOLS', 'CONTAINERS', 'MEDICINE', 'SERVICES', 'HUNTING & FISHING',
  'MEANS OF TRAVEL', 'ANIMALS'
];
const shopGroups = [
  { name: 'Armor & Weapons', categories: ['ARMOR & HELMETS', 'MELEE WEAPONS', 'RANGED WEAPONS'], Icon: Shield },
  { name: 'Clothing & Accessories', categories: ['CLOTHES'], Icon: Package },
  { name: 'Musical & Trade Goods', categories: ['MUSICAL INSTRUMENTS', 'TRADE GOODS'], Icon: ShoppingBag },
  { name: 'Magic & Studies', categories: ['STUDIES & MAGIC'], Icon: Scale },
  { name: 'Light & Tools', categories: ['LIGHT SOURCES', 'TOOLS'], Icon: Wrench },
  { name: 'Containers & Medicine', categories: ['CONTAINERS', 'MEDICINE'], Icon: Package },
  { name: 'Services', categories: ['SERVICES'], Icon: ShoppingBag },
  { name: 'Hunting & Travel', categories: ['HUNTING & FISHING', 'MEANS OF TRAVEL'], Icon: ArrowRight },
  { name: 'Animals', categories: ['ANIMALS'], Icon: Edit2 } // Assuming Edit2 is appropriate
];

export function InventoryModal({ onClose }: InventoryModalProps) {
  const { isAdmin, isDM } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'shop' | 'money'>('inventory');
  const [filters, setFilters] = useState({ search: '',category: 'all' });
  const [customItem, setCustomItem] = useState({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1, unit: '' });
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [selectedShopGroup, setSelectedShopGroup] = useState<{name: string; categories: string[]; Icon: React.ComponentType<{ className?: string }>; } | null>(null);

  // Use store for character data and actions
  const {
      character,
      updateCharacterData,
      updateInventory,
      isSaving,
      saveError,
      allGameItems,
      isLoadingGameItems,
      _loadGameItems // Get internal action to load items if needed
  } = useCharacterSheetStore(state => ({
      character: state.character,
      updateCharacterData: state.updateCharacterData,
      updateInventory: state.updateInventory,
      isSaving: state.isSaving,
      saveError: state.saveError,
      allGameItems: state.allGameItems,
      isLoadingGameItems: state.isLoadingGameItems,
      _loadGameItems: state._loadGameItems, // Include the action
  }));

  // Trigger loading game items on mount if not already loaded/loading
  useEffect(() => {
      if (allGameItems.length === 0 && !isLoadingGameItems) {
          _loadGameItems();
      }
  }, [_loadGameItems, allGameItems, isLoadingGameItems]);


  useEffect(() => {
    if (saveError) {
        setError(`Save failed: ${saveError}`);
        // Optionally clear the error after a delay
        const timer = setTimeout(() => setError(null), 5000);
        return () => clearTimeout(timer);
    } else {
        setError(null);
    }
  }, [saveError]);


  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-gray-600">Loading character data...</p>
        </div>
      </div>
    );
  }

  // Helper to find item details from the fetched list
  const findItemDetails = (itemName: string): GameItem | undefined => {
    if (!itemName || typeof itemName !== 'string') return undefined;
    // Use the game items loaded into the store
    return allGameItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  };

  const handleMoneyChange = (type: 'gold' | 'silver' | 'copper', amount: number) => {
    setError(null);
    const currentMoney = character.equipment?.money || { gold: 0, silver: 0, copper: 0 };
    const newMoneyValue = Math.max(0, (currentMoney[type] || 0) + amount);

    // Update via updateCharacterData as it modifies the nested money object
    updateCharacterData({
        equipment: {
            ...(character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }), // Ensure base structure
            money: {
                ...currentMoney,
                [type]: newMoneyValue
            }
        }
    });
  };

  const handleCreateCustomItem = () => {
    setError(null);
    if (!customItem.name || !customItem.cost) {
      setError('Name and cost are required for custom items');
      return;
    }
    const parsedCost = parseCost(customItem.cost);
    if (!parsedCost) {
        setError('Invalid cost format. Use e.g., "10 silver", "1 gold 5 copper".');
        return;
    }

    // Create the InventoryItem object
    const newItem: InventoryItem = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(7)}`, // More robust unique ID
        name: customItem.name.trim(),
        quantity: customItem.quantity > 0 ? customItem.quantity : 1,
        unit: customItem.unit?.trim() || undefined,
        originalName: formatInventoryItemName({ name: customItem.name.trim(), quantity: customItem.quantity, unit: customItem.unit?.trim() }), // Use formatter for consistency
        cost: customItem.cost, // Store the string cost
        weight: customItem.weight,
        category: customItem.category,
        effect: customItem.effect || undefined, // Store effect or undefined
    };

    const currentInventory = character.equipment?.inventory || [];
    const newInventory = mergeIntoInventory(currentInventory, newItem);
    updateInventory(newInventory); // Use the dedicated inventory update action

    setShowCustomItemForm(false);
    setCustomItem({ name: '', category: 'TRADE GOODS', cost: '1 silver', weight: 1, effect: '', quantity: 1, unit: '' }); // Reset form
  };

  // --- Updated Equip Logic ---
  const handleEquipItem = (itemToEquip: InventoryItem, itemIndex: number) => {
    setError(null);
    const itemData = findItemDetails(itemToEquip.name);
    if (!itemData) {
      setError(`Details not found for item: ${itemToEquip.name}`);
      // console.error("Could not find item details in allGameItems for:", itemToEquip.name); // Removed debug
      return;
    }

    const currentEquipment = structuredClone(character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } });
    const currentInventory = currentEquipment.inventory;
    const currentEquipped = currentEquipment.equipped;

    // 1. Verify and Update Inventory
    const inventoryItem = currentInventory[itemIndex];
    if (!inventoryItem || inventoryItem.id !== itemToEquip.id) {
        setError(`Item "${itemToEquip.name}" not found at expected index ${itemIndex}. Inventory might be out of sync.`);
        // console.error("Inventory state mismatch on equip:", currentInventory, itemToEquip, itemIndex); // Removed debug
        return;
    }

    if (inventoryItem.quantity > 1) {
        currentInventory[itemIndex] = { ...inventoryItem, quantity: inventoryItem.quantity - 1 };
    } else {
        currentInventory.splice(itemIndex, 1); // Remove item completely
    }

    // 2. Handle Equipped Update
    const categoryUpper = typeof itemData.category === 'string' ? itemData.category.toUpperCase() : '';
    let itemAddedToInventory: InventoryItem | null = null; // Track item being unequipped

    try { // Wrap equip logic in try-catch for better error handling
        if (categoryUpper === 'ARMOR & HELMETS') {
            const isHelmet = itemData.name.toLowerCase().includes('helmet');
            const slot = isHelmet ? 'helmet' : 'armor';
            const oldItemName = currentEquipped[slot];

            if (oldItemName) {
                const oldItemDetails = findItemDetails(oldItemName);
                itemAddedToInventory = parseItemString(oldItemName, allGameItems); // Parse back into object
                itemAddedToInventory.quantity = 1;
                if (!oldItemDetails) {
                    // console.warn(`Could not find details for previously equipped item: ${oldItemName}`); // Removed debug
                    // Keep basic object if details missing
                }
            }
            currentEquipped[slot] = itemToEquip.name; // Equip new item (store base name)

        } else if (categoryUpper === 'MELEE WEAPONS' || categoryUpper === 'RANGED WEAPONS') {
            if (!currentEquipped.weapons) currentEquipped.weapons = [];

            // Check for two-handed weapon replacing others
            if (itemData.grip === '2H' && currentEquipped.weapons.length > 0) {
                 // Unequip all existing weapons
                 currentEquipped.weapons.forEach(wpn => {
                     const unequipped = parseItemString(wpn.name, allGameItems);
                     unequipped.quantity = 1;
                     // Ensure itemAddedToInventory is an array before merging
                     const baseInventoryForMerge = itemAddedToInventory ? [itemAddedToInventory] : [];
                     itemAddedToInventory = mergeIntoInventory(baseInventoryForMerge, unequipped)[0];
                 });
                 currentEquipped.weapons = []; // Clear existing weapons
            }
            // Check if adding a weapon exceeds hand limits (e.g., already holding 2H or two 1H)
            const handsUsed = currentEquipped.weapons.reduce((sum, w) => sum + (w.grip === '2H' ? 2 : 1), 0);
            const newWeaponHands = itemData.grip === '2H' ? 2 : 1;
            if (handsUsed + newWeaponHands > 2) {
                 throw new Error(`Cannot equip ${itemToEquip.name}. Not enough free hands.`);
            }

            // Add the new weapon
            const newWeapon: EquippedWeapon = {
                name: itemToEquip.name,
                grip: itemData.grip || '1H',
                range: itemData.range || 'Melee',
                damage: itemData.damage || '1d6',
                durability: itemData.durability,
                features: itemData.features || [], // Ensure features is an array
            };
            currentEquipped.weapons.push(newWeapon);

        } else {
            throw new Error(`Item "${itemToEquip.name}" category "${itemData.category}" is not directly equippable.`);
        }

        // 3. Merge Unequipped Item(s) back into Inventory
        if (itemAddedToInventory) {
            currentEquipment.inventory = mergeIntoInventory(currentInventory, itemAddedToInventory);
        } else {
             currentEquipment.inventory = currentInventory; // Assign updated inventory if nothing was unequipped
        }


        // 4. Persist Changes
        updateCharacterData({ equipment: currentEquipment });

    } catch (equipError: any) {
        // console.error("Error during equip:", equipError); // Removed debug
        setError(equipError.message || "Failed to equip item.");
        // IMPORTANT: Do not persist changes if an error occurred during equip logic
        // The optimistic update in updateCharacterData will be reverted by the store if the API call fails,
        // but here we prevent the API call altogether if the equip logic itself fails.
    }
  };

  // --- Updated Unequip Logic ---
  const handleUnequipItem = (type: 'armor' | 'helmet' | 'weapon', identifier: string | number) => {
      setError(null);
      const currentEquipment = structuredClone(character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } });

      if (!currentEquipment.equipped) return; // Nothing equipped

      let itemNameToUnequip: string | null = null;
      let updatedEquipped = currentEquipment.equipped;
      let updatedInventory = currentEquipment.inventory;

      // 1. Remove from Equipped
      if (type === 'armor' && updatedEquipped.armor) {
          itemNameToUnequip = updatedEquipped.armor;
          updatedEquipped.armor = undefined; // Use undefined to remove key
      } else if (type === 'helmet' && updatedEquipped.helmet) {
          itemNameToUnequip = updatedEquipped.helmet;
          updatedEquipped.helmet = undefined;
      } else if (type === 'weapon' && typeof identifier === 'number' && updatedEquipped.weapons?.[identifier]) {
          itemNameToUnequip = updatedEquipped.weapons[identifier].name;
          updatedEquipped.weapons.splice(identifier, 1);
      } else {
          setError(`Could not find item to unequip (${type}, ${identifier})`);
          // console.error("Unequip failed:", type, identifier, updatedEquipped); // Removed debug
          return;
      }

      // 2. Add back to Inventory
      if (itemNameToUnequip) {
          const itemDetails = findItemDetails(itemNameToUnequip);
          let itemToAddBack: InventoryItem;

          itemToAddBack = parseItemString(itemNameToUnequip, allGameItems); // Parse back into object
          itemToAddBack.quantity = 1; // Unequipping one item
          if (!itemDetails) {
              // console.warn(`Details not found for unequipped item: ${itemNameToUnequip}. Adding basic entry.`); // Removed debug
              // Keep the basic parsed object
          }

          updatedInventory = mergeIntoInventory(updatedInventory, itemToAddBack);

          // 3. Persist Changes
          updateCharacterData({
              equipment: {
                  ...currentEquipment, // Keep money etc.
                  inventory: updatedInventory,
                  equipped: updatedEquipped
              }
          });
      } else {
          // If somehow itemNameToUnequip was null, still save potential equipped changes (like empty weapon array)
          updateCharacterData({ equipment: currentEquipment });
      }
  };

  // --- Updated Buy Logic ---
  const handleBuyItem = (item: GameItem) => {
      setError(null);
      const itemCost = parseCost(item.cost);
      if (!itemCost) {
          setError(`Invalid cost format for item: ${item.name} (${item.cost})`);
          return;
      }
      const currentMoney = character.equipment?.money || { gold: 0, silver: 0, copper: 0 };

      const { success, newMoney } = subtractCost(currentMoney, itemCost);

      if (!success) {
          setError("Not enough money to buy this item.");
          setTimeout(() => setError(null), 3000);
          return;
      }

      // Parse the bought GameItem into an InventoryItem
      const newItemObject = parseItemString(item.name || 'Unknown Item', allGameItems);
      if (newItemObject.quantity <= 0) newItemObject.quantity = 1; // Ensure quantity is at least 1

      const currentInventory = character.equipment?.inventory || [];
      const newInventory = mergeIntoInventory(currentInventory, newItemObject);

      // Persist changes (inventory and money)
      updateCharacterData({
          equipment: {
              ...(character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }), // Base structure
              inventory: newInventory,
              money: newMoney
          }
      });
  };

  // --- Updated Drop Logic ---
  const handleDropItem = (itemIndex: number) => {
      setError(null);
      const currentInventory = [...(character.equipment?.inventory || [])];
      if (itemIndex < 0 || itemIndex >= currentInventory.length) {
          setError("Invalid item index for dropping.");
          return;
      }
      currentInventory.splice(itemIndex, 1); // Remove the item object
      // console.log("Dropped item:", droppedItem[0]?.name); // Removed debug
      updateInventory(currentInventory); // Update store via specific action
  };

  // --- NEW: Use Item Logic ---
  const handleUseItem = (itemIndex: number) => {
      setError(null);
      const currentInventory = [...(character.equipment?.inventory || [])];
      if (itemIndex < 0 || itemIndex >= currentInventory.length) {
          setError("Invalid item index for using.");
          return;
      }

      const itemToUse = { ...currentInventory[itemIndex] }; // Copy item

      // Basic consumable logic: decrement quantity or remove
      // More complex logic (applying effects) would go here or be triggered from here
      // console.log(`Using item: ${itemToUse.name}`); // Removed debug

      if (itemToUse.quantity > 1) {
          itemToUse.quantity -= 1;
          currentInventory[itemIndex] = itemToUse; // Update item in array
      } else {
          currentInventory.splice(itemIndex, 1); // Remove item if quantity becomes 0
      }

      updateInventory(currentInventory); // Update store via specific action
  };


  // Filter inventory using character from store
  const filteredInventory = (character.equipment?.inventory || []).filter(item => {
    if (!item || typeof item.name !== 'string') {
        // console.warn("Inventory item missing or has invalid name:", item); // Removed debug
        return false; // Skip this item if name is invalid
    }
    const nameLower = item.name.toLowerCase(); // Now safe to call
    const searchLower = filters.search.toLowerCase();
    const itemDetails = findItemDetails(item.name); // Find details for category
    const categoryUpper = typeof itemDetails?.category === 'string' ? itemDetails.category.toUpperCase() : '';

    const originalNameLower = typeof item.originalName === 'string' ? item.originalName.toLowerCase() : '';
    const matchesSearch = nameLower.includes(searchLower) || originalNameLower.includes(searchLower);
    const matchesCategory = filters.category === 'all' || categoryUpper === filters.category.toUpperCase();

    return matchesSearch && matchesCategory;
  });

  // Filter shop items
  const filteredShopItems = allGameItems.filter(item => {
      if (!item || typeof item.name !== 'string') {
          // console.warn("Shop item missing or has invalid name:", item); // Removed debug
          return false;
      }
      const nameLower = item.name.toLowerCase();
      const searchLower = filters.search.toLowerCase();
      const categoryUpper = typeof item.category === 'string' ? item.category.toUpperCase() : '';

      const matchesSearch = nameLower.includes(searchLower);
      const matchesCategory = selectedShopGroup
          ? selectedShopGroup.categories.includes(categoryUpper || '')
          : filters.category === 'all' || categoryUpper === filters.category.toUpperCase();
      return matchesSearch && matchesCategory;
  });

  // Render Equipped Items
  const renderEquippedItems = () => {
    const equipped = character.equipment?.equipped;
    if (!equipped || (!equipped.armor && !equipped.helmet && (!equipped.weapons || equipped.weapons.length === 0))) {
      return null; // Render nothing if no items are equipped
    }

    return (
      <div className="mt-6 pt-4 border-t">
        <h3 className="font-medium text-sm text-gray-600 mb-3">Equipped Items</h3>
        <div className="space-y-2">
          {equipped.armor && (
            <div className="flex items-center justify-between p-2 bg-gray-100 rounded">
              <span className="text-sm font-medium">{equipped.armor} (Armor)</span>
              <Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('armor', equipped.armor!)} disabled={isSaving} title={`Unequip ${equipped.armor}`}>Unequip</Button>
            </div>
          )}
          {equipped.helmet && (
            <div className="flex items-center justify-between p-2 bg-gray-100 rounded">
              <span className="text-sm font-medium">{equipped.helmet} (Helmet)</span>
              <Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('helmet', equipped.helmet!)} disabled={isSaving} title={`Unequip ${equipped.helmet}`}>Unequip</Button>
            </div>
          )}
          {equipped.weapons?.map((weapon, index) => (
            <div key={`${weapon.name}-${index}`} className="flex items-center justify-between p-2 bg-gray-100 rounded">
              <span className="text-sm font-medium">{weapon.name} ({weapon.grip} Weapon)</span>
              <Button variant="secondary" size="xs" icon={MinusSquare} onClick={() => handleUnequipItem('weapon', index)} disabled={isSaving} title={`Unequip ${weapon.name}`}>Unequip</Button>
            </div>
          ))}
        </div>
      </div>
    );
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
         <div className="p-4 md:p-6 border-b flex-shrink-0 bg-gray-50 rounded-t-lg">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
             <div className="flex items-center gap-3">
               <h2 className="text-xl md:text-2xl font-bold text-gray-800">
                 {activeTab === 'inventory' ? 'Inventory & Equipped' : activeTab === 'shop' ? 'Shop' : 'Money'}
               </h2>
               <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs md:text-sm font-medium">
                 <Coins className="w-3 h-3 md:w-4 md:h-4" />
                 {formatCost(character.equipment?.money || { gold: 0, silver: 0, copper: 0 })}
               </div>
             </div>
             <div className="flex gap-2">
                {/* Tab Buttons */}
                <Button size="sm" variant={activeTab === 'inventory' ? 'primary' : 'secondary'} onClick={() => { setActiveTab('inventory'); setSelectedShopGroup(null); }}>Inventory</Button>
                <Button size="sm" variant={activeTab === 'shop' ? 'primary' : 'secondary'} onClick={() => { setActiveTab('shop'); setSelectedShopGroup(null); }}>Shop</Button>
                <Button size="sm" variant={activeTab === 'money' ? 'primary' : 'secondary'} onClick={() => { setActiveTab('money'); setSelectedShopGroup(null); }}>Money</Button>
                <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-200 transition-colors">
                    <X className="w-5 h-5" />
                </button>
             </div>
           </div>
           {/* Filters */}
           {(activeTab === 'inventory' || (activeTab === 'shop' && !selectedShopGroup)) && (
             <div className="flex flex-col md:flex-row gap-3 mt-3">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                 <input
                   type="text"
                   placeholder={`Search ${activeTab === 'inventory' ? 'inventory by name' : 'shop'}...`}
                   value={filters.search}
                   onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                   className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                 />
               </div>
               <div className="relative">
                 <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                 <select
                   value={filters.category}
                   onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                   className="w-full md:w-auto pl-9 pr-8 py-2 border rounded-lg appearance-none bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
                 >
                   <option value="all">All Categories</option>
                   {itemCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                 </select>
               </div>
               {activeTab === 'inventory' && (isAdmin() || isDM()) && (
                 <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowCustomItemForm(true)}>Custom Item</Button>
               )}
             </div>
           )}
           {/* Shop Group Back Button */}
           {activeTab === 'shop' && selectedShopGroup && (
                <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setSelectedShopGroup(null)} className="mt-3">Back to Categories</Button>
           )}
         </div>

        {/* Scrollable Content Area */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-white">
          {/* Error Display */}
          {error && <div className="mb-4"><ErrorMessage message={error} /></div>}
          {/* Loading/Saving Indicator */}
          {(isLoadingGameItems || isSaving) && (
            <div className="flex justify-center items-center py-10">
              <LoadingSpinner />
              <span className="ml-2 text-gray-600">{isSaving ? 'Saving...' : 'Loading items...'}</span>
            </div>
          )}

          {/* Money Tab Content */}
          {activeTab === 'money' && !isSaving && (
             <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                 {/* Gold */}
                 <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                   <h3 className="font-medium mb-3 text-yellow-800 text-center">Gold</h3>
                   <div className="flex items-center justify-center gap-3">
                     <Button size="sm" variant="secondary" onClick={() => handleMoneyChange('gold', -1)} disabled={isSaving || (character.equipment?.money?.gold || 0) <= 0}>-1</Button>
                     <span className="text-lg md:text-xl font-bold text-yellow-900 min-w-[3ch] text-center">{character.equipment?.money?.gold || 0}</span>
                     <Button size="sm" variant="secondary" onClick={() => handleMoneyChange('gold', 1)} disabled={isSaving}>+1</Button>
                   </div>
                 </div>
                 {/* Silver */}
                 <div className="p-4 bg-gray-100 rounded-lg border border-gray-200">
                   <h3 className="font-medium mb-3 text-gray-800 text-center">Silver</h3>
                   <div className="flex items-center justify-center gap-3">
                     <Button size="sm" variant="secondary"onClick={() => handleMoneyChange('silver', -1)} disabled={isSaving || (character.equipment?.money?.silver || 0) <= 0}>-1</Button>
                     <span className="text-lg md:text-xl font-bold text-gray-900 min-w-[3ch] text-center">{character.equipment?.money?.silver || 0}</span>
                     <Button size="sm" variant="secondary" onClick={() => handleMoneyChange('silver', 1)} disabled={isSaving}>+1</Button>
                   </div>
                 </div>
                 {/* Copper */}
                 <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                   <h3 className="font-medium mb-3 text-orange-800 text-center">Copper</h3>
                   <div className="flex items-center justify-center gap-3">
                     <Button size="sm" variant="secondary" onClick={() => handleMoneyChange('copper', -1)} disabled={isSaving || (character.equipment?.money?.copper || 0) <= 0}>-1</Button>
                     <span className="text-lg md:text-xl font-bold text-orange-900 min-w-[3ch] text-center">{character.equipment?.money?.copper || 0}</span>
                     <Button size="sm" variant="secondary" onClick={() => handleMoneyChange('copper', 1)} disabled={isSaving}>+1</Button>
                   </div>
                 </div>
               </div>
               {(isAdmin() || isDM()) && (
                 <div className="mt-6 pt-6 border-t">
                   <h3 className="font-medium mb-3 text-sm text-gray-600">Quick Add (Admin/DM)</h3>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                     <Button variant="outline" size="sm" onClick={() => handleMoneyChange('gold', 10)} disabled={isSaving}>+10 Gold</Button>
                     <Button variant="outline" size="sm" onClick={() => handleMoneyChange('silver', 50)} disabled={isSaving}>+50 Silver</Button>
                     <Button variant="outline" size="sm" onClick={() => handleMoneyChange('copper', 100)} disabled={isSaving}>+100 Copper</Button>
                   </div>
                 </div>
               )}
             </div>
          )}

          {/* Shop Tab Content */}
          {activeTab === 'shop' && !isLoadingGameItems && !isSaving && (
            selectedShopGroup === null ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {shopGroups.map((group) => (
                  <div key={group.name} className="flex flex-col items-center justify-center p-3 md:p-4 border rounded-lg hover:shadow-lg cursor-pointer transition-shadow bg-white hover:bg-gray-50" onClick={() => setSelectedShopGroup(group)}>
                    <group.Icon className="w-8 h-8 md:w-10 md:h-10 text-blue-600 mb-2" />
                    <span className="font-medium text-center text-xs md:text-sm">{group.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredShopItems.map(item => (
                  <div key={item.id} className="group relative flex flex-col p-3 border rounded-lg hover:shadow-md transition-shadow bg-white">
                    <div className="flex-1 mb-2">
                      <h4 className="font-medium text-sm">{item.name}</h4>
                      <p className="text-xs text-gray-500">{item.category}</p>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.effect || item.description || 'No description.'}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-green-700">{item.cost || 'N/A'}</span>
                      <Button variant="primary" size="xs" onClick={() => handleBuyItem(item)} disabled={isSaving || !item.cost}>Buy</Button>
                    </div>
                    {(item.effect || item.description) && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-60 bg-gray-800 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal z-10 pointer-events-none">
                        {item.effect || item.description}
                      </div>
                    )}
                  </div>
                ))}
                 {filteredShopItems.length === 0 && (
                    <p className="text-gray-500 italic col-span-full text-center py-6">No items found matching filters in this category.</p>
                 )}
              </div>
            )
          )}

          {/* Inventory Tab Content */}
          {activeTab === 'inventory' && !isSaving && (
            <>
              {/* Equipped Items Section */}
              {renderEquippedItems()}

              {/* Inventory List Title */}
              <h3 className="font-medium text-sm text-gray-600 mt-6 mb-3 pt-4 border-t">Inventory Items</h3>

              {/* Inventory List */}
              <div className="space-y-3">
                {(character.equipment?.inventory || []).map((item, index) => {
                  if (!filteredInventory.includes(item)) return null;

                  if (!item || typeof item.name !== 'string') {
                      return null;
                  }

                  const itemData = findItemDetails(item.name);
                  const categoryUpper = typeof itemData?.category === 'string' ? itemData.category.toUpperCase() : '';
                  const canBeEquipped = itemData && (
                    categoryUpper === 'ARMOR & HELMETS' ||
                    categoryUpper === 'MELEE WEAPONS' ||
                    categoryUpper === 'RANGED WEAPONS'
                  );
                  const canBeUsed = item.quantity > 0 && (
                      itemData?.category?.toUpperCase() === 'MEDICINE' ||
                      itemData?.category?.toUpperCase() === 'STUDIES & MAGIC' || 
                      itemData?.category?.toUpperCase() === 'LIGHT SOURCES' ||
                      item.name.toLowerCase().includes('ration') 
                  );

                  return (
                    <div
                      key={item.id || `${item.name}-${index}`}
                      className="group relative p-3 border rounded-lg hover:shadow-sm transition-shadow flex items-center justify-between gap-2 bg-white"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate" title={formatInventoryItemName(item)}>
                          {formatInventoryItemName(item)}
                        </h3>
                        {itemData && (
                          <p className="text-xs text-gray-600 line-clamp-1">
                            {itemData.effect || itemData.description || 'No description.'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                         {itemData?.category && (
                            <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                              {itemData.category}
                            </span>
                         )}
                         {canBeUsed && (
                            <Button
                                variant="outline"
                                size="xs"
                                icon={MinusCircle}
                                onClick={() => handleUseItem(index)}
                                disabled={isSaving}
                                title={`Use one ${item.name}`}
                            >
                                Use
                            </Button>
                         )}
                         {canBeEquipped && (
                           <Button
                             variant="secondary"
                             size="xs"
                             icon={CheckSquare}
                             onClick={() => handleEquipItem(item, index)}
                             disabled={isSaving}
                             title={`Equip ${item.name}`}
                           >
                             Equip
                           </Button>
                         )}
                         <Button
                            variant="dangerOutline"
                            size="xs"
                            icon={Trash2}
                            onClick={() => handleDropItem(index)}
                            disabled={isSaving}
                            title={`Drop ${formatInventoryItemName(item)}`}
                         >
                            Drop
                         </Button>
                         {(itemData?.effect || itemData?.description) && (
                            <span className="relative inline-block ml-1">
                                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-60 bg-gray-800 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal z-10 pointer-events-none">
                                    <h5 className="font-semibold mb-1 border-b border-gray-600 pb-1">{itemData.name}</h5>
                                    {itemData.effect || itemData.description}
                                    {itemData.weight && <p className="mt-1 text-gray-300">Weight: {itemData.weight}</p>}
                                    {itemData.cost && <p className="text-gray-300">Cost: {itemData.cost}</p>}
                                </div>
                            </span>
                         )}
                      </div>
                    </div>
                  );
                })}

                {filteredInventory.length === 0 && (character.equipment?.inventory || []).length > 0 && (
                    <div className="text-center py-8 text-gray-500 italic">
                        No items match current filters.
                    </div>
                )}
                {(character.equipment?.inventory || []).length === 0 && !renderEquippedItems() && (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Inventory is empty.</p>
                    <Button variant="link" size="sm" onClick={() => setActiveTab('shop')} className="mt-2">Go to Shop</Button>
                  </div>
                )}
              </div>

              {showCustomItemForm && (
                <div className="mt-6 p-4 border rounded-lg bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-gray-700">Create Custom Item</h3>
                    <button onClick={() => setShowCustomItemForm(false)} className="p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200">
                        <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2"><label className="block text-xs mb-1 font-medium text-gray-600">Name</label><input type="text" value={customItem.name} onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })} className="w-full px-3 py-1.5 border rounded-md text-sm"/></div>
                    <div><label className="block text-xs mb-1 font-medium text-gray-600">Category</label><select value={customItem.category} onChange={(e) => setCustomItem({ ...customItem, category: e.target.value })} className="w-full px-3 py-1.5 border rounded-md text-sm bg-white">{itemCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                    <div><label className="block text-xs mb-1 font-medium text-gray-600">Cost (per item)</label><input type="text" value={customItem.cost} onChange={(e) => setCustomItem({ ...customItem, cost: e.target.value })} className="w-full px-3 py-1.5 border rounded-md text-sm" placeholder="e.g., 1 gold 5 silver"/></div>
                    <div><label className="block text-xs mb-1 font-medium text-gray-600">Weight (per item)</label><input type="number" value={customItem.weight} onChange={(e) => setCustomItem({ ...customItem, weight: Number(e.target.value) })} className="w-full px-3 py-1.5 border rounded-md text-sm" min="0" step="0.1"/></div>
                    <div><label className="block text-xs mb-1 font-medium text-gray-600">Quantity</label><input type="number" value={customItem.quantity} onChange={(e) => setCustomItem({ ...customItem, quantity: Math.max(1, Number(e.target.value)) })} className="w-full px-3 py-1.5 border rounded-md text-sm" min="1"/></div>
                    <div className="md:col-span-1"><label className="block text-xs mb-1 font-medium text-gray-600">Unit (Optional)</label><input type="text" value={customItem.unit} onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value })} className="w-full px-3 py-1.5 border rounded-md text-sm" placeholder="e.g., meters, doses"/></div>
                    <div className="md:col-span-2"><label className="block text-xs mb-1 font-medium text-gray-600">Effect/Description</label><textarea value={customItem.effect} onChange={(e) => setCustomItem({ ...customItem, effect: e.target.value })} className="w-full px-3 py-1.5 border rounded-md text-sm" rows={2}/></div>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    <Button variant="secondary" size="sm" onClick={() => setShowCustomItemForm(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" icon={Plus} onClick={handleCreateCustomItem} disabled={isSaving || !customItem.name || !customItem.cost}>Add Item</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div> 

      </div> 
    </div> 
  );
}
