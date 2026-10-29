import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Package, Search, ArrowRight, ArrowLeft, Plus, Trash2, X, Users, History, Pencil, Save, AlertCircle, Shield, Sword, Coins,
  Sparkles, Undo2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { enhanceLootItem, fetchAiSettings } from '../../lib/api/ai';
import { Button } from '../shared/Button';
import { Character, InventoryItem as CharacterInventoryItem } from '../../types/character';
import { GameItem, fetchItems, createGameItem } from '../../lib/api/items';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { BarteringCalculator } from './BarteringCalculator';
import { parseCost } from '../../lib/equipment';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { useConfirm } from '../../hooks/useConfirm';
import { addItemsToPartyStash } from '../../lib/api/partyStash';
import { listingContents } from '../../../shared/encumbrance.js';
import { makeMastercrafted } from '../../lib/mastercrafted';
import { isService } from '../../lib/shopCart';
import { isDraftAnimal, vehicleCargo } from '../../lib/partyVehicles';

// --- HELPERS ---
const coerceItemName = (name: unknown): string => {
  if (typeof name === 'string') return name;
  if (typeof name === 'number' || typeof name === 'boolean') return String(name);
  if (name && typeof name === 'object') {
    const candidate = name as { name?: unknown; label?: unknown; title?: unknown };
    if (typeof candidate.name === 'string') return candidate.name;
    if (typeof candidate.label === 'string') return candidate.label;
    if (typeof candidate.title === 'string') return candidate.title;
  }
  return 'Unknown Item';
};
const normalizeName = (name: unknown) => coerceItemName(name).trim().toLowerCase();
const getItemStackKey = (name: string, description?: string) => `${normalizeName(name)}::${description || ''}`;

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) { return crypto.randomUUID(); }
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// One-off loot only exists in this party's stash; it is never written to game_items.
const ONE_OFF_ID_PREFIX = 'one-off-';

/** Loot waiting to be added: `quantity` picks of `unitsEach` units, named as one unit. */
interface StagedLoot { item: GameItem; name: string; unitsEach: number; quantity: number }
const isOneOffItem = (item: GameItem) => item.id.startsWith(ONE_OFF_ID_PREFIX);

// The stash only keeps name, category and description, so fold a one-off item's stats into its description.
const buildOneOffDescription = (item: Partial<GameItem>) => {
  const stats = [
    item.damage && `Damage ${item.damage}`,
    item.grip && `Grip ${item.grip}`,
    item.range && `Range ${item.range}`,
    item.durability && `Durability ${item.durability}`,
    item.armor_rating && `Armor ${item.armor_rating}`,
    item.features && (Array.isArray(item.features) ? item.features.join(', ') : item.features),
    item.weight ? `Weight ${item.weight}` : '',
    item.cost && item.cost !== '0' && `Value ${item.cost}`,
  ].filter(Boolean).join(' · ');
  return [item.effect?.trim(), stats].filter(Boolean).join('\n');
};

const isCurrencyItem = (name: string) => {
  const n = normalizeName(name);
  return n === 'gold' || n === 'silver' || n === 'copper' || n === 'coins';
};

const getCurrencyKey = (name: string): 'gold' | 'silver' | 'copper' => {
  const n = normalizeName(name);
  if (n === 'silver') return 'silver';
  if (n === 'copper') return 'copper';
  return 'gold'; // Default 'coins' and 'gold' to gold
};

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
  /** The stash vehicle this is loaded onto, if any. */
  stored_in?: string | null;
}

interface TransactionLog {
  id: string;
  item_name: string;
  quantity: number;
  from_type: 'party' | 'character';
  from_id: string;
  to_type: 'party' | 'character' | 'void';
  to_id: string;
  timestamp: string;
  party_id: string;
}

// --- MODAL: LOOT ASSIGNMENT ---

interface LootAssignmentModalProps {
  partyId: string;
  onClose: () => void;
  allItems: GameItem[];
  onAssignLoot: (loot: StagedLoot[]) => Promise<void>;
}

