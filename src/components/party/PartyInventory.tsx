import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Package, Search, Filter, ArrowRight, ArrowLeft, Plus, Trash2, X, Users, History, Pencil, Save, AlertCircle, Shield, Sword
} from 'lucide-react';
import { Button } from '../shared/Button';
import { Character, InventoryItem as CharacterInventoryItem } from '../../types/character';
import { GameItem } from '../../lib/api/items';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

// --- TYPE DEFINITIONS ---

interface PartyInventoryProps {
  partyId: string;
  members: Character[];
  isDM: boolean;
}

interface PartyInventoryTableItem {
  id: string;
  name: string;
  quantity: number;
  description?: string;
  category?: string;
  party_id: string;
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
  party_id: string;
}

// --- UTILITY: Normalize Name ---
const normalizeName = (name: string) => name.trim().toLowerCase();

// --- MODAL COMPONENT: LOOT ASSIGNMENT ---

interface LootAssignmentModalProps {
  onClose: () => void;
  allItems: GameItem[];
  onAssignLoot: (loot: { item: GameItem; quantity: number }[]) => Promise<void>;
}

const LootAssignmentModal = ({ onClose, allItems, onAssignLoot }: LootAssignmentModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [stagedLoot, setStagedLoot] = useState<Map<string, { item: GameItem; quantity: number }>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);

  // Custom Item State
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customForm, setCustomForm] = useState<{
    baseId: string;
    name: string;
    category: string;
    cost: string;
    weight: string;
    effect: string;
    quantity: number;
    // Extra Stats
    armor_rating: string;
    grip: string;
    damage: string;
    range: string;
    durability: string;
    features: string;
  } | null>(null);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const lowercasedSearch = searchTerm.toLowerCase();
    return allItems
      .filter(item => item.name.toLowerCase().includes(lowercasedSearch))
      .slice(0, 50);
  }, [searchTerm, allItems]);

  const handleStageItem = (item: GameItem, quantity: number) => {
    if (quantity <= 0) return;
    const newStagedLoot = new Map(stagedLoot);
    const existing = newStagedLoot.get(item.id);
    
    newStagedLoot.set(item.id, { item, quantity: (existing?.quantity || 0) + quantity });
    
    setStagedLoot(newStagedLoot);
    setSearchTerm('');
  };

  const handleStartCustomizing = (baseItem?: GameItem) => {
    setCustomForm({
      baseId: baseItem?.id || 'new',
      name: baseItem?.name || '',
      category: baseItem?.category || 'LOOT',
      cost: baseItem?.cost || '0 gold',
      weight: baseItem?.weight?.toString() || '0',
      effect: baseItem?.effect || baseItem?.comment || '',
      quantity: 1,
      // Initialize extra stats if they exist on base item
      armor_rating: baseItem?.armor_rating?.toString() || '',
      grip: baseItem?.grip || '',
      damage: baseItem?.damage || '',
      range: baseItem?.range?.toString() || '',
      durability: baseItem?.durability?.toString() || '',
      features: baseItem?.features || ''
    });
    setIsCustomizing(true);
  };

  const handleSaveCustomItem = () => {
    if (!customForm || !customForm.name) return;

    // Create a new pseudo-GameItem
    const newItem: GameItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: customForm.name,
      category: customForm.category,
      cost: customForm.cost,
      weight: customForm.weight,
      effect: customForm.effect,
      // Extra stats stored on the object (to be serialized later)
      armor_rating: customForm.armor_rating ? parseInt(customForm.armor_rating) : null,
      grip: customForm.grip || null,
      damage: customForm.damage || null,
      range: customForm.range || null,
      durability: customForm.durability ? parseInt(customForm.durability) : null,
      features: customForm.features || null,
      
      // Defaults
      idx: -1,
      supply: 'Unique',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      strength_requirement: null, item_type: null, armor: null, garment: null, tool: null, vehicle: null, item: null, service: null, comment: null, skill: null, equippable: null, encumbrance_modifier: null, encumbrance: null, equip: null
    };

    handleStageItem(newItem, customForm.quantity);
    setIsCustomizing(false);
    setCustomForm(null);
  };

  const handleRemoveStagedItem = (itemId: string) => {
    const newStagedLoot = new Map(stagedLoot);
    newStagedLoot.delete(itemId);
    setStagedLoot(newStagedLoot);
  };

  const handleConfirmLoot = async () => {
    if (stagedLoot.size === 0) return;
    setIsProcessing(true);
    await onAssignLoot(Array.from(stagedLoot.values()));
    setIsProcessing(false);
    onClose();
  };

  // Helper to determine if we should show weapon/armor fields
  const isWeapon = (cat: string) => cat.toUpperCase().includes('WEAPON') || cat.toUpperCase().includes('SHIELD');
  const isArmor = (cat: string) => cat.toUpperCase().includes('ARMOR') || cat.toUpperCase().includes('HELMET');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Assign Loot</h3>
            <p className="text-xs text-gray-500">Add items from database or create custom loot.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          
          {/* LEFT PANEL: Search OR Custom Form */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200 bg-white relative">
            
            {isCustomizing && customForm ? (
              // --- CUSTOMIZE MODE ---
              <div className="absolute inset-0 z-10 bg-white flex flex-col animate-in slide-in-from-left-4 duration-200">
                <div className="p-3 border-b flex items-center gap-2 bg-indigo-50 text-indigo-900">
                   <button onClick={() => setIsCustomizing(false)}><ArrowLeft size={18}/></button>
                   <span className="font-bold text-sm">Customize Item</span>
                </div>
                <div className="p-4 flex-grow overflow-y-auto space-y-4">
                   <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Item Name</label>
                     <input type="text" className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none font-medium" value={customForm.name} onChange={e => setCustomForm({...customForm, name: e.target.value})} autoFocus/>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                        <input 
                           type="text" 
                           className="w-full p-2 border rounded text-sm uppercase" 
                           value={customForm.category} 
                           onChange={e => setCustomForm({...customForm, category: e.target.value})} 
                           placeholder="WEAPON, ARMOR, LOOT..."
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cost</label>
                        <input type="text" className="w-full p-2 border rounded text-sm" value={customForm.cost} onChange={e => setCustomForm({...customForm, cost: e.target.value})} placeholder="e.g. 10 gold"/>
                     </div>
                   </div>

                   {/* Conditional Stats Fields */}
                   {isWeapon(customForm.category) && (
                      <div className="bg-red-50 p-3 rounded border border-red-100 space-y-3">
                         <div className="flex items-center gap-2 text-red-800 text-xs font-bold uppercase"><Sword size={12}/> Weapon Stats</div>
                         <div className="grid grid-cols-2 gap-3">
                            <div>
                               <label className="block text-xs font-semibold text-red-700 mb-1">Damage</label>
                               <input type="text" className="w-full p-1.5 border border-red-200 rounded text-sm" value={customForm.damage} onChange={e => setCustomForm({...customForm, damage: e.target.value})} placeholder="e.g. 1D8"/>
                            </div>
                            <div>
                               <label className="block text-xs font-semibold text-red-700 mb-1">Grip</label>
                               <input type="text" className="w-full p-1.5 border border-red-200 rounded text-sm" value={customForm.grip} onChange={e => setCustomForm({...customForm, grip: e.target.value})} placeholder="1H, 2H"/>
                            </div>
                            <div>
                               <label className="block text-xs font-semibold text-red-700 mb-1">Range</label>
                               <input type="text" className="w-full p-1.5 border border-red-200 rounded text-sm" value={customForm.range} onChange={e => setCustomForm({...customForm, range: e.target.value})}/>
                            </div>
                            <div>
                               <label className="block text-xs font-semibold text-red-700 mb-1">Durability</label>
                               <input type="number" className="w-full p-1.5 border border-red-200 rounded text-sm" value={customForm.durability} onChange={e => setCustomForm({...customForm, durability: e.target.value})}/>
                            </div>
                         </div>
                         <div>
                            <label className="block text-xs font-semibold text-red-700 mb-1">Features</label>
                            <input type="text" className="w-full p-1.5 border border-red-200 rounded text-sm" value={customForm.features} onChange={e => setCustomForm({...customForm, features: e.target.value})} placeholder="Piercing, Subtle..."/>
                         </div>
                      </div>
                   )}

                   {isArmor(customForm.category) && (
                      <div className="bg-blue-50 p-3 rounded border border-blue-100 space-y-3">
                         <div className="flex items-center gap-2 text-blue-800 text-xs font-bold uppercase"><Shield size={12}/> Armor Stats</div>
                         <div>
                            <label className="block text-xs font-semibold text-blue-700 mb-1">Armor Rating</label>
                            <input type="number" className="w-full p-1.5 border border-blue-200 rounded text-sm" value={customForm.armor_rating} onChange={e => setCustomForm({...customForm, armor_rating: e.target.value})} placeholder="e.g. 2"/>
                         </div>
                      </div>
                   )}

                   <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Weight</label>
                        <input type="number" step="0.1" className="w-full p-2 border rounded text-sm" value={customForm.weight} onChange={e => setCustomForm({...customForm, weight: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantity</label>
                        <input type="number" min="1" max="50" className="w-full p-2 border rounded text-sm" value={customForm.quantity} onChange={e => setCustomForm({...customForm, quantity: parseInt(e.target.value)})} />
                     </div>
                   </div>

                   <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Effect / Description</label>
                      <textarea className="w-full p-2 border rounded text-sm h-20 resize-none" value={customForm.effect} onChange={e => setCustomForm({...customForm, effect: e.target.value})} />
                   </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                   <Button variant="ghost" onClick={() => setIsCustomizing(false)}>Cancel</Button>
                   <Button variant="primary" icon={Save} onClick={handleSaveCustomItem}>Save to Loot</Button>
                </div>
              </div>
            ) : (
              // --- SEARCH MODE ---
              <>
                <div className="p-4 border-b space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search database..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <Button variant="secondary" size="sm" icon={Plus} className="w-full justify-center" onClick={() => handleStartCustomizing()}>
                    Create Custom Item
                  </Button>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1 bg-gray-50/50">
                  {filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                      <div key={item.id} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center gap-3 hover:border-blue-300 transition-colors group relative">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500 truncate">{item.category}</p>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                           {/* Customize Button */}
                           <button 
                             onClick={() => handleStartCustomizing(item)}
                             className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                             title="Copy & Customize"
                           >
                             <Pencil size={16} />
                           </button>

                           {/* Quick Add Form */}
                           <form
                             className="flex items-center gap-1"
                             onSubmit={(e) => {
                               e.preventDefault();
                               const qInput = e.currentTarget.elements.namedItem('qty') as HTMLInputElement;
                               handleStageItem(item, parseInt(qInput.value) || 1);
                               qInput.value = '1';
                             }}
                           >
                             <input type="number" name="qty" defaultValue={1} min="1" className="w-10 py-1 px-0.5 text-center border rounded text-xs" onClick={e=>e.currentTarget.select()}/>
                             <Button type="submit" size="xs" variant="secondary" icon={Plus}>Add</Button>
                           </form>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                       <Search size={32} className="mb-2 opacity-20"/>
                       <p className="text-sm">Search or create custom item.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* RIGHT PANEL: Staged Loot */}
          <div className="w-full md:w-1/2 flex flex-col bg-gray-50">
            <div className="p-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
               <h4 className="font-bold text-blue-900 text-sm uppercase tracking-wide">Pending Loot ({stagedLoot.size})</h4>
            </div>
            <div className="flex-grow overflow-y-auto p-3 space-y-2">
              {stagedLoot.size === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg m-4">
                  <Package size={32} className="mb-2 opacity-20"/>
                  <p className="text-sm">No items added yet.</p>
                </div>
              ) : (
                Array.from(stagedLoot.values()).map(({ item, quantity }) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm animate-in slide-in-from-left-2">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded flex items-center justify-center font-bold text-xs">{quantity}x</div>
                       <div className="min-w-0">
                         <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                         <div className="flex gap-2 text-xs text-gray-500">
                            <span className="uppercase">{item.category}</span>
                            {item.id.startsWith('custom-') && <span className="text-amber-600 flex items-center gap-0.5"><AlertCircle size={10}/> Custom</span>}
                         </div>
                       </div>
                    </div>
                    <button onClick={() => handleRemoveStagedItem(item.id)} className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"><Trash2 size={16}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirmLoot} disabled={stagedLoot.size === 0 || isProcessing} icon={Plus}>
            {isProcessing ? 'Adding...' : `Add Items to Party`}
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

export function PartyInventory({ partyId, members, isDM }: PartyInventoryProps) {
  const queryClient = useQueryClient();
  
  // State
  const [inventory, setInventory] = useState<PartyInventoryTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters & Selection
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  
  // History & Modals
  const [transactionLog, setTransactionLog] = useState<TransactionLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLootModalOpen, setIsLootModalOpen] = useState(false);

  // Cache items for quick lookup
  const { data: allItems = [] } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: Infinity,
  });

  // --- LOAD DATA ---
  useEffect(() => {
    loadData();
  }, [partyId]);

  async function loadData() {
    setLoading(true);
    try {
      const [invRes, logRes] = await Promise.all([
        supabase.from('party_inventory').select('*').eq('party_id', partyId),
        supabase.from('party_inventory_log').select('*').eq('party_id', partyId).order('timestamp', { ascending: false }).limit(50)
      ]);
      
      if (invRes.error) throw invRes.error;
      setInventory(invRes.data || []);
      setTransactionLog(logRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // --- HANDLERS ---

  const handleAssignLoot = async (loot: { item: GameItem; quantity: number }[]) => {
    try {
      setError(null);
      
      for (const { item, quantity } of loot) {
        // Build description with serialized stats
        let description = item.effect || item.description || item.comment || '';
        const statsParts = [];
        if (item.damage) statsParts.push(`Dmg: ${item.damage}`);
        if (item.armor_rating) statsParts.push(`AR: ${item.armor_rating}`);
        if (item.grip) statsParts.push(`Grip: ${item.grip}`);
        if (item.range) statsParts.push(`Range: ${item.range}`);
        if (item.durability) statsParts.push(`Dur: ${item.durability}`);
        if (item.features) statsParts.push(`Feat: ${item.features}`);
        
        if (statsParts.length > 0) {
           const statsString = `[${statsParts.join(', ')}]`;
           // Prevent double adding if editing an existing custom item description that already has stats
           if (!description.includes(statsString)) {
              description = description ? `${description} ${statsString}` : statsString;
           }
        }

        // DUPLICATION CHECK: Party Inventory
        const existing = inventory.find(i => normalizeName(i.name) === normalizeName(item.name));
        
        if (existing) {
          await supabase.from('party_inventory').update({ quantity: existing.quantity + quantity }).eq('id', existing.id);
        } else {
          await supabase.from('party_inventory').insert([{ 
            party_id: partyId, 
            name: item.name, 
            quantity, 
            category: item.category, 
            description 
          }]);
        }

        // Log
        await supabase.from('party_inventory_log').insert([{
           party_id: partyId, item_name: item.name, quantity, from_type: 'party', from_id: 'DM', to_type: 'party', to_id: partyId
        }]);
      }
      
      await loadData();
    } catch (err) {
      setError('Failed to assign loot.');
    }
  };

  const handleTransferToCharacter = async () => {
    if (!selectedCharacterId || selectedItemIds.length === 0) return;
    const character = members.find(m => m.id === selectedCharacterId);
    if (!character) return;

    try {
      for (const itemId of selectedItemIds) {
        const partyItem = inventory.find(i => i.id === itemId);
        if (!partyItem) continue;

        // 1. Decrement Party
        if (partyItem.quantity > 1) {
          await supabase.from('party_inventory').update({ quantity: partyItem.quantity - 1 }).eq('id', partyItem.id);
        } else {
          await supabase.from('party_inventory').delete().eq('id', partyItem.id);
        }

        // 2. Increment Character
        const currentInv = character.equipment?.inventory || [];
        const existingIdx = currentInv.findIndex(i => normalizeName(i.name) === normalizeName(partyItem.name));
        
        const newInv = [...currentInv];
        
        if (existingIdx >= 0) {
          newInv[existingIdx] = { 
            ...newInv[existingIdx], 
            quantity: (newInv[existingIdx].quantity || 1) + 1 
          };
        } else {
          // Look up base details if possible, otherwise rely on party data
          const details = allItems.find(d => normalizeName(d.name) === normalizeName(partyItem.name));
          
          newInv.push({
             name: partyItem.name, 
             quantity: 1, 
             category: partyItem.category || details?.category || 'LOOT', 
             description: partyItem.description || details?.effect
          });
        }

        await supabase.from('characters').update({ equipment: { ...character.equipment, inventory: newInv } }).eq('id', character.id);
        
        // 3. Log
        await supabase.from('party_inventory_log').insert([{
           party_id: partyId, item_name: partyItem.name, quantity: 1, from_type: 'party', from_id: partyId, to_type: 'character', to_id: character.id
        }]);
      }

      await loadData();
      queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      setSelectedItemIds([]);

    } catch (err) {
      setError('Transfer failed.');
    }
  };

  const handleTransferToParty = async (charItem: CharacterInventoryItem) => {
    const character = members.find(m => m.id === selectedCharacterId);
    if (!character || !charItem.name) return;

    try {
      // 1. Decrement Character
      const currentInv = [...(character.equipment?.inventory || [])];
      const idx = currentInv.findIndex(i => i.name === charItem.name);
      if (idx === -1) return;

      if ((currentInv[idx].quantity || 1) > 1) {
        currentInv[idx].quantity = (currentInv[idx].quantity || 1) - 1;
      } else {
        currentInv.splice(idx, 1);
      }
      
      await supabase.from('characters').update({ equipment: { ...character.equipment, inventory: currentInv } }).eq('id', character.id);

      // 2. Increment Party
      const existingPartyItem = inventory.find(i => normalizeName(i.name) === normalizeName(charItem.name));
      
      if (existingPartyItem) {
        await supabase.from('party_inventory').update({ quantity: existingPartyItem.quantity + 1 }).eq('id', existingPartyItem.id);
      } else {
        const details = allItems.find(d => normalizeName(d.name) === normalizeName(charItem.name));
        
        await supabase.from('party_inventory').insert([{
           party_id: partyId, 
           name: charItem.name, 
           quantity: 1, 
           category: charItem.category || details?.category || 'LOOT', 
           description: charItem.description || details?.effect || details?.description
        }]);
      }

      // 3. Log
      await supabase.from('party_inventory_log').insert([{
         party_id: partyId, item_name: charItem.name, quantity: 1, from_type: 'character', from_id: character.id, to_type: 'party', to_id: partyId
      }]);

      await loadData();
      queryClient.invalidateQueries({ queryKey: ['character', character.id] });

    } catch (err) {
      setError('Transfer failed.');
    }
  };

  // --- DERIVED STATE ---
  const categories = ['all', ...new Set(inventory.map(i => i.category).filter(Boolean) as string[])];
  const filteredInventory = inventory.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (categoryFilter === 'all' || i.category === categoryFilter)
  );
  const selectedCharacter = members.find(m => m.id === selectedCharacterId);

  return (
    <>
      {/* LOOT MODAL */}
      {isLootModalOpen && <LootAssignmentModal onClose={() => setIsLootModalOpen(false)} allItems={allItems} onAssignLoot={handleAssignLoot} />}
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
        
        {/* LEFT: PARTY STASH (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Header */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-white z-10">
            <div className="flex items-center gap-2">
               <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Users size={20}/></div>
               <div>
                 <h2 className="text-lg font-bold text-gray-900">Party Stash</h2>
                 <p className="text-xs text-gray-500">{inventory.reduce((acc, i) => acc + i.quantity, 0)} Items total</p>
               </div>
            </div>
            <div className="flex gap-2">
              {isDM && <Button size="sm" variant="primary" icon={Plus} onClick={() => setIsLootModalOpen(true)}>Add Loot</Button>}
              <Button size="sm" variant="ghost" icon={History} onClick={() => setShowHistory(!showHistory)} className={showHistory ? "bg-gray-100" : ""}/>
            </div>
          </div>

          {/* Filters */}
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Filter items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
            <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white outline-none focus:ring-1 focus:ring-indigo-500" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
               {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
          </div>
          
          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/30">
             {loading ? <LoadingSpinner /> : filteredInventory.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Package size={48} className="opacity-20 mb-2"/>
                  <p>Stash is empty or no match.</p>
               </div>
             ) : (
               filteredInventory.map(item => (
                 <div 
                    key={item.id} 
                    onClick={() => setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                    className={`
                      p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-all group
                      ${selectedItemIds.includes(item.id) 
                         ? 'bg-indigo-50 border-indigo-500 shadow-sm ring-1 ring-indigo-500' 
                         : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                      }
                    `}
                 >
                    <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${selectedItemIds.includes(item.id) ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'}`}>{item.quantity}</div>
                       <div>
                         <p className={`font-medium text-sm ${selectedItemIds.includes(item.id) ? 'text-indigo-900' : 'text-gray-900'}`}>{item.name}</p>
                         {item.category && <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{item.category}</p>}
                       </div>
                    </div>
                    {item.description && <div className="hidden group-hover:block max-w-xs text-xs text-gray-500 truncate ml-4">{item.description}</div>}
                 </div>
               ))
             )}
          </div>
        </div>

        {/* RIGHT: TRANSFER PANEL (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4 h-full">
          
          {/* Character Selection Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-shrink-0">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Transfer Partner</label>
            <select 
               className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
               value={selectedCharacterId}
               onChange={e => setSelectedCharacterId(e.target.value)}
            >
              <option value="">Select Character...</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Transfer Area */}
          {selectedCharacter ? (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
               
               {/* Give to Character */}
               <div className={`flex-1 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden ${selectedItemIds.length > 0 ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-200'}`}>
                  <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                     <h4 className="font-bold text-gray-700 text-sm">Give to {selectedCharacter.name}</h4>
                     {selectedItemIds.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">{selectedItemIds.length} Selected</span>}
                  </div>
                  <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                     {selectedItemIds.length === 0 ? (
                       <p className="text-gray-400 text-sm">Select items from the left to transfer.</p>
                     ) : (
                       <div className="w-full space-y-3">
                          <p className="text-sm text-gray-600">Transferring <strong>{selectedItemIds.length}</strong> item(s)</p>
                          <Button className="w-full" variant="primary" icon={ArrowRight} onClick={handleTransferToCharacter}>Confirm Transfer</Button>
                       </div>
                     )}
                  </div>
               </div>

               {/* Take from Character */}
               <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-3 border-b bg-gray-50">
                     <h4 className="font-bold text-gray-700 text-sm">{selectedCharacter.name}'s Inventory</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50/30">
                     {selectedCharacter.equipment?.inventory?.length === 0 ? (
                       <div className="h-full flex items-center justify-center text-gray-400 text-sm">Empty Inventory</div>
                     ) : (
                       selectedCharacter.equipment?.inventory?.map((item, idx) => (
                         <div key={idx} className="flex justify-between items-center p-2 bg-white border rounded hover:bg-gray-50 group">
                            <span className="text-sm text-gray-800"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">{item.quantity}</span>{item.name}</span>
                            <Button size="xs" variant="secondary" icon={ArrowLeft} onClick={() => handleTransferToParty(item)}>Take</Button>
                         </div>
                       ))
                     )}
                  </div>
               </div>

            </div>
          ) : (
            <div className="flex-1 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 p-6 text-center">
              <Users size={48} className="mb-3 opacity-20" />
              <p className="font-medium">Select a character above to start transferring items.</p>
            </div>
          )}

          {/* Transaction Log (Overlay or Expansion) */}
          {showHistory && (
            <div className="absolute right-0 top-16 bottom-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-20 animate-in slide-in-from-right duration-300 flex flex-col">
               <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <h3 className="font-bold text-gray-800">History</h3>
                 <button onClick={() => setShowHistory(false)}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-3">
                 {transactionLog.map(log => (
                   <div key={log.id} className="text-xs p-2 bg-gray-50 rounded border border-gray-100">
                      <p className="font-bold text-gray-700">{log.item_name} <span className="font-normal text-gray-500">x{log.quantity}</span></p>
                      <div className="flex items-center gap-1 text-gray-500 mt-1">
                         <span>{log.from_type === 'party' ? 'Party' : 'Char'}</span>
                         <ArrowRight size={10}/>
                         <span>{log.to_type === 'party' ? 'Party' : 'Char'}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(log.timestamp).toLocaleTimeString()}</p>
                   </div>
                 ))}
               </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
