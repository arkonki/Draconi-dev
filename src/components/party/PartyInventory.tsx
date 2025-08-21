import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Search, Filter, ArrowRight, ArrowLeft, Plus, Trash2 } from 'lucide-react'; // Removed unused icons for now
import { Button } from '../shared/Button';
import { Character, InventoryItem as CharacterInventoryItem } from '../../types/character'; // Renamed imported InventoryItem
// Removed the incorrect import: import { findEquipment } from '../../data/equipment';
import { GameItem, findItemByName } from '../../lib/api/items'; // Use findItemByName from api if needed, or rely on fetched allItems
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Import useQuery and useQueryClient
import { fetchItems } from '../../lib/api/items'; // Import fetchItems
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

interface PartyInventoryProps {
  partyId: string;
  members: Character[];
  isDM: boolean;
}

// This represents items specifically in the party_inventory table
interface PartyInventoryTableItem {
  id: string;
  name: string; // This can potentially be null from the DB
  quantity: number;
  description?: string;
  category?: string;
  party_id: string; // Ensure party_id is part of the type if needed
}


interface TransactionLog {
  id: string;
  item_name: string;
  quantity: number;
  from_type: 'party' | 'character';
  from_id: string;
  to_type: 'party' | 'character';
  to_id: string;
  timestamp: string;
  party_id: string; // Added party_id based on loadTransactionLog query
}