const LootAssignmentModal = ({ partyId, onClose, allItems, onAssignLoot }: LootAssignmentModalProps) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [stagedLoot, setStagedLoot] = useState<Map<string, StagedLoot>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [customForm, setCustomForm] = useState<Partial<GameItem>>({
    name: '', category: 'LOOT', cost: '0', weight: 0, effect: '',
    damage: '', armor_rating: '', grip: '', range: '', durability: '', features: ''
  });
  const [customQty, setCustomQty] = useState(1);
  const [saveCustomToDb, setSaveCustomToDb] = useState(false);
  // The weapon as it was before it was made mastercrafted, so unticking puts it back.
  const [mastercraftBase, setMastercraftBase] = useState<Partial<GameItem> | null>(null);
  const aiSettings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const hasAiKey = Boolean(aiSettings.data?.hasKey);
  const [aiWish, setAiWish] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [beforeEnhance, setBeforeEnhance] = useState<Partial<GameItem> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCustomizing) {
      customNameInputRef.current?.focus();
    } else {
      searchInputRef.current?.focus();
    }
  }, [isCustomizing]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const search = searchTerm.toLowerCase();
    return allItems.filter(item => !item.always_available && !isService(item) && item.name.toLowerCase().includes(search)).slice(0, 50);
  }, [searchTerm, allItems]);

  // Items picked from the list come as the shop sells them (Bandages: a pack of 10); custom loot is counted in units.
  const handleStageItem = (item: GameItem, quantity: number, asListed = false) => {
    if (quantity <= 0) return;
    const newStaged = new Map(stagedLoot);
    const existing = newStaged.get(item.id);
    const contents = asListed ? listingContents(item) : { name: item.name, quantity: 1 };
    newStaged.set(item.id, { item, name: contents.name, unitsEach: contents.quantity, quantity: (existing?.quantity || 0) + quantity });
    setStagedLoot(newStaged);
    setSearchTerm('');
  };

  const handleStartCustomizing = (baseItem?: GameItem) => {
    if (baseItem) {
      const rest: Partial<GameItem> = { ...baseItem };
      delete rest.id;
      delete rest.party_id;
      setCustomForm({ ...rest });
    } else {
      setCustomForm({
        name: searchTerm || '', category: 'LOOT', cost: '0', weight: 0, effect: '',
        damage: '', armor_rating: '', grip: '', range: '', durability: '', features: ''
      });
    }
    setCustomQty(1);
    setSaveCustomToDb(false);
    setMastercraftBase(null);
    setAiWish('');
    setAiError(null);
    setBeforeEnhance(null);
    setIsCustomizing(true);
  };

  const handleEnhanceWithAi = async () => {
    setIsEnhancing(true);
    setAiError(null);
    try {
      const original = customForm;
      const { item } = await enhanceLootItem(partyId, original, aiWish);
      setBeforeEnhance(original);
      setCustomForm({ ...original, ...item });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not enhance the item.');
    } finally {
      setIsEnhancing(false);
    }
  };

  // Mastercrafted stats must travel with the weapon, so it is always saved to the campaign's item list.
  const handleToggleMastercrafted = (on: boolean) => {
    if (on) {
      setMastercraftBase(customForm);
      setCustomForm(makeMastercrafted(customForm));
      setSaveCustomToDb(true);
    } else if (mastercraftBase) {
      setCustomForm(mastercraftBase);
      setMastercraftBase(null);
    }
  };

  const handleSaveCustomItem = async () => {
    if (!customForm.name?.trim()) return;
    const quantity = Number.isFinite(customQty) && customQty > 0 ? customQty : 1;

    if (!saveCustomToDb) {
      const oneOff: GameItem = {
        ...customForm,
        id: `${ONE_OFF_ID_PREFIX}${generateId()}`,
        name: customForm.name.trim(),
        category: (customForm.category || 'LOOT').toUpperCase(),
        effect: buildOneOffDescription(customForm),
        is_custom: true,
      } as GameItem;
      handleStageItem(oneOff, quantity);
      setIsCustomizing(false);
      setCustomForm({});
      return;
    }

    setIsSavingCustom(true);
    try {
      // Saved items belong to this campaign only, so other campaigns never see them.
      const newItem = await createGameItem({ ...customForm, name: customForm.name.trim(), party_id: partyId });
      await queryClient.invalidateQueries({ queryKey: ['gameItems'] });
      handleStageItem(newItem, quantity);
      setIsCustomizing(false);
      setCustomForm({});
      setMastercraftBase(null);
    } catch (err) {
      console.error("Failed to create custom item", err);
      alert(err instanceof Error && /duplicate|unique/i.test(err.message)
        ? "This campaign already has an item with that name."
        : "Failed to save custom item.");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const handleConfirmLoot = async () => {
    if (stagedLoot.size === 0) return;
    setIsProcessing(true);
    await onAssignLoot(Array.from(stagedLoot.values()));
    setIsProcessing(false);
    onClose();
  };

  const isWeapon = (cat: string) => cat?.toUpperCase().includes('WEAPON') || cat?.toUpperCase().includes('SHIELD');
  const isArmor = (cat: string) => cat?.toUpperCase().includes('ARMOR') || cat?.toUpperCase().includes('HELMET');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <div><h3 className="text-lg font-bold text-gray-800">Assign Loot</h3><p className="text-xs text-gray-500">Pick items from the item list or create custom loot for this campaign.</p></div>
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* LEFT: Search / Create */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200 bg-white relative">
            {isCustomizing ? (
              <div className="absolute inset-0 z-10 bg-white flex flex-col animate-in slide-in-from-left-4 duration-200">
                <div className="p-3 border-b flex items-center gap-2 bg-indigo-50 text-indigo-900"><button onClick={() => setIsCustomizing(false)}><ArrowLeft size={18} /></button><span className="font-bold text-sm">Create Custom Loot</span></div>
                <div className="p-4 flex-grow overflow-y-auto space-y-4">
                  {hasAiKey ? (
                    <div className="bg-violet-50 p-3 rounded border border-violet-100 space-y-2">
                      <label htmlFor="loot-ai-wish" className="flex items-center gap-1.5 text-xs font-bold uppercase text-violet-800"><Sparkles size={12} /> AI helper</label>
                      <textarea id="loot-ai-wish" className="w-full p-2 border border-violet-200 rounded text-sm h-14" value={aiWish} onChange={e => setAiWish(e.target.value)}
                        placeholder="Optional: what should it be? E.g. a cursed dagger the bandit chief carried" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" icon={Sparkles} loading={isEnhancing} disabled={isEnhancing || (!aiWish.trim() && !customForm.name?.trim())}
                          title="Fill in the name, description and stats with your own AI key. Nothing is saved until you add it." onClick={handleEnhanceWithAi}>
                          Enhance with AI
                        </Button>
                        {beforeEnhance && (
                          <Button size="sm" variant="ghost" icon={Undo2} onClick={() => { setCustomForm(beforeEnhance); setBeforeEnhance(null); }}>Undo</Button>
                        )}
                      </div>
                      {aiError && <p role="alert" className="text-xs text-red-700">{aiError}</p>}
                    </div>
                  ) : aiSettings.isSuccess && (
                    <p className="text-xs text-gray-500"><Sparkles size={12} className="inline mr-1" />Add your OpenRouter key in <Link to="/settings?section=connections" className="text-indigo-600 underline">Settings, AI Assistants</Link> to let AI fill in custom items.</p>
                  )}
                  <div><label htmlFor="loot-custom-name" className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label><input id="loot-custom-name" ref={customNameInputRef} type="text" className="w-full p-2 border rounded font-medium" value={customForm.name} onChange={e => setCustomForm({ ...customForm, name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label htmlFor="loot-custom-category" className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label><input id="loot-custom-category" type="text" className="w-full p-2 border rounded text-sm uppercase" value={customForm.category} onChange={e => setCustomForm({ ...customForm, category: e.target.value })} placeholder="LOOT, WEAPON..." /></div>
                    <div><label htmlFor="loot-custom-cost" className="block text-xs font-bold text-gray-500 uppercase mb-1">Cost</label><input id="loot-custom-cost" type="text" className="w-full p-2 border rounded text-sm" value={customForm.cost} onChange={e => setCustomForm({ ...customForm, cost: e.target.value })} /></div>
                  </div>
                  {isWeapon(customForm.category || '') && (
                    <div className="bg-red-50 p-3 rounded border border-red-100 space-y-3">
                      <div className="flex items-center gap-2 text-red-800 text-xs font-bold uppercase"><Sword size={12} /> Weapon Stats</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label htmlFor="loot-custom-damage" className="block text-xs font-semibold text-red-700">Damage</label><input id="loot-custom-damage" className="w-full p-1 border rounded text-sm" value={customForm.damage} onChange={e => setCustomForm({ ...customForm, damage: e.target.value })} /></div>
                        <div><label htmlFor="loot-custom-grip" className="block text-xs font-semibold text-red-700">Grip</label><input id="loot-custom-grip" className="w-full p-1 border rounded text-sm" value={customForm.grip} onChange={e => setCustomForm({ ...customForm, grip: e.target.value })} /></div>
                        <div><label htmlFor="loot-custom-durability" className="block text-xs font-semibold text-red-700">Durability</label><input id="loot-custom-durability" className="w-full p-1 border rounded text-sm" value={customForm.durability} onChange={e => setCustomForm({ ...customForm, durability: e.target.value })} /></div>
                        <div><label htmlFor="loot-custom-range" className="block text-xs font-semibold text-red-700">Range</label><input id="loot-custom-range" className="w-full p-1 border rounded text-sm" value={customForm.range} onChange={e => setCustomForm({ ...customForm, range: e.target.value })} /></div>
                        <div><label htmlFor="loot-custom-strength" className="block text-xs font-semibold text-red-700">STR requirement</label><input id="loot-custom-strength" className="w-full p-1 border rounded text-sm" value={String(customForm.strength_requirement ?? '')} onChange={e => setCustomForm({ ...customForm, strength_requirement: e.target.value })} placeholder="—" /></div>
                      </div>
                      <div className="flex items-start gap-2 border-t border-red-100 pt-3">
                        <input id="loot-custom-mastercrafted" type="checkbox" className="mt-0.5" checked={mastercraftBase !== null} onChange={e => handleToggleMastercrafted(e.target.checked)} />
                        <label htmlFor="loot-custom-mastercrafted" className="text-xs text-red-800 cursor-pointer">
                          <span className="font-bold">Mastercrafted</span> · ten times the cost, 3 less STR needed, 3 more durability.
                          <span className="block text-red-700/80">Saved to this campaign's item list so its stats stay with it.</span>
                        </label>
                      </div>
                    </div>
                  )}
                  {isArmor(customForm.category || '') && (
                    <div className="bg-blue-50 p-3 rounded border border-blue-100"><label htmlFor="loot-custom-armor-rating" className="block text-xs font-semibold text-blue-700 mb-1"><Shield size={12} className="inline mr-1" />Armor Rating</label><input id="loot-custom-armor-rating" type="number" className="w-full p-1.5 border border-blue-200 rounded text-sm" value={customForm.armor_rating} onChange={e => setCustomForm({ ...customForm, armor_rating: e.target.value })} /></div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div><label htmlFor="loot-custom-weight" className="block text-xs font-bold text-gray-500 uppercase mb-1">Weight</label><input id="loot-custom-weight" type="number" step="0.1" className="w-full p-2 border rounded text-sm" value={customForm.weight} onChange={e => setCustomForm({ ...customForm, weight: parseFloat(e.target.value) })} /></div>
                    <div><label htmlFor="loot-custom-quantity" className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantity</label><input id="loot-custom-quantity" type="number" min="1" className="w-full p-2 border rounded text-sm" value={customQty} onChange={e => setCustomQty(parseInt(e.target.value))} /></div>
                  </div>
                  <div><label htmlFor="loot-custom-effect" className="block text-xs font-bold text-gray-500 uppercase mb-1">Effect / Description</label><textarea id="loot-custom-effect" className="w-full p-2 border rounded text-sm h-20" value={customForm.effect} onChange={e => setCustomForm({ ...customForm, effect: e.target.value })} /></div>
                  <div className="flex items-start gap-2 p-3 rounded border border-gray-200 bg-gray-50">
                    <input id="loot-custom-save-db" type="checkbox" className="mt-1" checked={saveCustomToDb} disabled={mastercraftBase !== null} onChange={e => setSaveCustomToDb(e.target.checked)} />
                    <div className="text-sm">
                      <label htmlFor="loot-custom-save-db" className="font-semibold text-gray-800 cursor-pointer">Save to this campaign's item list</label>
                      <p className="text-xs text-gray-500">{saveCustomToDb ? 'You can add it again later. Only this campaign can see it.' : 'One-off loot: only this stash gets it. Stats are kept in its description.'}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsCustomizing(false)}>Cancel</Button>
                  <Button variant="primary" icon={saveCustomToDb ? Save : Plus} onClick={handleSaveCustomItem} disabled={isSavingCustom || !customForm.name?.trim()} loading={isSavingCustom}>{saveCustomToDb ? 'Save & Add' : 'Add to Loot'}</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b space-y-3">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input ref={searchInputRef} type="text" placeholder="Search database..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none" /></div>
                  <Button variant="secondary" size="sm" icon={Plus} className="w-full justify-center" onClick={() => handleStartCustomizing()}>Create Custom Loot</Button>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1 bg-gray-50/50">
                  {filteredItems.map(item => (
                    <div key={item.id} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center gap-3 hover:border-blue-300 transition-colors group relative">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                        <div className="flex gap-2 text-xs text-gray-500">
                          <span>{item.category}</span>
                          {item.party_id
                            ? <span className="text-indigo-600 bg-indigo-50 px-1 rounded font-bold text-[9px] flex items-center gap-0.5"><AlertCircle size={8} /> Campaign</span>
                            : item.is_custom && <span className="text-amber-600 bg-amber-50 px-1 rounded font-bold text-[9px] flex items-center gap-0.5"><AlertCircle size={8} /> Custom</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleStartCustomizing(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Clone & Customize"><Pencil size={16} /></button>
                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => handleStageItem(item, 1, true)}>Add</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Staging */}
          <div className="w-full md:w-1/2 flex flex-col bg-gray-50">
            <div className="p-3 bg-blue-50 border-b border-blue-100"><h4 className="font-bold text-blue-900 text-sm uppercase">Pending Loot ({stagedLoot.size})</h4></div>
            <div className="flex-grow overflow-y-auto p-3 space-y-2">
              {Array.from(stagedLoot.values()).map(({ item, name, unitsEach, quantity }) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm animate-in slide-in-from-left-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded flex items-center justify-center font-bold text-xs">{quantity}x</div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{name}</p>
                      {unitsEach > 1 && <p className="text-[10px] text-gray-500">{quantity} × pack of {unitsEach} = {quantity * unitsEach} in the stash</p>}
                      {isOneOffItem(item) && <p className="text-[10px] font-bold uppercase text-amber-600">One-off · {item.category}</p>}
                    </div>
                  </div>
                  <button onClick={() => { const n = new Map(stagedLoot); n.delete(item.id); setStagedLoot(n); }} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-white flex justify-end gap-3"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={handleConfirmLoot} disabled={stagedLoot.size === 0 || isProcessing} icon={Plus}>Add Items</Button></div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

export function PartyInventory({ partyId, members, isDM }: PartyInventoryProps) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [inventory, setInventory] = useState<PartyInventoryTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  // const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [transferQuantities, setTransferQuantities] = useState<Record<string, number>>({});
  const [transactionLog, setTransactionLog] = useState<TransactionLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLootModalOpen, setIsLootModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);

  const { data: readableItems = [] } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: () => fetchItems(), staleTime: Infinity });
  // A GM of several campaigns can read each one's items; only this campaign's and the shared ones apply here.
  const allItems = useMemo(
    () => readableItems.filter(item => !item.party_id || item.party_id === partyId),
    [readableItems, partyId]
  );
  const allItemsByName = useMemo(() => {
    // This campaign's own item wins over a shared item with the same name.
    const ordered = [...allItems.filter(item => !item.party_id), ...allItems.filter(item => item.party_id)];
    return new Map(ordered.map(item => [normalizeName(item.name), item]));
  }, [allItems]);

  const membersById = useMemo(() => {
    return new Map(members.map(member => [member.id, member]));
  }, [members]);
  const inventoryById = useMemo(() => {
    return new Map(inventory.map(item => [item.id, item]));
  }, [inventory]);
  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedCharacter = useMemo(() => membersById.get(selectedCharacterId), [membersById, selectedCharacterId]);
  const categories = useMemo(() => ['all', ...new Set(inventory.map(i => i.category).filter(Boolean) as string[])], [inventory]);
  const filteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return inventory.filter(
      i =>
        i.name.toLowerCase().includes(normalizedSearch) &&
        (categoryFilter === 'all' || i.category === categoryFilter)
    );
  }, [inventory, searchTerm, categoryFilter]);
  const inventoryTotalQuantity = useMemo(() => inventory.reduce((acc, i) => acc + i.quantity, 0), [inventory]);
  const reversedTransactionLog = useMemo(() => [...transactionLog].reverse(), [transactionLog]);
  const marketVal = useMemo(() => {
    let totalGoldValue = 0;
    const itemsToSell = inventory.filter(i => selectedItemIdSet.has(i.id));
    for (const invItem of itemsToSell) {
      if (isCurrencyItem(invItem.name)) {
        const key = getCurrencyKey(invItem.name);
        if (key === 'gold') totalGoldValue += invItem.quantity;
        else if (key === 'silver') totalGoldValue += invItem.quantity / 10;
        else totalGoldValue += invItem.quantity / 100;
        continue;
      }
      const baseItem = allItemsByName.get(normalizeName(invItem.name));
      const costStr = baseItem?.cost || '0';
      const { gold, silver, copper } = parseCost(costStr);
      totalGoldValue += (gold + (silver / 10) + (copper / 100)) * invItem.quantity;
    }

    if (totalGoldValue >= 1) return { value: totalGoldValue, unit: 'Gold' };
    if (totalGoldValue >= 0.1) return { value: totalGoldValue * 10, unit: 'Silver' };
    return { value: Math.round(totalGoldValue * 100), unit: 'Copper' };
  }, [inventory, selectedItemIdSet, allItemsByName]);

  const getParticipantName = (type: string, id: string) => {
    if (type === 'party') return 'Party Stash';
    if (id === 'merchant') return 'Merchant';
    if (id === 'sold') return 'Sold';
    if (id === 'void') return 'Discarded';
    if (type === 'character') {
      return membersById.get(id)?.name || 'Character';
    }
    return 'Unknown';
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const isSelected = prev.includes(itemId);
      if (isSelected) {
        setTransferQuantities(q => {
          const next = { ...q };
          delete next[itemId];
          return next;
        });
        return prev.filter(id => id !== itemId);
      } else {
        const item = inventoryById.get(itemId);
        setTransferQuantities(q => ({ ...q, [itemId]: item?.quantity || 1 }));
        return [...prev, itemId];
      }
    });
  };

  // --- REAL-TIME & DATA LOADING ---
  const loadData = useCallback(async () => {
    try {
      const [invRes, logRes] = await Promise.all([
        supabase.from('party_inventory').select('*').eq('party_id', partyId),
        supabase.from('party_inventory_log').select('*').eq('party_id', partyId).order('timestamp', { ascending: false }).limit(50)
      ]);
      setInventory(
        (invRes.data || [])
          .map((raw): PartyInventoryTableItem | null => {
            const row = raw as Partial<PartyInventoryTableItem>;
            if (!row.id) return null;
            return {
              id: String(row.id),
              name: coerceItemName(row.name),
              quantity: Math.max(0, Number(row.quantity) || 0),
              description: typeof row.description === 'string' ? row.description : '',
              category: typeof row.category === 'string' ? row.category : undefined,
              party_id: String(row.party_id || partyId),
              stored_in: typeof row.stored_in === 'string' ? row.stored_in : null,
            };
          })
          .filter((row): row is PartyInventoryTableItem => row !== null)
      );
      setTransactionLog((logRes.data || []));
    } catch (err) {
      console.error('Failed to sync inventory.', err);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  const inventoryBindings = useMemo(() => ([
    {
      bindingId: 'inventory',
      event: '*' as const,
      schema: 'public' as const,
      table: 'party_inventory',
      filter: `party_id=eq.${partyId}`,
    },
    {
      bindingId: 'inventory-log',
      event: '*' as const,
      schema: 'public' as const,
      table: 'party_inventory_log',
      filter: `party_id=eq.${partyId}`,
    },
  ]), [partyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealtimeChannel({
    key: `party_inv_${partyId}`,
    scope: `party:${partyId}`,
    bindings: inventoryBindings,
    fallbackRefetchMs: 15000,
    onEvent: () => {
      void loadData();
    },
    onReconnect: async () => {
      await loadData();
    },
  });

  // Vehicles in the stash carry the party's cargo. Horses and donkeys ridden by members or kept in the stash can pull them.
  const definitionFor = useCallback((name: string) => allItemsByName.get(normalizeName(name)), [allItemsByName]);
  const draftAvailable = useMemo(() => (
    members.reduce((sum, member) => sum + (member.equipment?.equipped?.animals || []).filter(animal => isDraftAnimal(String(animal?.name || ''))).length, 0)
    + inventory.filter(row => isDraftAnimal(row.name) && String(definitionFor(row.name)?.category || row.category || '').toUpperCase() === 'ANIMALS')
      .reduce((sum, row) => sum + row.quantity, 0)
  ), [members, inventory, definitionFor]);
  const vehicles = useMemo(() => vehicleCargo(inventory, definitionFor, draftAvailable), [inventory, definitionFor, draftAvailable]);
  const vehicleIds = useMemo(() => new Set(vehicles.map(vehicle => vehicle.id)), [vehicles]);
  const selectedRows = useMemo(() => inventory.filter(row => selectedItemIdSet.has(row.id)), [inventory, selectedItemIdSet]);
  const loadableSelection = selectedRows.filter(row => !vehicleIds.has(row.id) && !isCurrencyItem(row.name));

  // Loading moves the chosen amount onto a vehicle (or back into the stash), stacking with what is already there.
  const handleMoveSelected = async (target: string | null) => {
    const rows = loadableSelection.filter(row => (row.stored_in ?? null) !== target);
    if (!rows.length) return;
    try {
      for (const row of rows) {
        const amount = Math.min(Math.max(1, transferQuantities[row.id] || row.quantity), row.quantity);
        const destination = inventory.find(other => other.id !== row.id && (other.stored_in ?? null) === target
          && getItemStackKey(other.name, other.description) === getItemStackKey(row.name, row.description));
        if (amount === row.quantity && !destination) {
          await supabase.from('party_inventory').update({ stored_in: target }).eq('id', row.id);
          continue;
        }
        if (destination) await supabase.from('party_inventory').update({ quantity: destination.quantity + amount }).eq('id', destination.id);
        else await supabase.from('party_inventory').insert([{ party_id: partyId, name: row.name, quantity: amount, category: row.category || 'LOOT', description: row.description || '', stored_in: target }]);
        if (amount === row.quantity) await supabase.from('party_inventory').delete().eq('id', row.id);
        else await supabase.from('party_inventory').update({ quantity: row.quantity - amount }).eq('id', row.id);
      }
      setSelectedItemIds([]);
      setTransferQuantities({});
      await loadData();
    } catch (err) { console.error('Failed to load cargo.', err); }
  };

  const renderStashRow = (item: PartyInventoryTableItem) => (
    <button type="button" key={item.id} onClick={() => toggleItemSelection(item.id)} className={`w-full p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-all group ${selectedItemIdSet.has(item.id) ? 'bg-indigo-50 border-indigo-500 shadow-sm ring-1 ring-indigo-500' : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${selectedItemIdSet.has(item.id) ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'}`}>{item.quantity}</div>
        <div><p className={`font-medium text-sm ${selectedItemIdSet.has(item.id) ? 'text-indigo-900' : 'text-gray-900'}`}>{item.name}</p>{item.category && <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{item.category}</p>}</div>
      </div>
      {item.description && <div className="hidden group-hover:block max-w-xs text-xs text-gray-500 truncate ml-4">{item.description}</div>}
    </button>
  );

  // --- HANDLER: Assign Loot to Party ---
  const handleAssignLoot = async (loot: StagedLoot[]) => {
    try {
      await addItemsToPartyStash(partyId, loot.map(({ item, name, unitsEach, quantity }) => ({
        name: coerceItemName(name),
        category: item.category,
        description: item.effect || item.description || '',
        quantity: quantity * unitsEach,
      })));
      await loadData();
    } catch (err) { console.error('Failed to assign loot.', err); }
  };

  // --- HANDLER: Delete Selected from Party ---
  const handleDeleteSelected = async () => {
    if (!selectedItemIds.length) return;
    const count = selectedItemIds.length;
    if (!(await confirm({ title: `Delete ${count} item${count === 1 ? '' : 's'}?`, description: `${count === 1 ? 'This item' : `These ${count} items`} will be permanently deleted from the party stash.`, confirmText: 'Delete from stash' }))) return;

    const itemsToDelete = inventory.filter(i => selectedItemIdSet.has(i.id));
    setInventory(prev => prev.filter(i => !selectedItemIdSet.has(i.id)));
    setSelectedItemIds([]);

    try {
      const { error } = await supabase.from('party_inventory').delete().in('id', selectedItemIds);
      if (error) throw error;

      const logs = itemsToDelete.map(item => ({
        party_id: partyId, item_name: item.name, quantity: item.quantity,
        from_type: 'party', from_id: partyId, to_type: 'void', to_id: 'destroyed'
      }));
      await supabase.from('party_inventory_log').insert(logs);

    } catch (err) {
      console.error('Failed to delete items.', err);
      loadData();
    }
  };

  // --- HANDLER: Sell Selected Items ---

  const handleConfirmSell = async (finalPrice: number, unit: string) => {
    if (!selectedItemIds.length) return;

    const itemsToSell = inventory.filter(i => selectedItemIdSet.has(i.id));
    const targetName = unit === 'Coins' ? 'Gold' : unit;

    try {
      // 1. Delete Sold Items
      await supabase.from('party_inventory').delete().in('id', selectedItemIds);

      // 2. Add Currency
      const existing = inventory.find(i => normalizeName(i.name) === normalizeName(targetName));

      if (existing) {
        await supabase.from('party_inventory').update({ quantity: existing.quantity + finalPrice }).eq('id', existing.id);
      } else {
        await supabase.from('party_inventory').insert([{
          party_id: partyId, name: targetName, quantity: finalPrice, category: 'CURRENCY', description: `${targetName} coins`
        }]);
      }

      // 3. Logs
      const logs = itemsToSell.map(item => ({
        party_id: partyId, item_name: item.name, quantity: item.quantity,
        from_type: 'party', from_id: partyId, to_type: 'character', to_id: 'sold' // character to_type is string but usually characters? fixed below
      }));

      // Log the income
      logs.push({
        party_id: partyId, item_name: targetName, quantity: finalPrice,
        from_type: 'character', from_id: 'merchant', to_type: 'party', to_id: partyId
      });

      await supabase.from('party_inventory_log').insert(logs);

      setIsSellModalOpen(false);
      setSelectedItemIds([]);
      loadData();
    } catch (err) {
      console.error('Failed to process sale.', err);
    }
  };

  // --- HANDLER: Transfer Party -> Character ---
  const handleTransferToCharacter = async () => {
    if (!selectedCharacterId || selectedItemIds.length === 0) return;
    const character = membersById.get(selectedCharacterId);
    if (!character) return;

    const itemsToTransfer = selectedItemIds
      .map(itemId => {
        const partyItem = inventoryById.get(itemId);
        if (!partyItem) return null;
        const qty = Math.min(transferQuantities[itemId] || 1, partyItem.quantity || 0);
        if (qty <= 0) return null;
        return { partyItem, qty };
      })
      .filter((item): item is { partyItem: PartyInventoryTableItem; qty: number } => item !== null);

    if (itemsToTransfer.length === 0) return;

    const qtyByItemId = new Map(itemsToTransfer.map(entry => [entry.partyItem.id, entry.qty]));
    // Optimistic update Party UI using requested transfer quantities.
    setInventory(prev =>
      prev
        .map(item => (qtyByItemId.has(item.id) ? { ...item, quantity: item.quantity - (qtyByItemId.get(item.id) || 0) } : item))
        .filter(item => item.quantity > 0)
    );
    setSelectedItemIds([]);
    setTransferQuantities({});

    try {
      const updatedMoney = { ...(character.equipment?.money || { gold: 0, silver: 0, copper: 0 }) };
      const updatedCharacterInventory = [...(character.equipment?.inventory || [])];
      const rowsToUpdate: Array<{ id: string; quantity: number }> = [];
      const idsToDelete: string[] = [];
      const logs: Array<{
        party_id: string;
        item_name: string;
        quantity: number;
        from_type: 'party';
        from_id: string;
        to_type: 'character';
        to_id: string;
      }> = [];

      for (const { partyItem, qty } of itemsToTransfer) {
        const safeItemName = coerceItemName(partyItem.name);
        // 1. Decrement Party Inv
        if (partyItem.quantity > qty) {
          rowsToUpdate.push({ id: partyItem.id, quantity: partyItem.quantity - qty });
        } else {
          idsToDelete.push(partyItem.id);
        }

        // 2. Add to Character Inv or Money
        if (isCurrencyItem(partyItem.name)) {
          const key = getCurrencyKey(partyItem.name);
          updatedMoney[key] = (updatedMoney[key] || 0) + qty;
        } else {
          const existingIdx = updatedCharacterInventory.findIndex(i => getItemStackKey(i.name, i.description) === getItemStackKey(safeItemName, partyItem.description));
          const baseDetails = allItemsByName.get(normalizeName(safeItemName));

          if (existingIdx >= 0) {
            updatedCharacterInventory[existingIdx] = {
              ...updatedCharacterInventory[existingIdx],
              quantity: (updatedCharacterInventory[existingIdx].quantity || 1) + qty
            };
          } else {
            updatedCharacterInventory.push({
              id: generateId(),
              name: safeItemName,
              quantity: qty,
              category: partyItem.category || baseDetails?.category || 'LOOT',
              description: partyItem.description || baseDetails?.effect || '',
              ...(baseDetails?.id ? { definitionId: baseDetails.id } : {}),
            });
          }
        }

        logs.push({
          party_id: partyId,
          item_name: safeItemName,
          quantity: qty,
          from_type: 'party',
          from_id: partyId,
          to_type: 'character',
          to_id: character.id
        });
      }

      if (rowsToUpdate.length > 0) {
        await supabase.from('party_inventory').upsert(rowsToUpdate, { onConflict: 'id' });
      }
      if (idsToDelete.length > 0) {
        await supabase.from('party_inventory').delete().in('id', idsToDelete);
      }

      await supabase
        .from('characters')
        .update({
          equipment: {
            ...character.equipment,
            money: updatedMoney,
            inventory: updatedCharacterInventory
          }
        })
        .eq('id', character.id);

      if (logs.length > 0) {
        const { error: logError } = await supabase.from('party_inventory_log').insert(logs);
        if (logError) {
          console.error('Failed to write party transfer logs.', logError);
        }
      }

      // FIX: Force refresh of character data in other components
      await queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      await queryClient.invalidateQueries({ queryKey: ['party', partyId] }); // Refresh member list just in case

      setSelectedCharacterId('');
      await loadData();
    } catch (err) { console.error('Transfer failed.', err); loadData(); }
  };

  // --- HANDLER: Transfer Character -> Party ---
  const handleTransferToParty = async (charItem: CharacterInventoryItem) => {
    const character = membersById.get(selectedCharacterId);
    if (!character || !charItem.name) return;
    const safeCharItemName = coerceItemName(charItem.name);

    try {
      const currentInv = [...(character.equipment?.inventory || [])];
      // FIX: Match by ID to ensure we remove the EXACT item the user clicked
      const idx = currentInv.findIndex(i => i.id === charItem.id);

      if (idx === -1) {
        // Fallback to name if ID missing (legacy data)
        const nameIdx = currentInv.findIndex(i => normalizeName(i.name) === normalizeName(safeCharItemName));
        if (nameIdx === -1) return;
        if ((currentInv[nameIdx].quantity || 1) > 1) {
          currentInv[nameIdx].quantity = (currentInv[nameIdx].quantity || 1) - 1;
        } else {
          currentInv.splice(nameIdx, 1);
        }
      } else {
        // Standard ID-based removal
        if ((currentInv[idx].quantity || 1) > 1) {
          currentInv[idx].quantity = (currentInv[idx].quantity || 1) - 1;
        } else {
          currentInv.splice(idx, 1);
        }
      }

      // Update Character DB
      await supabase.from('characters').update({ equipment: { ...character.equipment, inventory: currentInv } }).eq('id', character.id);

      // Add to Party DB
      // Stack if Name AND Description match
      const existingPartyItem = inventory.find(i => !i.stored_in &&
        getItemStackKey(i.name, i.description) === getItemStackKey(safeCharItemName, charItem.description)
      );

      if (existingPartyItem) {
        await supabase.from('party_inventory').update({ quantity: existingPartyItem.quantity + 1 }).eq('id', existingPartyItem.id);
      } else {
        const details = allItemsByName.get(normalizeName(safeCharItemName));
        await supabase.from('party_inventory').insert([{
          party_id: partyId,
          name: safeCharItemName,
          quantity: 1,
          category: charItem.category || details?.category || 'LOOT',
          description: charItem.description || details?.effect || ''
        }]);
      }

      await supabase.from('party_inventory_log').insert([{ party_id: partyId, item_name: safeCharItemName, quantity: 1, from_type: 'character', from_id: character.id, to_type: 'party', to_id: partyId }]);

      // FIX: Refresh UI
      queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      queryClient.invalidateQueries({ queryKey: ['party', partyId] });

    } catch (err) { console.error('Transfer failed.', err); }
  };

  const handleTransferMoneyToParty = async (type: 'gold' | 'silver' | 'copper', amount: number = 1) => {
    const character = membersById.get(selectedCharacterId);
    if (!character || (character.equipment?.money?.[type] || 0) < amount) return;

    try {
      const money = { ...(character.equipment?.money || { gold: 0, silver: 0, copper: 0 }) };
      money[type] -= amount;

      await supabase.from('characters').update({ equipment: { ...character.equipment, money } }).eq('id', character.id);

      const targetName = type.charAt(0).toUpperCase() + type.slice(1);
      const existing = inventory.find(i => normalizeName(i.name) === normalizeName(targetName));

      if (existing) {
        await supabase.from('party_inventory').update({ quantity: existing.quantity + amount }).eq('id', existing.id);
      } else {
        await supabase.from('party_inventory').insert([{
          party_id: partyId, name: targetName, quantity: amount, category: 'CURRENCY', description: `${targetName} coins`
        }]);
      }

      await supabase.from('party_inventory_log').insert([{
        party_id: partyId, item_name: targetName, quantity: amount,
        from_type: 'character', from_id: character.id, to_type: 'party', to_id: partyId
      }]);

      queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      loadData();
    } catch (err) { console.error('Transfer failed.', err); }
  };

  const handleConsolidateCoins = async () => {
    let totalInGold = 0;
    const currencyItems = inventory.filter(i => isCurrencyItem(i.name));
    if (currencyItems.length === 0) return;

    currencyItems.forEach(i => {
      const key = getCurrencyKey(i.name);
      if (key === 'gold') totalInGold += i.quantity;
      else if (key === 'silver') totalInGold += i.quantity / 10;
      else totalInGold += i.quantity / 100;
    });

    try {
      // 1. Delete all currency items
      const idsToDelete = currencyItems.map(i => i.id);
      await supabase.from('party_inventory').delete().in('id', idsToDelete);

      // 2. Add as Gold (rounded)
      const finalGold = Math.floor(totalInGold);
      const remainingSilver = Math.floor((totalInGold - finalGold) * 10);
      const remainingCopper = Math.round((totalInGold - finalGold - (remainingSilver / 10)) * 100);

      if (finalGold > 0) {
        const existingGold = inventory.find(i => normalizeName(i.name) === 'gold');
        if (existingGold && !idsToDelete.includes(existingGold.id)) {
          await supabase.from('party_inventory').update({ quantity: existingGold.quantity + finalGold }).eq('id', existingGold.id);
        } else {
          await supabase.from('party_inventory').insert([{ party_id: partyId, name: 'Gold', quantity: finalGold, category: 'CURRENCY', description: 'Gold coins' }]);
        }
      }

      // We could add remaining silver/copper back, but the user said "all coins are converted to gold"
      // Let's keep the leftovers as silver/copper so no value is lost.
      if (remainingSilver > 0) {
        await supabase.from('party_inventory').insert([{ party_id: partyId, name: 'Silver', quantity: remainingSilver, category: 'CURRENCY', description: 'Silver coins' }]);
      }
      if (remainingCopper > 0) {
        await supabase.from('party_inventory').insert([{ party_id: partyId, name: 'Copper', quantity: remainingCopper, category: 'CURRENCY', description: 'Copper coins' }]);
      }

      await loadData();
    } catch (err) { console.error('Consolidation failed.', err); }
  };

  return (
    <>
      {confirmDialog}
      {isLootModalOpen && <LootAssignmentModal partyId={partyId} onClose={() => setIsLootModalOpen(false)} allItems={allItems} onAssignLoot={handleAssignLoot} />}

      {/* SELL MODAL */}
      {isSellModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Coins className="text-yellow-600" /> Sell Items</h3>
              <button onClick={() => setIsSellModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Selling <strong>{selectedItemIds.length}</strong> items.
                <br />Base value estimated at <strong>{marketVal.value} {marketVal.unit}</strong>.
                <br />Roll for bartering to determine the final merchant offer!
              </p>
              {(() => {
                const suggested = marketVal;
                return (
                  <BarteringCalculator
                    initialCost={suggested.value}
                    initialCurrency={suggested.unit}
                    initialMode="selling"
                    onConfirm={handleConfirmSell}
                    confirmLabel={`Sold! Add ${suggested.unit}`}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] overflow-hidden">

        {/* LEFT PANEL: PARTY STASH */}
        <div className={`lg:col-span-7 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${selectedCharacterId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-white z-10">
            <div className="flex items-center gap-2"><div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Users size={20} /></div><div><h2 className="text-lg font-bold text-gray-900">Party Stash</h2><p className="text-xs text-gray-500">{inventoryTotalQuantity} Items total</p></div></div>
            <div className="flex gap-2">
              {isDM && inventory.some(i => isCurrencyItem(i.name)) && <Button size="sm" variant="ghost" icon={Coins} onClick={handleConsolidateCoins} title="Consolidate to Gold" className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50" />}
              {isDM && <Button size="sm" variant="primary" icon={Plus} onClick={() => setIsLootModalOpen(true)}>Add Loot</Button>}
              <Button size="sm" variant="ghost" icon={History} onClick={() => setShowHistory(!showHistory)} className={showHistory ? "bg-gray-100" : ""} />
            </div>
          </div>
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex gap-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Filter items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white outline-none focus:ring-1 focus:ring-indigo-500" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}</select>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/30">
            {loading && inventory.length === 0 ? <LoadingSpinner /> : filteredInventory.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-400"><Package size={48} className="opacity-20 mb-2" /><p>Stash is empty or no match.</p></div> : (
              <>
                {filteredInventory.filter(item => !vehicleIds.has(item.id) && !(item.stored_in && vehicleIds.has(item.stored_in))).map(renderStashRow)}
                {vehicles.map(vehicle => {
                  const row = inventoryById.get(vehicle.id);
                  const cargo = filteredInventory.filter(item => item.stored_in === vehicle.id);
                  if (!row || (!filteredInventory.includes(row) && cargo.length === 0)) return null;
                  const short = vehicle.draftNeeded - vehicle.draftAvailable;
                  return (
                    <section key={vehicle.id} aria-label={`${vehicle.name} cargo`} className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-2 space-y-2">
                      {renderStashRow(row)}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px]">
                        <span className={vehicle.isOverloaded ? 'font-bold text-red-600' : 'font-semibold text-gray-600'}>Cargo {vehicle.load} / {vehicle.capacity}{vehicle.isOverloaded ? ' · overloaded' : ''}</span>
                        {short > 0 && <span className="font-semibold text-amber-700">Needs {vehicle.draftNeeded === 1 ? 'a horse or donkey' : `${vehicle.draftNeeded} horses or donkeys`} to pull it</span>}
                      </div>
                      {cargo.length > 0
                        ? <div className="ml-3 space-y-2 border-l-2 border-amber-200 pl-2">{cargo.map(renderStashRow)}</div>
                        : <p className="ml-3 text-[11px] italic text-gray-400">Nothing loaded. Select stash items, then use Load onto.</p>}
                    </section>
                  );
                })}
              </>
            )}
          </div>
          {/* DELETE & SELL FOOTER */}
          {selectedItemIds.length > 0 && (isDM || (vehicles.length > 0 && loadableSelection.length > 0)) && (
            <div className="p-3 border-t bg-indigo-50 flex flex-wrap justify-between items-center gap-2 animate-in slide-in-from-bottom-2 z-20">
              <div className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                <span>{selectedItemIds.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {vehicles.length > 0 && loadableSelection.length > 0 && (
                  <select aria-label="Load selected items onto" value="" onChange={e => { const target = e.target.value; if (target) void handleMoveSelected(target === 'stash' ? null : target); }} className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-800">
                    <option value="">Load onto…</option>
                    {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} ({vehicle.load} / {vehicle.capacity})</option>)}
                    {loadableSelection.some(row => row.stored_in) && <option value="stash">Unload into the stash</option>}
                  </select>
                )}
                {isDM && <Button variant="danger" size="sm" onClick={handleDeleteSelected}>Delete</Button>}
                {isDM && <Button variant="primary" size="sm" icon={Coins} onClick={() => setIsSellModalOpen(true)}>Sell Selected</Button>}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: TRANSFER */}
        <div className={`lg:col-span-5 flex flex-col gap-4 overflow-hidden ${selectedCharacterId ? 'flex' : 'flex lg:flex'}`}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-shrink-0 relative">
            {selectedCharacterId && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 lg:hidden bg-gray-100 hover:bg-gray-200 text-gray-600"
                onClick={() => setSelectedCharacterId('')}
                icon={X}
              >
                Close
              </Button>
            )}
            <label htmlFor="party-transfer-partner" className="block text-xs font-bold text-gray-500 uppercase mb-2">Transfer Partner</label>
            <select id="party-transfer-partner" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" value={selectedCharacterId} onChange={e => setSelectedCharacterId(e.target.value)}><option value="">Select Character...</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          {selectedCharacter ? (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className={`flex-1 bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden ${selectedItemIds.length > 0 ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-200'}`}>
                <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                  <h4 className="font-bold text-gray-700 text-sm">Transfer to {selectedCharacter.name}</h4>
                  <div className="flex gap-2 items-center">
                    <div className="flex gap-2 items-center bg-white border px-2 py-1 rounded text-[10px] font-bold shadow-sm">
                      <button onClick={() => handleTransferMoneyToParty('gold')} className="flex items-center gap-1 text-yellow-600 hover:bg-yellow-50 px-1 rounded transition-colors" title="Take 1 Gold">
                        <ArrowLeft size={10} /> G: {selectedCharacter.equipment?.money?.gold || 0}
                      </button>
                      <button onClick={() => handleTransferMoneyToParty('silver')} className="flex items-center gap-1 text-gray-400 hover:bg-gray-50 px-1 rounded transition-colors" title="Take 1 Silver">
                        <ArrowLeft size={10} /> S: {selectedCharacter.equipment?.money?.silver || 0}
                      </button>
                      <button onClick={() => handleTransferMoneyToParty('copper')} className="flex items-center gap-1 text-orange-600 hover:bg-orange-50 px-1 rounded transition-colors" title="Take 1 Copper">
                        <ArrowLeft size={10} /> C: {selectedCharacter.equipment?.money?.copper || 0}
                      </button>
                    </div>
                    {selectedItemIds.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">{selectedItemIds.length} Selected</span>}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-white">
                  {selectedItemIds.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center">
                      <Package size={32} className="opacity-20 mb-2" />
                      <p className="text-sm">Select items from the stash to transfer.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Transferring</h5>
                        <button
                          onClick={() => { setSelectedItemIds([]); setTransferQuantities({}); }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="space-y-2">
                        {inventory.filter(i => selectedItemIdSet.has(i.id)).map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                              <p className="text-[10px] text-gray-500">Available: {item.quantity}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.quantity > 1 && (
                                <input
                                  type="number"
                                  min="1"
                                  max={item.quantity}
                                  value={transferQuantities[item.id] || 1}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(item.quantity, parseInt(e.target.value) || 0));
                                    setTransferQuantities(prev => ({ ...prev, [item.id]: val }));
                                  }}
                                  className="w-16 px-2 py-1 text-xs border border-indigo-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => toggleItemSelection(item.id)}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-4 sticky bottom-0 bg-white">
                        <Button className="w-full" variant="primary" icon={ArrowRight} onClick={handleTransferToCharacter}>
                          Confirm Transfer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-3 border-b bg-gray-50"><h4 className="font-bold text-gray-700 text-sm">{selectedCharacter.name}'s Inventory</h4></div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50/30">
                  {selectedCharacter.equipment?.inventory?.length === 0 ? <div className="h-full flex items-center justify-center text-gray-400 text-sm">Empty Inventory</div> : selectedCharacter.equipment?.inventory?.map((item, idx) => (
                    <div key={item.id || idx} className="flex justify-between items-center p-2 bg-white border rounded hover:bg-gray-50 group"><span className="text-sm text-gray-800"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">{item.quantity}</span>{item.name}</span><Button size="sm" variant="secondary" icon={ArrowLeft} onClick={() => handleTransferToParty(item)}>Take</Button></div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 p-6 text-center"><Users size={48} className="mb-3 opacity-20" /><p className="font-medium">Select a character above to start transferring items.</p></div>
          )}
          {showHistory && (
            <div className="absolute right-0 top-16 bottom-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-20 animate-in slide-in-from-right duration-300 flex flex-col">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h3 className="font-bold text-gray-800">Transaction History</h3><button onClick={() => setShowHistory(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button></div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/20">
                {transactionLog.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center opacity-50">
                    <History size={32} className="mb-2" />
                    <p className="text-xs">No transactions yet.</p>
                  </div>
                ) : reversedTransactionLog.map(log => (
                  <div key={log.id} className="text-xs p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-indigo-900">{log.item_name}</p>
                      <span className="font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">x{log.quantity}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 py-1.5 px-2 bg-gray-50 rounded-md">
                      <span className="truncate shrink font-medium" title={getParticipantName(log.from_type, log.from_id)}>{getParticipantName(log.from_type, log.from_id)}</span>
                      <ArrowRight size={12} className="text-gray-300 shrink-0" />
                      <span className="truncate shrink font-medium" title={getParticipantName(log.to_type, log.to_id)}>{getParticipantName(log.to_type, log.to_id)}</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 flex items-center gap-1">
                      <History size={10} />
                      {new Date(log.timestamp).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
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
