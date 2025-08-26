import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllEncountersForParty,
  fetchEncounterDetails,
  fetchEncounterCombatants,
  createEncounter,
  deleteEncounter,
  duplicateEncounter,
  addCombatantToEncounter,
  AddCombatantPayload,
  updateEncounter,
  updateCombatant,
  removeCombatant,
  rollInitiativeForCombatants,
  swapInitiative,
  startEncounter,
  endEncounter,
  nextRound,
  // 🔧 NEW: server should persist a JSONB entry to encounters.log
  appendEncounterLog,
} from '../../lib/api/encounters';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import {
  PlusCircle,
  UserPlus,
  ShieldPlus,
  Trash2,
  Play,
  Square,
  Save,
  Edit3,
  XCircle,
  Heart,
  Zap,
  Dice6,
  SkipForward,
  ArrowUpDown,
  Users,
  Copy,
  List,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';

// --- TYPE DEFINITIONS ---
export interface MonsterStats { HP?: number; SIZE?: string; ARMOR?: number; FEROCITY?: number; MOVEMENT?: number; [key: string]: any; }
export interface MonsterAttack { name: string; effects: any[]; description: string; roll_values: string; }
export interface MonsterData { id: string; name: string; category?: string; stats?: MonsterStats; attacks?: MonsterAttack[]; effectsSummary?: string; }

interface PartyEncounterViewProps { partyId: string; partyMembers: Character[]; isDM: boolean; }
interface EditableCombatantStats { current_hp: string; current_wp?: string; initiative_roll?: string; }

// =====================================================================================
//  PartyEncounterView — modular, with quick-tweak 🔧 comments
// =====================================================================================
export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();
  const { open: openDice } = useDice();

  // --- STATE ---
  const [newEncounterName, setNewEncounterName] = useState('');
  const [newEncounterDescription, setNewEncounterDescription] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [showEncounterList, setShowEncounterList] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'create'>('details');
  const [addStep, setAddStep] = useState<'idle' | 'characters' | 'monsters'>('idle');
  const [isAddingMidFight, setIsAddingMidFight] = useState(false);
  const [selectedPartyMember, setSelectedPartyMember] = useState('');
  const [selectedMonster, setSelectedMonster] = useState('');
  const [customMonsterName, setCustomMonsterName] = useState('');
  const [monsterInstanceCount, setMonsterInstanceCount] = useState(1);
  const [partyInitiativeInput, setPartyInitiativeInput] = useState('');
  const [monsterInitiativeInput, setMonsterInitiativeInput] = useState('');
  const [editingStats, setEditingStats] = useState<Record<string, EditableCombatantStats>>({});
  const [isEditingEncounter, setIsEditingEncounter] = useState(false);
  const [editedEncounterName, setEditedEncounterName] = useState('');
  const [editedEncounterDescription, setEditedEncounterDescription] = useState('');
  const [selectedCombatantsForInitiative, setSelectedCombatantsForInitiative] = useState<string[]>([]);
  const [swapMode, setSwapMode] = useState(false);
  const [firstSwapCombatant, setFirstSwapCombatant] = useState<string | null>(null);
  const [showMonsterDetails, setShowMonsterDetails] = useState<Record<string, boolean>>({});
  const [currentMonsterAttacks, setCurrentMonsterAttacks] = useState<Record<string, MonsterAttack | null>>({});
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null); // 🔧 current turn selection

  // --- QUERIES ---
  const { data: allEncounters, isLoading: loadingAllEncounters, error: errorAllEncounters } = useQuery<Encounter[], Error>({ queryKey: ['allEncounters', partyId], queryFn: () => fetchAllEncountersForParty(partyId), enabled: !!partyId });
  const currentEncounterId = useMemo(() => { if (selectedEncounterId) return selectedEncounterId; if (allEncounters && allEncounters.length > 0) return allEncounters[0].id; return null; }, [selectedEncounterId, allEncounters]);
  useEffect(() => { if (!loadingAllEncounters) setViewMode(!allEncounters || allEncounters.length === 0 ? 'create' : 'details'); }, [allEncounters, loadingAllEncounters]);
  const { data: encounterDetails, isLoading: loadingDetails, error: errorDetails } = useQuery<Encounter | null, Error>({ queryKey: ['encounterDetails', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)), enabled: !!currentEncounterId });
  const { data: combatantsData, isLoading: loadingCombatants, error: errorCombatants } = useQuery<EncounterCombatant[], Error>({ queryKey: ['encounterCombatants', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])), enabled: !!currentEncounterId });
  const { data: allMonsters, isLoading: loadingMonsters, error: errorMonsters } = useQuery<MonsterData[], Error>({ queryKey: ['allMonsters'], queryFn: fetchAllMonsters });

  useEncounterRealtime(currentEncounterId);

  // --- DERIVED ---
  const monstersById = useMemo(() => new Map((allMonsters ?? []).map((m) => [m.id, m] as const)), [allMonsters]);
  const combatants = useMemo(() => (combatantsData?.slice().sort((a, b) => {
    const ia = a.initiative_roll ?? -Infinity; const ib = b.initiative_roll ?? -Infinity; if (ia !== ib) return ib - ia; return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  }) || []), [combatantsData]);
  const orderLowToHigh = useMemo(() => combatants.slice().sort((a,b)=>{
    const ia = a.initiative_roll ?? Infinity; const ib = b.initiative_roll ?? Infinity; if (ia !== ib) return ia - ib; return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  }), [combatants]);

  useEffect(() => { if (!combatants) return; const init: Record<string, EditableCombatantStats> = {}; combatants.forEach((c) => { init[c.id] = { current_hp: String(c.current_hp ?? c.max_hp ?? 0), current_wp: c.max_wp != null ? String(c.current_wp ?? c.max_wp ?? '') : undefined, initiative_roll: c.initiative_roll != null ? String(c.initiative_roll) : '' }; }); setEditingStats(init); }, [combatants]);
  useEffect(() => { if (encounterDetails) { setEditedEncounterName(encounterDetails.name); setEditedEncounterDescription(encounterDetails.description || ''); } }, [encounterDetails]);

  // --- MUTATIONS ---
  const createEncounterMu = useMutation({ mutationFn: (payload: { name: string; description?: string }) => createEncounter(partyId, payload.name, payload.description), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setSelectedEncounterId(newEnc.id); setViewMode('details'); setNewEncounterName(''); setNewEncounterDescription(''); } });
  const deleteEncounterMu = useMutation({ mutationFn: deleteEncounter, onSuccess: (_, deletedId) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); if (selectedEncounterId === deletedId) setSelectedEncounterId(null); } });
  const duplicateEncounterMu = useMutation({ mutationFn: ({ encounterId, name }: { encounterId: string; name: string }) => duplicateEncounter(encounterId, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setSelectedEncounterId(newEnc.id); } });
  const addCombatantMu = useMutation({ mutationFn: (payload: AddCombatantPayload) => { if (!currentEncounterId) throw new Error('No active encounter'); return addCombatantToEncounter(currentEncounterId, payload); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSelectedPartyMember(''); setSelectedMonster(''); setCustomMonsterName(''); setMonsterInstanceCount(1); setPartyInitiativeInput(''); setMonsterInitiativeInput(''); setIsAddingMidFight(false); } });
  const updateCombatantMu = useMutation({ mutationFn: (data: { id: string; updates: Partial<EncounterCombatant> }) => updateCombatant(data.id, data.updates), onSuccess: (updated) => { queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', currentEncounterId], (old) => old?.map((c) => (c.id === updated.id ? updated : c)) ?? []); } });
  const removeCombatantMu = useMutation({ mutationFn: removeCombatant, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); } });
  const updateEncounterMu = useMutation({ mutationFn: (updates: Partial<Pick<Encounter, 'name' | 'description'>>) => { if (!currentEncounterId) throw new Error('No active encounter to update'); return updateEncounter(currentEncounterId, updates); }, onSuccess: (updatedEnc) => { queryClient.setQueryData(['encounterDetails', currentEncounterId], updatedEnc); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setIsEditingEncounter(false); } });
  const rollInitiativeMu = useMutation({ mutationFn: (combatantIds: string[]) => { if (!currentEncounterId) throw new Error('No active encounter'); return rollInitiativeForCombatants(currentEncounterId, combatantIds); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSelectedCombatantsForInitiative([]); } });
  const swapInitiativeMu = useMutation({ mutationFn: ({ id1, id2 }: { id1: string; id2: string }) => swapInitiative(id1, id2), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSwapMode(false); setFirstSwapCombatant(null); } });
  const startEncounterMu = useMutation({ mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter to start'); return startEncounter(currentEncounterId); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] }); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); } });
  const endEncounterMu = useMutation({ mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter to end'); return endEncounter(currentEncounterId); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] }); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); } });

  // NEW: server-side logging to encounters.log (jsonb)
  const appendLogMu = useMutation({
    mutationFn: (entry: any) => { if (!currentEncounterId) throw new Error('No encounter to log'); return appendEncounterLog(currentEncounterId, entry); },
  });

  const nextRoundMu = useMutation({
    mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter for next round'); return nextRound(currentEncounterId); },
    onSuccess: async () => {
      // Clear initiatives visually for new round
      queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', currentEncounterId], (old) => old?.map((c) => ({ ...c, initiative_roll: null })) ?? []);
      setSelectedCombatantsForInitiative([]);
      setSelectedActorId(null);
      // Log round advance
      appendLogMu.mutate({ type: 'round_advanced', ts: Date.now(), round: (encounterDetails?.current_round ?? 0) + 1 });
      queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] });
    },
  });

  // --- HANDLERS ---
  const handleCreateEncounter = (e: React.FormEvent) => { e.preventDefault(); if (!newEncounterName.trim()) return; createEncounterMu.mutate({ name: newEncounterName.trim(), description: newEncounterDescription.trim() || undefined }); };
  const handleDuplicateEncounter = (encounterId: string, name: string) => duplicateEncounterMu.mutate({ encounterId, name: `${name} (Copy)` });
  const handleSelectEncounter = (encounterId: string) => { setSelectedEncounterId(encounterId); setShowEncounterList(false); };
  const handleAddParty = () => { if (!selectedPartyMember || !currentEncounterId) return; addCombatantMu.mutate({ type: 'character', characterId: selectedPartyMember, initiativeRoll: partyInitiativeInput ? parseInt(partyInitiativeInput) : null }); };
  const handleAddMonster = () => { if (!selectedMonster || !currentEncounterId) return; addCombatantMu.mutate({ type: 'monster', monsterId: selectedMonster, customName: customMonsterName.trim() || undefined, instanceCount: monsterInstanceCount, initiativeRoll: monsterInitiativeInput ? parseInt(monsterInitiativeInput) : null }); };

  const handleSaveStats = (id: string) => {
    const stats = editingStats[id]; const c = combatants.find((x) => x.id === id); if (!stats || !c) return; const u: Partial<EncounterCombatant> = {};
    const nH = parseInt(stats.current_hp, 10); if (!isNaN(nH) && nH !== c.current_hp) { u.current_hp = nH; const delta = nH - (c.current_hp ?? 0); appendLogMu.mutate({ type: 'hp_change', ts: Date.now(), who: id, name: c.display_name, delta, from: c.current_hp, to: nH }); }
    if (stats.initiative_roll != null) { const nI = stats.initiative_roll.trim() === '' ? null : parseInt(stats.initiative_roll, 10); if ((nI === null || !isNaN(nI)) && nI !== c.initiative_roll) u.initiative_roll = nI; }
    if (c.max_wp != null && stats.current_wp != null) { const nW = stats.current_wp.trim() === '' ? null : parseInt(stats.current_wp, 10); if ((nW === null || !isNaN(nW)) && nW !== c.current_wp) { u.current_wp = nW; const delta = (nW ?? 0) - (c.current_wp ?? 0); appendLogMu.mutate({ type: 'wp_change', ts: Date.now(), who: id, name: c.display_name, delta, from: c.current_wp, to: nW }); } }
    if (Object.keys(u).length > 0) updateCombatantMu.mutate({ id, updates: u });
  };

  const handleRollInitiative = () => { if (selectedCombatantsForInitiative.length === 0) return; rollInitiativeMu.mutate(selectedCombatantsForInitiative); };
  const handleCombatantSwap = (combatantId: string) => { if (!swapMode) return; if (!firstSwapCombatant) setFirstSwapCombatant(combatantId); else if (firstSwapCombatant !== combatantId) swapInitiativeMu.mutate({ id1: firstSwapCombatant, id2: combatantId }); };
  const toggleMonsterDetails = (combatantId: string) => setShowMonsterDetails((prev) => ({ ...prev, [combatantId]: !prev[combatantId] }));
  const handleRollMonsterAttack = (combatantId: string, monster: MonsterData) => { if (!monster.attacks || monster.attacks.length === 0) return; const roll = Math.floor(Math.random() * 6) + 1; const attack = monster.attacks.find((att) => att.roll_values.split(',').includes(String(roll))); setCurrentMonsterAttacks((prev) => ({ ...prev, [combatantId]: attack || null })); appendLogMu.mutate({ type: 'monster_attack', ts: Date.now(), who: combatantId, name: monster.name, roll, attack: attack ? { name: attack.name, desc: attack.description } : null }); };

  const handleSelectActor = (id: string) => {
    if (selectedActorId === id) {
      setSelectedActorId(null);
      const c = combatants.find((x) => x.id === id);
      appendLogMu.mutate({ type: 'turn_end', ts: Date.now(), who: id, name: c?.display_name });
    } else {
      setSelectedActorId(id);
      const c = combatants.find((x) => x.id === id);
      appendLogMu.mutate({ type: 'turn_start', ts: Date.now(), who: id, name: c?.display_name });
    }
  };

  // --- RENDER HELPERS ---
  const availableParty = useMemo(() => { const idsInEncounter = new Set(combatants.map((c) => c.character_id)); return partyMembers.filter((m) => !idsInEncounter.has(m.id)); }, [partyMembers, combatants]);
  const selectedMonsterData = useMemo(() => allMonsters?.find((m) => m.id === selectedMonster), [allMonsters, selectedMonster]);

  // --- EARLY RETURNS ---
  if (!isDM) return <div className="p-4 text-center text-gray-600"><p>Only the DM can view and manage encounter details.</p></div>;
  if (loadingAllEncounters || loadingMonsters) return <LoadingSpinner />;
  if (errorAllEncounters || errorMonsters) return <ErrorMessage message={errorAllEncounters?.message || errorMonsters?.message || 'Error loading data'} />;

  const currentEncounter = encounterDetails;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ===================== STICKY HEADER ===================== */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 p-4 shadow-sm rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Encounter</h2>
            {currentEncounter && (
              <div className="text-sm text-gray-700 mt-1 flex items-center gap-3">
                <span> Status: <span className={`font-semibold ${currentEncounter.status === 'active' ? 'text-green-600' : currentEncounter.status === 'planning' ? 'text-yellow-600' : 'text-blue-600'}`}>{currentEncounter.status}</span></span>
                {currentEncounter.status === 'active' && currentEncounter.current_round > 0 && (
                  <span>Round: <span className="font-semibold">{currentEncounter.current_round}</span></span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowEncounterList(true)} Icon={List} variant="secondary">Encounters</Button>
            <Button onClick={() => openDice?.()} Icon={Dice6} variant="outline">Dice</Button>
            <Button onClick={() => setViewMode('create')} Icon={PlusCircle}>New</Button>
            {currentEncounter?.status === 'planning' && (<Button onClick={() => startEncounterMu.mutate()} Icon={Play}>Start</Button>)}
            {currentEncounter?.status === 'active' && (<><Button onClick={() => nextRoundMu.mutate()} Icon={SkipForward}>Next Round</Button><Button onClick={() => setIsAddingMidFight(true)} Icon={ShieldPlus} variant="outline">Reinforcements</Button><Button onClick={() => endEncounterMu.mutate()} Icon={Square} variant="secondary">End</Button></>)}
          </div>
        </div>
      </div>

      {/* ===================== CREATE ENCOUNTER ===================== */}
      {viewMode === 'create' ? (
        <form onSubmit={handleCreateEncounter} className="bg-white p-6 rounded-lg shadow space-y-4">
          <h3 className="text-lg font-semibold">Create New Encounter</h3>
          <input type="text" placeholder="Encounter Name" value={newEncounterName} onChange={(e) => setNewEncounterName(e.target.value)} required className="w-full px-3 py-2 border rounded-md" />
          <textarea placeholder="Description (optional)" value={newEncounterDescription} onChange={(e) => setNewEncounterDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md" />
          <div className="flex items-center gap-2"><Button type="submit" Icon={PlusCircle} isLoading={createEncounterMu.isPending}>Create Encounter</Button>{allEncounters && allEncounters.length > 0 && (<Button variant="secondary" onClick={() => setViewMode('details')}>Cancel</Button>)}</div>
        </form>
      ) : loadingDetails || !currentEncounter ? (<LoadingSpinner />) : errorDetails ? (<ErrorMessage message={errorDetails.message} />) : (
        <div className="space-y-6">
          {/* ===================== ENCOUNTER HEADER CARD ===================== */}
          <div className="bg-white p-6 rounded-lg shadow">
            {isEditingEncounter ? (
              <>
                <input type="text" value={editedEncounterName} onChange={(e) => setEditedEncounterName(e.target.value)} className="w-full px-3 py-2 border rounded-md text-xl font-semibold" placeholder="Encounter Name"/>
                <textarea value={editedEncounterDescription} onChange={(e) => setEditedEncounterDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-gray-600 mt-2" placeholder="Description"/>
                <div className="flex gap-2 mt-3"><Button size="sm" onClick={() => updateEncounterMu.mutate({ name: editedEncounterName, description: editedEncounterDescription })} isLoading={updateEncounterMu.isPending} Icon={Save}>Save</Button><Button size="sm" variant="secondary" onClick={() => setIsEditingEncounter(false)} Icon={XCircle}>Cancel</Button></div>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2"><div><h3 className="text-xl font-semibold">{currentEncounter.name}</h3>{currentEncounter.description && <p className="text-gray-600">{currentEncounter.description}</p>}</div><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} Icon={Edit3} aria-label="Edit"/></div>
                <div className="text-sm mt-2">Status: <span className={`font-medium ${currentEncounter.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>{currentEncounter.status}</span>{currentEncounter.current_round > 0 && currentEncounter.status === 'active' && (<span className="ml-3">Round: {currentEncounter.current_round}</span>)}</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {currentEncounter.status === 'planning' && (<Button onClick={() => startEncounterMu.mutate()} isLoading={startEncounterMu.isPending} Icon={Play}>Start Encounter</Button>)}
              {currentEncounter.status === 'active' && (<><Button onClick={() => nextRoundMu.mutate()} isLoading={nextRoundMu.isPending} Icon={SkipForward}>Next Round</Button><Button onClick={() => endEncounterMu.mutate()} isLoading={endEncounterMu.isPending} Icon={Square} variant="secondary">End Encounter</Button><Button onClick={() => setIsAddingMidFight(true)} Icon={ShieldPlus} variant="outline">Add Reinforcements</Button></>)}
              {currentEncounter.status === 'completed' && (<div className="flex items-center gap-2"><p className="text-gray-600 italic">Encounter completed.</p><Button size="sm" onClick={() => handleDuplicateEncounter(currentEncounter.id, currentEncounter.name)} Icon={Copy} isLoading={duplicateEncounterMu.isPending}>Duplicate</Button></div>)}
            </div>
          </div>

          {/* =============================== GRID LAYOUT =============================== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: Initiative tools */}
            <section className="lg:col-span-3 space-y-4 lg:sticky lg:top-24 self-start">
              {currentEncounter.status !== 'completed' && combatants.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg shadow space-y-3">
                  <h4 className="text-lg font-medium flex items-center gap-2"><Dice6 className="w-5 h-5" /> Initiative</h4>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="selectAll" checked={selectedCombatantsForInitiative.length === combatants.length && combatants.length > 0} onChange={(e) => setSelectedCombatantsForInitiative(e.target.checked ? combatants.map((c) => c.id) : [])}/>
                      <label htmlFor="selectAll" className="text-sm font-medium">All</label>
                    </div>
                    <Button size="sm" onClick={handleRollInitiative} Icon={Dice6} isLoading={rollInitiativeMu.isPending} disabled={selectedCombatantsForInitiative.length === 0}>Roll ({selectedCombatantsForInitiative.length})</Button>
                    <Button size="sm" variant={swapMode ? 'danger' : 'secondary'} onClick={() => { setSwapMode(!swapMode); setFirstSwapCombatant(null); }} Icon={ArrowUpDown}>{swapMode ? 'Cancel Swap' : 'Swap'}</Button>
                  </div>
                  <ul className="divide-y divide-blue-100">
                    {combatants.map((c) => (
                      <li key={c.id} className={`flex items-center justify-between py-2 px-1 ${swapMode ? 'cursor-pointer hover:bg-blue-100/60' : ''} ${firstSwapCombatant === c.id ? 'ring-2 ring-blue-500 rounded-md' : ''}`} onClick={() => handleCombatantSwap(c.id)}>
                        <div className="flex items-center gap-2">
                          {currentEncounter.status !== 'completed' && (<input type="checkbox" checked={selectedCombatantsForInitiative.includes(c.id)} onChange={(e) => { e.target.checked ? setSelectedCombatantsForInitiative((p) => [...p, c.id]) : setSelectedCombatantsForInitiative((p) => p.filter((id) => id !== c.id)); }} onClick={(e) => e.stopPropagation()}/>)}
                          <span className="w-8 text-center font-bold">{c.initiative_roll ?? '-'}</span>
                          <button className={`text-left text-sm ${selectedActorId && selectedActorId !== c.id ? 'opacity-60' : ''}`} onClick={(e)=>{ e.stopPropagation(); handleSelectActor(c.id); }}>
                            {c.display_name}
                          </button>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input type="number" className="w-14 px-2 py-1 border rounded-md text-xs" value={editingStats[c.id]?.initiative_roll ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], initiative_roll: e.target.value }}))} placeholder="Init"/>
                          <Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* CENTER: Active / Planning */}
            <section className="lg:col-span-5 space-y-4">
              {currentEncounter.status === 'planning' ? (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="text-lg font-semibold mb-3">Build the encounter</h4>
                  <div className="flex items-center justify-between"><h5 className="text-base font-medium flex items-center gap-2"><Users className="w-5 h-5" /> Add Combatants</h5>{addStep !== 'idle' && (<Button variant="ghost" size="sm" onClick={() => setAddStep('idle')} Icon={ArrowLeft}>Back</Button>)}</div>
                  {addStep === 'idle' && (<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2"><Button onClick={() => setAddStep('characters')} Icon={UserPlus} size="lg" variant="outline">Add Party Members</Button><Button onClick={() => setAddStep('monsters')} Icon={ShieldPlus} size="lg" variant="outline">Add Monsters</Button></div>)}
                  {addStep === 'characters' && (<div className="space-y-2 animate-fade-in mt-4"><label className="block text-sm font-medium text-gray-700">Add Party Member</label><select value={selectedPartyMember} onChange={(e) => setSelectedPartyMember(e.target.value)} className="w-full px-3 py-2 border rounded-md"><option value="">Select Party Member</option>{availableParty.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select><input type="number" placeholder="Initiative (Optional)" value={partyInitiativeInput} onChange={(e) => setPartyInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/><Button onClick={handleAddParty} Icon={UserPlus} isLoading={addCombatantMu.isPending} disabled={!selectedPartyMember}>Add Member</Button></div>)}
                  {addStep === 'monsters' && (<div className="space-y-2 animate-fade-in mt-4"><label className="block text-sm font-medium text-gray-700">Add Monster</label><select value={selectedMonster} onChange={(e) => setSelectedMonster(e.target.value)} className="w-full px-3 py-2 border rounded-md"><option value="">Select Monster</option>{allMonsters?.map((m) => (<option key={m.id} value={m.id}>{m.name} {m.category && `(${m.category})`}</option>))}</select>{selectedMonsterData && (<div className="text-xs text-gray-600 p-2 bg-white rounded border"><p><strong>HP:</strong> {selectedMonsterData.stats?.HP || 'N/A'}</p><p><strong>Ferocity:</strong> {selectedMonsterData.stats?.FEROCITY || 'N/A'}</p></div>)}<div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Custom Name (Optional)" value={customMonsterName} onChange={(e) => setCustomMonsterName(e.target.value)} className="px-3 py-2 border rounded-md"/><input type="number" placeholder="Count" value={monsterInstanceCount} onChange={(e) => setMonsterInstanceCount(Math.max(1, parseInt(e.target.value) || 1))} min="1" className="px-3 py-2 border rounded-md"/></div><input type="number" placeholder="Initiative (Optional)" value={monsterInitiativeInput} onChange={(e) => setMonsterInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/><Button onClick={handleAddMonster} Icon={ShieldPlus} isLoading={addCombatantMu.isPending} disabled={!selectedMonster}>Add Monster{monsterInstanceCount > 1 ? `s (${monsterInstanceCount})` : ''}</Button></div>)}
                </div>
              ) : currentEncounter.status === 'active' ? (
                <>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h4 className="text-lg font-semibold flex items-center gap-2"><LogIn className="w-5 h-5"/> Now Acting</h4>
                    <p className="text-sm text-gray-600 mt-1">{selectedActorId ? combatants.find(c=>c.id===selectedActorId)?.display_name : 'Select a combatant in the lists to start their turn.'}</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" Icon={Heart}>Apply Damage</Button>
                      <Button size="sm" Icon={Zap} variant="secondary">Spend WP</Button>
                      {selectedActorId && (
                        <Button size="sm" Icon={LogOut} variant="outline" onClick={()=>handleSelectActor(selectedActorId!)}>End Turn</Button>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h4 className="text-lg font-semibold">Combat Log</h4>
                    <p className="text-sm text-gray-500">Events are persisted to <code>encounters.log</code> (jsonb) via <code>appendEncounterLog</code>.</p>
                  </div>
                </>
              ) : (
                <div className="bg-white p-6 rounded-lg shadow"><p className="text-gray-600">This encounter is completed.</p></div>
              )}
            </section>

            {/* RIGHT: Turn order + Rosters */}
            <section className="lg:col-span-4 space-y-5">
              {/* Turn Order (low → high) */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h4 className="text-lg font-medium">Turn Order (Low → High)</h4>
                {orderLowToHigh.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-2">No combatants yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {orderLowToHigh.map((c)=> (
                      <li key={c.id}>
                        <button
                          className={`w-full flex items-center justify-between px-2 py-1 rounded hover:bg-gray-50 transition ${selectedActorId && selectedActorId !== c.id ? 'opacity-60' : ''} ${selectedActorId === c.id ? 'ring-2 ring-blue-500' : ''}`}
                          onClick={()=>handleSelectActor(c.id)}
                        >
                          <span className="text-sm">{c.display_name}</span>
                          <span className="text-xs font-semibold text-gray-600">{c.initiative_roll ?? '-'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Monsters */}
              <div className="space-y-3">
                <h4 className="text-lg font-medium flex items-center gap-2 text-red-700"><ShieldPlus className="w-5 h-5" /> Monsters</h4>
                {loadingCombatants ? (<LoadingSpinner />) : errorCombatants ? (<ErrorMessage message={errorCombatants.message} />) : combatants.filter((c) => c.monster_id).length === 0 ? (<p className="text-sm text-gray-500">No monsters yet.</p>) : (
                  combatants.filter((c) => c.monster_id).map((c) => {
                    const monsterData = c.monster_id ? monstersById.get(c.monster_id.trim()) : undefined;
                    const isOpen = !!showMonsterDetails[c.id];
                    const currentAttack = currentMonsterAttacks[c.id];
                    const selected = selectedActorId === c.id;
                    return (
                      <article key={c.id} className={`border-l-4 border-red-500 rounded-lg shadow p-4 ${selected ? 'bg-red-50' : 'bg-red-50/60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button className={`flex items-center gap-3 ${selected ? '' : 'opacity-90'}`} onClick={()=>handleSelectActor(c.id)}>
                              <span className="text-lg font-bold truncate">{c.display_name}</span>
                              <span className="text-xs text-red-800 bg-red-100 px-2 py-0.5 rounded">{monsterData?.name ?? 'Monster'}</span>
                            </button>
                            {monsterData?.category && (<p className="text-xs text-red-700 mt-1">{monsterData.category}</p>)}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-600" /><input type="number" value={editingStats[c.id]?.current_hp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_hp: e.target.value }}))} className="w-16 px-2 py-1 border rounded-md text-sm"/><span className="text-sm text-gray-600">/ {c.max_hp}</span></div>
                            <Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id} />
                            <Button size="sm" variant="danger" onClick={() => removeCombatantMu.mutate(c.id)} Icon={Trash2} isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id} />
                          </div>
                        </div>
                        {monsterData?.stats && (<dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-700 bg-white p-3 rounded border border-red-200">{Object.entries(monsterData.stats).map(([k, v]) => (<div key={k}><dt className="font-semibold uppercase">{k}</dt><dd>{String(v)}</dd></div>))}</dl>)}
                        <div className="mt-4">
                          <div className="flex items-center justify-between"><h5 className="font-semibold text-sm text-gray-700">Attacks</h5><Button size="sm" variant="ghost" onClick={() => toggleMonsterDetails(c.id)}>{isOpen ? 'Hide' : 'Show'}{isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}</Button></div>
                          {isOpen && (
                            <div className="mt-2 space-y-2">
                              <div className="flex items-center gap-2">
                                <Button size="sm" Icon={Dice6} onClick={() => monsterData && handleRollMonsterAttack(c.id, monsterData)} disabled={!monsterData?.attacks?.length}>Roll (D6)</Button>
                                <input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" placeholder="Init" value={editingStats[c.id]?.initiative_roll ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], initiative_roll: e.target.value }}))} />
                              </div>
                              {currentAttack && (<div className="p-3 bg-yellow-50 border border-yellow-300 rounded text-sm"><p className="font-bold text-yellow-900">{currentAttack.name}</p><p className="text-yellow-900 mt-1">{currentAttack.description}</p></div>)}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {/* Party */}
              <div className="space-y-3">
                <h4 className="text-lg font-medium flex items-center gap-2 text-blue-700"><Users className="w-5 h-5" /> Party</h4>
                {loadingCombatants ? (<LoadingSpinner />) : errorCombatants ? (<ErrorMessage message={errorCombatants.message} />) : combatants.filter((c) => !c.monster_id).length === 0 ? (<p className="text-sm text-gray-500">No party members yet.</p>) : (
                  combatants.filter((c) => !c.monster_id).map((c) => (
                    <div key={c.id} className={`p-3 rounded-lg border-l-4 border-blue-500 shadow ${selectedActorId === c.id ? 'bg-blue-50' : 'bg-blue-50/60'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <button className="flex items-center gap-3" onClick={()=>handleSelectActor(c.id)}>
                          <span className="w-8 text-center font-bold">{c.initiative_roll ?? '-'}</span>
                          <div className={`${selectedActorId && selectedActorId !== c.id ? 'opacity-60' : ''}`}>
                            <p className="font-semibold">{c.display_name}</p>
                            <p className="text-xs text-gray-600">Player Character</p>
                          </div>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-600" /><input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" value={editingStats[c.id]?.current_hp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_hp: e.target.value }}))}/><span className="text-sm text-gray-600">/ {c.max_hp}</span></div>
                          {c.max_wp != null && (<div className="flex items-center gap-1"><Zap className="w-4 h-4 text-yellow-600" /><input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" value={editingStats[c.id]?.current_wp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_wp: e.target.value }}))}/><span className="text-sm text-gray-600">/ {c.max_wp}</span></div>)}
                          <Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id} />
                          <Button size="sm" variant="danger" onClick={() => removeCombatantMu.mutate(c.id)} Icon={Trash2} isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* ============================= REINFORCEMENTS MODAL ============================= */}
          {isAddingMidFight && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
                <div className="flex items-center justify-between"><h4 className="text-lg font-medium flex items-center gap-2"><ShieldPlus className="w-5 h-5" /> Add Reinforcements</h4><Button variant="ghost" size="sm" onClick={() => setIsAddingMidFight(false)} Icon={XCircle}>Cancel</Button></div>
                <div className="space-y-2 pt-2 border-t">
                  <label className="block text-sm font-medium text-gray-700">Add Monster</label>
                  <select value={selectedMonster} onChange={(e) => setSelectedMonster(e.target.value)} className="w-full px-3 py-2 border rounded-md"><option value="">Select Monster</option>{allMonsters?.map((m) => (<option key={m.id} value={m.id}>{m.name} {m.category && `(${m.category})`}</option>))}</select>
                  {selectedMonsterData && (<div className="text-xs text-gray-600 p-2 bg-gray-50 rounded border"><p><strong>HP:</strong> {selectedMonsterData.stats?.HP || 'N/A'}</p><p><strong>Ferocity:</strong> {selectedMonsterData.stats?.FEROCITY || 'N/A'}</p></div>)}
                  <div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Custom Name (Optional)" value={customMonsterName} onChange={(e) => setCustomMonsterName(e.target.value)} className="px-3 py-2 border rounded-md"/><input type="number" placeholder="Count" value={monsterInstanceCount} onChange={(e) => setMonsterInstanceCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} className="px-3 py-2 border rounded-md"/></div>
                  <input type="number" placeholder="Initiative (Optional)" value={monsterInitiativeInput} onChange={(e) => setMonsterInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/>
                  <Button onClick={handleAddMonster} Icon={ShieldPlus} isLoading={addCombatantMu.isPending} disabled={!selectedMonster} className="w-full">Add Monster{monsterInstanceCount > 1 ? `s (${monsterInstanceCount})` : ''} to Fight</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PartyEncounterView;