export function PartyInventory({ partyId, members, isDM }: PartyInventoryProps) {
  const queryClient = useQueryClient(); // Get query client instance
  const [inventory, setInventory] = useState<PartyInventoryTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]); // Store party inventory item IDs for selection
  const [transactionLog, setTransactionLog] = useState<TransactionLog[]>([]);
  const [showTransactionLog, setShowTransactionLog] = useState(false);

  // Fetch all game items for details lookup
  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Helper to find item details from the fetched list
  const findItemDetails = (itemName: string): GameItem | undefined => {
    // Ensure itemName is not null/undefined before searching
    if (!itemName) return undefined;
    return allItems.find(item => item.name === itemName);
  };


  useEffect(() => {
    loadInventory();
    loadTransactionLog();
  }, [partyId]);

  async function loadInventory() {
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      const { data, error: fetchError } = await supabase
        .from('party_inventory')
        .select('*')
        .eq('party_id', partyId);

      if (fetchError) throw fetchError;
      // Ensure data is an array, default to empty array if null/undefined
      setInventory(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
      setInventory([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactionLog() {
    try {
      const { data, error: fetchError } = await supabase
        .from('party_inventory_log')
        .select('*')
        .eq('party_id', partyId)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setTransactionLog(data || []);
    } catch (err) {
      console.error('Failed to load transaction log:', err);
      setTransactionLog([]); // Set to empty array on error
      // Optionally set an error state for the log specifically
    }
  }

  const handleTransferToCharacter = async () => {
    if (!selectedCharacter || selectedItems.length === 0) return;

    try {
      setError(null); // Clear previous errors
      const character = members.find(m => m.id === selectedCharacter);
      if (!character) throw new Error('Character not found');

      // Use Promise.all for better error handling if one transfer fails
      await Promise.all(selectedItems.map(async (partyItemId) => {
        const partyItem = inventory.find(i => i.id === partyItemId);
        // Ensure partyItem and partyItem.name exist before proceeding
        if (!partyItem || !partyItem.name || partyItem.quantity < 1) return;

        // 1. Decrease party inventory quantity or delete if quantity becomes 0
        let partyUpdateError;
        if (partyItem.quantity > 1) {
          ({ error: partyUpdateError } = await supabase
            .from('party_inventory')
            .update({ quantity: partyItem.quantity - 1 })
            .eq('id', partyItem.id));
        } else {
          ({ error: partyUpdateError } = await supabase
            .from('party_inventory')
            .delete()
            .eq('id', partyItem.id));
        }
        if (partyUpdateError) throw partyUpdateError;

        // 2. Update character inventory (add the item object)
        const currentEquipment = character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } };
        const currentInventory = currentEquipment.inventory || [];

        // Find details of the item being transferred
        const itemDetails = findItemDetails(partyItem.name);
        if (!itemDetails) {
            console.warn(`Details not found for item: ${partyItem.name}. Transferring with basic info.`);
            // Add with minimal info derived from party item
             const newItemForCharacter: CharacterInventoryItem = {
                name: partyItem.name,
                quantity: 1, // Transferring one unit
                originalName: partyItem.name, // Use name as fallback
                description: partyItem.description,
                category: partyItem.category,
             };
             // Check if item already exists in character inventory to increment quantity
             const existingCharItemIndex = currentInventory.findIndex(ci => ci.name === newItemForCharacter.name);
             if (existingCharItemIndex > -1) {
                 currentInventory[existingCharItemIndex].quantity += 1;
             } else {
                 currentInventory.push(newItemForCharacter);
             }
        } else {
            // Check if item already exists in character inventory to increment quantity
            const existingCharItemIndex = currentInventory.findIndex(ci => ci.name === itemDetails.name);
            if (existingCharItemIndex > -1) {
                currentInventory[existingCharItemIndex].quantity += 1;
            } else {
                // Create a new InventoryItem object for the character
                const newItemForCharacter: CharacterInventoryItem = {
                    ...itemDetails, // Spread details from game_items
                    id: undefined, // Character inventory items might not need a DB ID from party_inventory
                    quantity: 1, // Transferring one unit
                    originalName: itemDetails.name, // Or construct if needed
                };
                currentInventory.push(newItemForCharacter);
            }
        }


        const { error: characterError } = await supabase
          .from('characters')
          .update({
            equipment: {
              ...currentEquipment, // Spread existing equipment properties
              inventory: currentInventory // Use the updated inventory array
            }
          })
          .eq('id', character.id);
        if (characterError) throw characterError;


        // 3. Log transaction
        const { error: logError } = await supabase
          .from('party_inventory_log')
          .insert([{
            party_id: partyId,
            item_name: partyItem.name, // Use the confirmed non-null name
            quantity: 1, // Transferring one item at a time
            from_type: 'party',
            from_id: partyId,
            to_type: 'character',
            to_id: character.id
          }]);
        if (logError) throw logError;
      }));


      // Refresh data after all transfers are attempted
      await Promise.all([
        loadInventory(),
        loadTransactionLog(),
        // Invalidate character query cache to reflect changes in other UI parts
        queryClient.invalidateQueries({ queryKey: ['character', character.id] }),
        queryClient.invalidateQueries({ queryKey: ['party', partyId] }) // Also refresh party data which includes members
      ]);

      setSelectedItems([]); // Clear selection
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer items');
      // Consider rolling back changes if needed, though complex
      await loadInventory(); // Refresh inventory state on error
    }
  };

  // Handles transferring an item FROM a character TO the party
  const handleTransferToParty = async (characterId: string, itemToTransfer: CharacterInventoryItem) => {
     try {
        setError(null);
        const character = members.find(m => m.id === characterId);
        if (!character) throw new Error('Character not found');
        // Ensure item name exists
        if (!itemToTransfer.name) {
            console.warn('Attempted to transfer an item without a name.');
            return;
        }

        // 1. Remove/Decrement item from character's inventory
        const currentEquipment = character.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } };
        let currentInventory = currentEquipment.inventory || [];

        const itemIndex = currentInventory.findIndex(invItem => invItem.name === itemToTransfer.name); // Match by name

        if (itemIndex === -1) {
            console.warn(`Item "${itemToTransfer.name}" not found in character ${characterId}'s inventory.`);
            return; // Item not found, cannot transfer
        }

        // Decrement quantity or remove item
        if (currentInventory[itemIndex].quantity > 1) {
            currentInventory[itemIndex].quantity -= 1;
        } else {
            // Remove the item entirely
            currentInventory = [
                ...currentInventory.slice(0, itemIndex),
                ...currentInventory.slice(itemIndex + 1)
            ];
        }

        // Update character in DB
        const { error: characterError } = await supabase
          .from('characters')
          .update({
            equipment: {
              ...currentEquipment,
              inventory: currentInventory
            }
          })
          .eq('id', character.id);
        if (characterError) throw characterError;


        // 2. Add/Update party inventory
        const existingPartyItem = inventory.find(i => i.name === itemToTransfer.name);
        if (existingPartyItem) {
          const { error: updateError } = await supabase
            .from('party_inventory')
            .update({ quantity: existingPartyItem.quantity + 1 })
            .eq('id', existingPartyItem.id);
          if (updateError) throw updateError;
        } else {
          // Use details from the item being transferred if possible
          const { error: insertError } = await supabase
            .from('party_inventory')
            .insert([{
              party_id: partyId,
              name: itemToTransfer.name, // Use the confirmed non-null name
              quantity: 1,
              category: itemToTransfer.category || 'misc', // Use item's category or default
              description: itemToTransfer.description || itemToTransfer.effect // Use description or effect
            }])
            .select();
          if (insertError) throw insertError;
        }

        // 3. Log transaction
        const { error: logError } = await supabase
          .from('party_inventory_log')
          .insert([{
            party_id: partyId,
            item_name: itemToTransfer.name, // Use the confirmed non-null name
            quantity: 1,
            from_type: 'character',
            from_id: character.id,
            to_type: 'party',
            to_id: partyId
          }]);
        if (logError) throw logError;

        // Refresh party inventory, log, and character data
        await Promise.all([
            loadInventory(),
            loadTransactionLog(),
            queryClient.invalidateQueries({ queryKey: ['character', character.id] }),
            queryClient.invalidateQueries({ queryKey: ['party', partyId] }) // Refresh party data
        ]);

     } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to transfer item to party');
     }
  };


  // Filter out null/undefined categories and names before creating Set
  const validCategories = inventory
    .map(item => item.category)
    .filter((category): category is string => typeof category === 'string' && category.trim() !== '');
  const categories = ['all', ...new Set(validCategories)];

  // FIX: Add null check for item.name before calling toLowerCase()
  const filteredInventory = inventory.filter(item => {
    // Treat null/undefined names as empty strings for search purposes
    const itemName = item.name || '';
    const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase());
    // Ensure category filter works even if item.category is null/undefined
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Find the full character object for the selected ID
  const selectedCharacterData = members.find(m => m.id === selectedCharacter);
  // Safely access inventory (now array of objects), defaulting to an empty array
  const selectedCharacterInventory: CharacterInventoryItem[] = selectedCharacterData?.equipment?.inventory ?? [];


  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Party Inventory */}
      <div className="col-span-12 lg:col-span-7">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Party Inventory</h2>
            <Button
              variant="secondary"
              onClick={() => setShowTransactionLog(!showTransactionLog)}
            >
              {showTransactionLog ? 'Hide History' : 'Show History'}
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inventory List */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {loading ? <LoadingSpinner /> : error ? <ErrorMessage message={error} /> :
            filteredInventory.map((item) => (
              <div
                key={item.id} // Use the database ID from party_inventory
                className={`p-4 border rounded-lg cursor-pointer ${
                  selectedItems.includes(item.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => {
                  // Only allow selection if item has a valid ID
                  if (item.id) {
                    setSelectedItems(prev =>
                      prev.includes(item.id)
                        ? prev.filter(id => id !== item.id)
                        : [...prev, item.id]
                    );
                  } else {
                    console.warn("Attempted to select an item without an ID:", item);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    {/* Display name safely */}
                    <h3 className="font-medium">{item.name || 'Unnamed Item'}</h3>
                    <p className="text-sm text-gray-600">
                      Quantity: {item.quantity}
                    </p>
                  </div>
                  {item.category && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100">
                      {item.category}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                )}
              </div>
            ))}

            {!loading && filteredInventory.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">
                  {searchTerm || categoryFilter !== 'all'
                    ? 'No items found matching filters.'
                    : 'Party inventory is empty.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Character Inventories & Transfer Controls */}
      <div className="col-span-12 lg:col-span-5">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-6">Transfer Items</h2>

          {/* Character Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Character
            </label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Choose a character...</option>
              {members.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} ({character.kin} {character.profession})
                </option>
              ))}
            </select>
          </div>

          {/* Transfer Controls */}
          <div className="flex justify-center gap-4 mb-6">
            <Button
              variant="secondary"
              icon={ArrowLeft}
              disabled={!selectedCharacter || selectedItems.length === 0}
              onClick={handleTransferToCharacter}
              title="Transfer selected items from Party to Character"
            >
              To Character
            </Button>
            {/* Transfer to Party button is now handled per-item below */}
          </div>

          {/* Selected Character's Inventory */}
          {selectedCharacter && selectedCharacterData && ( // Ensure data exists
            <div>
              <h3 className="font-medium mb-4">
                {selectedCharacterData.name}'s Inventory
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded p-2">
                {/* Ensure item has a unique identifier for the key */}
                {selectedCharacterInventory.map((item, index) => (
                  <div
                    // Use a robust key, combining name and index if id isn't present
                    key={item.id || `${item.name || 'unknown'}-${index}`}
                    className="p-2 border-b flex items-center justify-between text-sm"
                  >
                    {/* Render item name and quantity safely */}
                    <span>{item.name || 'Unnamed Item'} (Qty: {item.quantity})</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={ArrowRight}
                      // Pass the whole item object to the handler now
                      onClick={() => handleTransferToParty(selectedCharacter, item)}
                      // Disable button if item has no name
                      disabled={!item.name}
                      title={item.name ? `Transfer ${item.name} to Party` : 'Cannot transfer unnamed item'}
                    >
                      Give
                    </Button>
                  </div>
                ))}
                 {selectedCharacterInventory.length === 0 && (
                    <p className="text-center text-gray-500 py-4 italic">Character inventory is empty.</p>
                 )}
              </div>
            </div>
          )}
        </div>

        {/* Transaction Log */}
        {showTransactionLog && (
          <div className="mt-6 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Transaction History</h2>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {transactionLog.map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-3 bg-gray-50 rounded-lg text-sm border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{transaction.item_name || 'Unknown Item'} (Qty: {transaction.quantity})</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(transaction.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-600 text-xs">
                    {transaction.from_type === 'party' ? 'Party' :
                      members.find(m => m.id === transaction.from_id)?.name || 'Unknown Char'}
                    {' → '}
                    {transaction.to_type === 'party' ? 'Party' :
                      members.find(m => m.id === transaction.to_id)?.name || 'Unknown Char'}
                  </p>
                </div>
              ))}

              {transactionLog.length === 0 && (
                <p className="text-center text-gray-600 py-4">
                  No transactions recorded yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
