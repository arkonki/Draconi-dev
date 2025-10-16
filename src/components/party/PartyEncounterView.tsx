import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllEncountersForParty,
  fetchEncounterDetails,
  fetchEncounterCombatants,
  createEncounter,
  deleteEncounter,
  duplicateEncounter,
  addCharacterToEncounter,
  addMonsterToEncounter,
  updateEncounter,
  updateCombatant,
  removeCombatant,
  rollInitiativeForCombatants,
  swapInitiative,
  startEncounter,
  endEncounter,
  appendEncounterLog,
  nextRound,
} from '../../lib/api/encounters';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import {
  PlusCircle, UserPlus, ShieldPlus, Trash2, Play, Square, Save, Edit3, XCircle, Heart, Zap, Dice6, SkipForward, ArrowUpDown, Users, Copy, List, ChevronDown, ChevronUp, ArrowLeft, LogIn, LogOut, ChevronsRight, ClipboardList,
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';


// --- TYPE DEFINITIONS & HELPER COMPONENTS (Unchanged) ---
export interface MonsterStats { HP?: number; SIZE?: string; ARMOR?: number; FEROCITY?: number; MOVEMENT?: number; [key: string]: any; }
export interface MonsterAttack { name: string; effects: any[]; description: string; roll_values: string; }
export interface MonsterData { id: string; name: string; category?: string; stats?: MonsterStats; attacks?: MonsterAttack[]; effectsSummary?: string; }
interface PartyEncounterViewProps { partyId: string; partyMembers: Character[]; isDM: boolean; }
interface EditableCombatantStats { current_hp: string; current_wp?: string; initiative_roll?: string; }
interface AttackDescriptionRendererProps { description: string; attackName: string; }
const StatsTableView = ({ stats }: { stats: object }) => ( <table className="w-full text-sm mt-1"><tbody>{Object.entries(stats).map(([key, value]) => (<tr key={key} className="border-b border-gray-200 last:border-b-0"><td className="py-1 pr-2 font-semibold text-gray-600 capitalize">{key.replace(/_/g, ' ')}</td><td className="py-1 text-gray-800">{String(value)}</td></tr>))}</tbody></table> );
function AttackDescriptionRenderer({ description, attackName }: AttackDescriptionRendererProps) { const { toggleDiceRoller } = useDice(); const diceRegex = /(\d*d\d+\s*[+-]?\s*\d*)/gi; const parts = description.split(diceRegex); return (<p className="text-gray-800 mt-1">{parts.map((part, index) => { if (part.match(diceRegex) && part.match(/[dD]/)) { return (<button key={index} className="font-bold text-blue-600 hover:underline bg-blue-100 px-1 py-0.5 rounded-md mx-0.5" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${attackName} - Damage Roll`, })}>{part}</button>); } return <span key={index}>{part}</span>; })}</p>); }
function MarkdownDiceRenderer({ text, contextLabel }: { text: string; contextLabel: string; }) { const { toggleDiceRoller } = useDice(); if (!text) return null; const diceRegex = /(\d*d\d+\s*[+-]?\s*\d*)/gi; const parts = text.split(diceRegex); const applyMarkdown = (str: string) => { return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>'); }; return (<div className="whitespace-pre-wrap leading-relaxed">{parts.map((part, index) => { if (part.match(diceRegex) && part.match(/[dD]/)) { return (<button key={index} className="font-bold text-blue-600 hover:underline bg-blue-100 px-1 py-0.5 rounded-md mx-0.5" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${contextLabel} - Effects Roll`, })}>{part}</button>); } const html = applyMarkdown(part); return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />; })}</div>); }
function LogEntry({ entry }: { entry: any }) { const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); let content = null; switch (entry.type) { case 'round_advanced': content = <p className="font-bold text-blue-600 text-center py-1">--- Round {entry.round} ---</p>; break; case 'turn_start': content = <><LogOut className="w-4 h-4 inline mr-2 text-gray-500" />Turn started for <strong>{entry.name}</strong>.</>; break; case 'turn_end': content = <><LogIn className="w-4 h-4 inline mr-2 text-gray-500" />Turn ended for <strong>{entry.name}</strong>.</>; break; case 'hp_change': const isDamage = entry.delta < 0; content = (<span className={isDamage ? 'text-red-700' : 'text-green-700'}><Heart className="w-4 h-4 inline mr-2" /><strong>{entry.name}</strong> {isDamage ? `took ${Math.abs(entry.delta)} damage` : `healed ${entry.delta} HP`}. ({entry.from} → {entry.to})</span>); break; case 'monster_attack': content = (<span className="text-yellow-800"><Dice6 className="w-4 h-4 inline mr-2" /><strong>{entry.name}</strong> used <strong>{entry.attack?.name || 'an attack'}</strong> (Rolled {entry.roll}).</span>); break; default: content = <span>{JSON.stringify(entry)}</span>; } if (entry.type === 'round_advanced') { return <div className="w-full">{content}</div> } return (<div className="flex items-start gap-2 text-sm py-1.5"><time className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">{formatTime(entry.ts)}</time><div className="flex-grow">{content}</div></div>); }
function CombatLogView({ log }: { log: any[] }) { if (!log || log.length === 0) { return <p className="text-sm text-gray-500 mt-2 px-1">No events have been logged yet.</p>; } return (<div className="space-y-1 divide-y divide-gray-100">{log.slice().reverse().map((entry, index) => (<LogEntry key={index} entry={entry} />))}</div>); }


export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();
  const { toggleDiceRoller } = useDice();

  // --- STATE ---
  const [newEncounterName, setNewEncounterName] = useState('');
  const [newEncounterDescription, setNewEncounterDescription] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [showEncounterList, setShowEncounterList] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'create'>('details');
  const [addStep, setAddStep] = useState<'idle' | 'characters' | 'monsters'>('idle');
  const [isAddingMidFight, setIsAddingMidFight] = useState(false);
  const [selectedPartyMembersToAdd, setSelectedPartyMembersToAdd] = useState<string[]>([]);
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
  const [showMonsterDetails, setShowMonsterDetails] = useState<Record<string, boolean>>({});
  const [currentMonsterAttacks, setCurrentMonsterAttacks] = useState<Record<string, MonsterAttack | null>>({});
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [temporaryNotes, setTemporaryNotes] = useState('');
  // --- MODIFIED STATE ---
  // We no longer need swapMode or firstSwapCombatant
  // const [swapMode, setSwapMode] = useState(false);
  // const [firstSwapCombatant, setFirstSwapCombatant] = useState<string | null>(null);

  // --- QUERIES (Unchanged) ---
  const { data: allEncounters, isLoading: loadingAllEncounters, error: errorAllEncounters } = useQuery<Encounter[], Error>({ queryKey: ['allEncounters', partyId], queryFn: () => fetchAllEncountersForParty(partyId), enabled: !!partyId });
  const { data: allMonsters, isLoading: loadingMonsters, error: errorMonsters } = useQuery<MonsterData[], Error>({ queryKey: ['allMonsters'], queryFn: fetchAllMonsters });
  const currentEncounterId = useMemo(() => { if (selectedEncounterId) return selectedEncounterId; if (allEncounters && allEncounters.length > 0) return allEncounters[0].id; return null; }, [selectedEncounterId, allEncounters]);
  const { data: encounterDetails, isLoading: loadingDetails, error: errorDetails } = useQuery<Encounter | null, Error>({ queryKey: ['encounterDetails', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)), enabled: !!currentEncounterId });
  const { data: combatantsData, isLoading: loadingCombatants, error: errorCombatants } = useQuery<EncounterCombatant[], Error>({ queryKey: ['encounterCombatants', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])), enabled: !!currentEncounterId });

  useEncounterRealtime(currentEncounterId);

  // --- MUTATIONS ---
  const createEncounterMu = useMutation({ mutationFn: (payload: { name: string; description?: string }) => createEncounter(partyId, payload.name, payload.description), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setSelectedEncounterId(newEnc.id); setViewMode('details'); setNewEncounterName(''); setNewEncounterDescription(''); } });
  const deleteEncounterMu = useMutation({ mutationFn: deleteEncounter, onSuccess: (_, deletedId) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); if (selectedEncounterId === deletedId) setSelectedEncounterId(null); } });
  const duplicateEncounterMu = useMutation({ mutationFn: ({ encounterId, name }: { encounterId: string; name: string }) => duplicateEncounter(encounterId, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setSelectedEncounterId(newEnc.id); } });
  const addCharacterMu = useMutation({ mutationFn: (payload: { characterId: string; initiativeRoll: number | null }) => { if (!currentEncounterId) throw new Error('No active encounter'); return addCharacterToEncounter({ encounterId: currentEncounterId, characterId: payload.characterId, initiativeRoll: payload.initiativeRoll, }); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSelectedPartyMembersToAdd([]); setPartyInitiativeInput(''); } });
  const addMonsterMu = useMutation({ mutationFn: (payload: { monsterId: string; customName: string; initiativeRoll: number | null, encounterId: string }) => { if (!currentEncounterId) throw new Error('No active encounter'); return addMonsterToEncounter(payload); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSelectedMonster(''); setCustomMonsterName(''); setMonsterInstanceCount(1); setMonsterInitiativeInput(''); setIsAddingMidFight(false); } });
  const removeCombatantMu = useMutation({ mutationFn: removeCombatant, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); } });
  const updateEncounterMu = useMutation({ mutationFn: (updates: Partial<Pick<Encounter, 'name' | 'description'>>) => { if (!currentEncounterId) throw new Error('No active encounter to update'); return updateEncounter(currentEncounterId, updates); }, onSuccess: (updatedEnc) => { queryClient.setQueryData(['encounterDetails', currentEncounterId], updatedEnc); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] }); setIsEditingEncounter(false); } });
  const rollInitiativeMu = useMutation({ mutationFn: (combatantIds: string[]) => { if (!currentEncounterId) throw new Error('No active encounter'); return rollInitiativeForCombatants(currentEncounterId, combatantIds); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] }); setSelectedCombatantsForInitiative([]); } });
  const startEncounterMu = useMutation({ mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter to start'); return startEncounter(currentEncounterId); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId], refetchType: 'active' }); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId], refetchType: 'active' }); } });
  const endEncounterMu = useMutation({ mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter to end'); return endEncounter(currentEncounterId); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId], refetchType: 'active' }); queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId], refetchType: 'active' }); } });
  const appendLogMu = useMutation({ mutationFn: (entry: any) => { if (!currentEncounterId) throw new Error('No encounter to log'); return appendEncounterLog(currentEncounterId, entry); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] }); } });
  const nextRoundMu = useMutation({ mutationFn: () => { if (!currentEncounterId) throw new Error('No encounter for next round'); return nextRound(currentEncounterId); }, onSuccess: async () => { await appendLogMu.mutateAsync({ type: 'round_advanced', ts: Date.now(), round: (encounterDetails?.current_round ?? 0) + 1 }); queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', currentEncounterId], (old) => old?.map((c) => ({ ...c, initiative_roll: null })) ?? []); setSelectedCombatantsForInitiative([]); setSelectedActorId(null); queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] }); }, });

  // --- MODIFIED MUTATION #1: INITIATIVE SWAP ---
  const swapInitiativeMu = useMutation({
    mutationFn: ({ id1, id2 }: { id1: string; id2: string }) => swapInitiative(id1, id2),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] });
      // Reset the selection after a successful swap
      setSelectedCombatantsForInitiative([]);
    }
  });

  // --- MODIFIED MUTATION #2: UPDATE COMBATANT ---
  const updateCombatantMu = useMutation({
    mutationFn: (data: { id: string; updates: Partial<EncounterCombatant> }) => updateCombatant(data.id, data.updates),
    onSuccess: (updated) => {
      // Optimistically update the cache AND re-sort it immediately
      queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', currentEncounterId], (oldData) => {
        const newData = oldData?.map((c) => (c.id === updated.id ? updated : c)) ?? [];
        // Re-apply the same sort logic from the useMemo hook
        newData.sort((a, b) => {
          const ia = a.initiative_roll ?? 1000;
          const ib = b.initiative_roll ?? 1000;
          if (ia !== ib) return ia - ib;
          return (a.display_name ?? '').localeCompare(b.display_name ?? '');
        });
        return newData;
      });
    }
  });

  // --- DERIVED (Unchanged) ---
  const monstersById = useMemo(() => new Map((allMonsters ?? []).map((m) => [m.id, m] as const)), [allMonsters]);
  const combatants = useMemo(() => (combatantsData?.slice().sort((a, b) => { const ia = a.initiative_roll ?? 1000; const ib = b.initiative_roll ?? 1000; if (ia !== ib) return ia - ib; return (a.display_name ?? '').localeCompare(b.display_name ?? ''); }) || []), [combatantsData]);
  const activeCombatant = useMemo(() => combatants.find(c => c.id === selectedActorId), [combatants, selectedActorId]);
  const activeCombatantMonsterData = useMemo(() => { if (activeCombatant?.monster_id) { return monstersById.get(activeCombatant.monster_id); } return null; }, [activeCombatant, monstersById]);

  // --- useEffects (The fix from the previous step is included here) ---
  useEffect(() => { if (!loadingAllEncounters) setViewMode(!allEncounters || allEncounters.length === 0 ? 'create' : 'details'); }, [allEncounters, loadingAllEncounters]);
  useEffect(() => { if (!combatants) return; const init: Record<string, EditableCombatantStats> = {}; combatants.forEach((c) => { init[c.id] = { current_hp: String(c.current_hp ?? c.max_hp ?? 0), current_wp: c.max_wp != null ? String(c.current_wp ?? c.max_wp ?? '') : undefined, initiative_roll: c.initiative_roll != null ? String(c.initiative_roll) : '' }; }); setEditingStats(init); }, [combatants]);
  useEffect(() => { if (encounterDetails) { setEditedEncounterName(encounterDetails.name); setEditedEncounterDescription(encounterDetails.description || ''); } }, [encounterDetails]);
  useEffect(() => { if (encounterDetails?.status === 'active' && combatants.length > 0 && !selectedActorId) { const firstActor = combatants[0]; setSelectedActorId(firstActor.id); appendLogMu.mutate({ type: 'turn_start', ts: Date.now(), who: firstActor.id, name: firstActor.display_name }); } if (encounterDetails?.status !== 'active') { setSelectedActorId(null); } }, [combatants, encounterDetails?.status, encounterDetails?.current_round, appendLogMu]);

  // --- HANDLERS ---
  const handleCreateEncounter = (e: React.FormEvent) => { e.preventDefault(); if (!newEncounterName.trim()) return; createEncounterMu.mutate({ name: newEncounterName.trim(), description: newEncounterDescription.trim() || undefined }); };
  const handleDuplicateEncounter = (encounterId: string, name: string) => duplicateEncounterMu.mutate({ encounterId, name: `${name} (Copy)` });
  const handleSelectEncounter = (encounterId: string) => { setSelectedEncounterId(encounterId); setShowEncounterList(false); };
  const handleAddPartyMembers = () => { if (selectedPartyMembersToAdd.length === 0) return; selectedPartyMembersToAdd.forEach(characterId => { addCharacterMu.mutate({ characterId: characterId, initiativeRoll: partyInitiativeInput ? parseInt(partyInitiativeInput) : null, }); }); };
  const handleTogglePartyMember = (id: string) => { setSelectedPartyMembersToAdd(prev => prev.includes(id) ? prev.filter(memberId => memberId !== id) : [...prev, id]); };
  const handleAddMonster = () => { const monsterData = allMonsters?.find(m => m.id === selectedMonster); if (!monsterData || !currentEncounterId) return; const ferocity = monsterData.stats?.FEROCITY ?? 1; const baseName = customMonsterName.trim() || monsterData.name; for (let i = 1; i <= monsterInstanceCount; i++) { const instanceName = monsterInstanceCount > 1 ? `${baseName} ${i}` : baseName; for (let j = 1; j <= ferocity; j++) { const finalName = ferocity > 1 ? `${instanceName} (Action ${j})` : instanceName; addMonsterMu.mutate({ encounterId: currentEncounterId, monsterId: selectedMonster, customName: finalName, initiativeRoll: monsterInitiativeInput ? parseInt(monsterInitiativeInput) : null, }); } } };
  const handleSaveStats = (id: string) => { const stats = editingStats[id]; const c = combatants.find((x) => x.id === id); if (!stats || !c) return; const u: Partial<EncounterCombatant> = {}; const nH = parseInt(stats.current_hp, 10); if (!isNaN(nH) && nH !== c.current_hp) { u.current_hp = nH; const delta = nH - (c.current_hp ?? 0); appendLogMu.mutate({ type: 'hp_change', ts: Date.now(), who: id, name: c.display_name, delta, from: c.current_hp, to: nH }); } if (stats.initiative_roll != null) { const nI = stats.initiative_roll.trim() === '' ? null : parseInt(stats.initiative_roll, 10); if ((nI === null || !isNaN(nI)) && nI !== c.initiative_roll) u.initiative_roll = nI; } if (c.max_wp != null && stats.current_wp != null) { const nW = stats.current_wp.trim() === '' ? null : parseInt(stats.current_wp, 10); if ((nW === null || !isNaN(nW)) && nW !== c.current_wp) { u.current_wp = nW; const delta = (nW ?? 0) - (c.current_wp ?? 0); appendLogMu.mutate({ type: 'wp_change', ts: Date.now(), who: id, name: c.display_name, delta, from: c.current_wp, to: nW }); } } if (Object.keys(u).length > 0) updateCombatantMu.mutate({ id, updates: u }); };
  const handleRollInitiative = () => { if (selectedCombatantsForInitiative.length === 0) return; rollInitiativeMu.mutate(selectedCombatantsForInitiative); };
  const toggleMonsterDetails = (combatantId: string) => setShowMonsterDetails((prev) => ({ ...prev, [combatantId]: !prev[combatantId] }));
  const handleRollMonsterAttack = (combatantId: string, monster: MonsterData) => { if (!monster.attacks || monster.attacks.length === 0) return; const roll = Math.floor(Math.random() * 6) + 1; const attack = monster.attacks.find((att) => att.roll_values.split(',').includes(String(roll))); setCurrentMonsterAttacks((prev) => ({ ...prev, [combatantId]: attack || null })); appendLogMu.mutate({ type: 'monster_attack', ts: Date.now(), who: combatantId, name: monster.name, roll, attack: attack ? { name: attack.name, desc: attack.description } : null, }); };
  const handleSelectActor = (id: string) => { if (selectedActorId && selectedActorId !== id) { const currentCombatant = combatants.find(c => c.id === selectedActorId); if (currentCombatant) { appendLogMu.mutate({ type: 'turn_end', ts: Date.now(), who: selectedActorId, name: currentCombatant.display_name }); } } setSelectedActorId(id); const newCombatant = combatants.find(c => c.id === id); if (newCombatant) { appendLogMu.mutate({ type: 'turn_start', ts: Date.now(), who: id, name: newCombatant.display_name }); } };
  const handleAdvanceTurn = () => { if (!selectedActorId || !combatants || combatants.length === 0) return; const currentIndex = combatants.findIndex(c => c.id === selectedActorId); const nextIndex = currentIndex + 1; if (nextIndex < combatants.length) { handleSelectActor(combatants[nextIndex].id); } else { const lastActor = combatants[currentIndex]; if (lastActor) { appendLogMu.mutate({ type: 'turn_end', ts: Date.now(), who: selectedActorId, name: lastActor.display_name }); } setSelectedActorId(null); } };
  
  // --- MODIFIED HANDLER: INITIATIVE SWAP ---
  const handleInitiativeSwap = () => {
    // This action is only possible when exactly two combatants are selected.
    if (selectedCombatantsForInitiative.length !== 2) return;
    const [id1, id2] = selectedCombatantsForInitiative;
    swapInitiativeMu.mutate({ id1, id2 });
  };

  // --- RENDER HELPERS & EARLY RETURNS (Unchanged) ---
  const availableParty = useMemo(() => { const idsInEncounter = new Set(combatants.map((c) => c.character_id)); return partyMembers.filter((m) => !idsInEncounter.has(m.id)); }, [partyMembers, combatants]);
  const selectedMonsterData = useMemo(() => allMonsters?.find((m) => m.id === selectedMonster), [allMonsters, selectedMonster]);
  if (!isDM) return <div className="p-4 text-center text-gray-600"><p>Only the DM can view and manage encounter details.</p></div>;
  if (loadingAllEncounters || loadingMonsters) return <LoadingSpinner />;
  if (errorAllEncounters || errorMonsters) return <ErrorMessage message={errorAllEncounters?.message || errorMonsters?.message || 'Error loading data'} />;
  const currentEncounter = encounterDetails;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* HEADER: Unchanged */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 p-4 shadow-sm rounded-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Encounter</h2>{currentEncounter && (<div className="text-sm text-gray-700 mt-1 flex items-center gap-3"><span>Status: <span className={`font-semibold ${currentEncounter.status === 'active' ? 'text-green-600' : currentEncounter.status === 'planning' ? 'text-yellow-600' : 'text-blue-600'}`}>{currentEncounter.status}</span></span>{currentEncounter.status === 'active' && currentEncounter.current_round > 0 && (<span>Round: <span className="font-semibold">{currentEncounter.current_round}</span></span>)}</div>)}</div><div className="flex items-center gap-2"><Button onClick={() => setShowEncounterList(true)} Icon={List} variant="secondary">Encounters</Button><Button onClick={() => toggleDiceRoller?.()} Icon={Dice6} variant="outline">Dice</Button><Button onClick={() => setViewMode('create')} Icon={PlusCircle}>New</Button>{currentEncounter?.status === 'planning' && (<Button onClick={() => startEncounterMu.mutate()} Icon={Play}>Start</Button>)}{currentEncounter?.status === 'active' && (<><Button onClick={() => nextRoundMu.mutate()} Icon={SkipForward} isLoading={nextRoundMu.isPending}>Next Round</Button><Button onClick={() => setIsAddingMidFight(true)} Icon={ShieldPlus} variant="outline">Reinforcements</Button><Button onClick={() => endEncounterMu.mutate()} Icon={Square} variant="secondary">End</Button></>)}</div></div></div>

      {viewMode === 'create' ? (
        // CREATE ENCOUNTER VIEW: Unchanged
        <form onSubmit={handleCreateEncounter} className="bg-white p-6 rounded-lg shadow space-y-4"><h3 className="text-lg font-semibold">Create New Encounter</h3><input type="text" placeholder="Encounter Name" value={newEncounterName} onChange={(e) => setNewEncounterName(e.target.value)} required className="w-full px-3 py-2 border rounded-md" /><textarea placeholder="Description (optional)" value={newEncounterDescription} onChange={(e) => setNewEncounterDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md" /><div className="flex items-center gap-2"><Button type="submit" Icon={PlusCircle} isLoading={createEncounterMu.isPending}>Create Encounter</Button>{allEncounters && allEncounters.length > 0 && (<Button variant="secondary" onClick={() => setViewMode('details')}>Cancel</Button>)}</div></form>
      ) : loadingDetails || !currentEncounter ? (
        <LoadingSpinner />
      ) : errorDetails ? (
        <ErrorMessage message={errorDetails.message} />
      ) : (
        <div className="space-y-6">
          {/* ENCOUNTER DETAILS & LAYOUT: Unchanged */}
          <div className="bg-white p-6 rounded-lg shadow">{isEditingEncounter ? (<><input type="text" value={editedEncounterName} onChange={(e) => setEditedEncounterName(e.target.value)} className="w-full px-3 py-2 border rounded-md text-xl font-semibold" placeholder="Encounter Name"/><textarea value={editedEncounterDescription} onChange={(e) => setEditedEncounterDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-gray-600 mt-2" placeholder="Description"/><div className="flex gap-2 mt-3"><Button size="sm" onClick={() => updateEncounterMu.mutate({ name: editedEncounterName, description: editedEncounterDescription })} isLoading={updateEncounterMu.isPending} Icon={Save}>Save</Button><Button size="sm" variant="secondary" onClick={() => setIsEditingEncounter(false)} Icon={XCircle}>Cancel</Button></div></>) : (<div className="space-y-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xl font-semibold">{currentEncounter.name}</h3>{currentEncounter.description && <p className="text-gray-600">{currentEncounter.description}</p>}</div><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} Icon={Edit3} aria-label="Edit"/></div><div className="text-sm mt-2">Status: <span className={`font-medium ${currentEncounter.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>{currentEncounter.status}</span>{currentEncounter.current_round > 0 && currentEncounter.status === 'active' && (<span className="ml-3">Round: {currentEncounter.current_round}</span>)}</div></div>)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-3 space-y-4">
              {/* BUILDER / NOTES / LOG: Unchanged */}
              {currentEncounter.status === 'planning' ? (<div className="bg-white p-4 rounded-lg shadow lg:sticky lg:top-24 self-start"><h4 className="text-lg font-semibold mb-3">Build the encounter</h4><div className="flex items-center justify-between"><h5 className="text-base font-medium flex items-center gap-2"><Users className="w-5 h-5" /> Add Combatants</h5>{addStep !== 'idle' && (<Button variant="ghost" size="sm" onClick={() => setAddStep('idle')} Icon={ArrowLeft}>Back</Button>)}</div>{addStep === 'idle' && (<div className="grid grid-cols-1 gap-4 pt-2"><Button onClick={() => setAddStep('characters')} Icon={UserPlus} size="lg" variant="outline">Add Party Members</Button><Button onClick={() => setAddStep('monsters')} Icon={ShieldPlus} size="lg" variant="outline">Add Monsters</Button></div>)}{addStep === 'characters' && (<div className="space-y-3 animate-fade-in mt-4"><label className="block text-sm font-medium text-gray-700">Select Party Members</label><div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 bg-gray-50">{availableParty.length > 0 ? availableParty.map((m) => (<div key={m.id} className="flex items-center gap-2 p-1 rounded hover:bg-gray-100"><input type="checkbox" id={`member-${m.id}`} checked={selectedPartyMembersToAdd.includes(m.id)} onChange={() => handleTogglePartyMember(m.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/><label htmlFor={`member-${m.id}`} className="text-sm font-medium text-gray-800">{m.name}</label></div>)) : <p className="text-xs text-gray-500 p-2">All party members have been added.</p>}</div><div className="flex items-center gap-2"><input type="number" placeholder="Initiative (Optional)" value={partyInitiativeInput} onChange={(e) => setPartyInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/><Button type="button" variant="outline" Icon={Dice6} onClick={() => toggleDiceRoller?.({ dice: '1d20', label: 'Party Initiative', onRoll: (result) => setPartyInitiativeInput(String(result.total))})} /></div><Button onClick={handleAddPartyMembers} Icon={UserPlus} isLoading={addCharacterMu.isPending} disabled={selectedPartyMembersToAdd.length === 0}>Add Members ({selectedPartyMembersToAdd.length})</Button></div>)}{addStep === 'monsters' && (<div className="space-y-2 animate-fade-in mt-4"><label className="block text-sm font-medium text-gray-700">Add Monster</label><select value={selectedMonster} onChange={(e) => setSelectedMonster(e.target.value)} className="w-full px-3 py-2 border rounded-md"><option value="">Select Monster</option>{allMonsters?.map((m) => (<option key={m.id} value={m.id}>{m.name} {m.category && `(${m.category})`}</option>))}</select>{selectedMonsterData && (<div className="space-y-2 text-xs text-gray-600 p-2 bg-gray-50 rounded border max-h-60 overflow-y-auto">{selectedMonsterData.stats && (<><h6 className="font-bold text-gray-700">Stats:</h6><StatsTableView stats={selectedMonsterData.stats} /></>)}{selectedMonsterData.effectsSummary && (<div className="mt-2 pt-2 border-t"><h6 className="font-bold text-gray-700">Effects Summary:</h6><MarkdownDiceRenderer text={selectedMonsterData.effectsSummary} contextLabel={selectedMonsterData.name} /></div>)}</div>)}<div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Custom Name (Optional)" value={customMonsterName} onChange={(e) => setCustomMonsterName(e.target.value)} className="px-3 py-2 border rounded-md"/><input type="number" placeholder="Count" value={monsterInstanceCount} onChange={(e) => setMonsterInstanceCount(Math.max(1, parseInt(e.target.value) || 1))} min="1" className="px-3 py-2 border rounded-md"/></div><div className="flex items-center gap-2"><input type="number" placeholder="Initiative (Optional)" value={monsterInitiativeInput} onChange={(e) => setMonsterInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/><Button type="button" variant="outline" Icon={Dice6} onClick={() => toggleDiceRoller?.({ dice: '1d20', label: 'Monster Initiative', onRoll: (result) => setMonsterInitiativeInput(String(result.total))})} /></div><Button onClick={handleAddMonster} Icon={ShieldPlus} isLoading={addMonsterMu.isPending} disabled={!selectedMonster}>Add Monster{monsterInstanceCount > 1 ? `s (${monsterInstanceCount})` : ''}</Button></div>)}</div>) : ( <div className="lg:sticky lg:top-24 self-start space-y-4"><div className="bg-white p-4 rounded-lg shadow"><h4 className="text-lg font-semibold flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Temporary Notes</h4><textarea placeholder="Use this space for temporary notes, conditions, or reminders..." value={temporaryNotes} onChange={(e) => setTemporaryNotes(e.target.value)} rows={6} className="w-full px-3 py-2 border rounded-md mt-2 text-sm"/><p className="text-xs text-gray-500 mt-1">Note: These notes are not saved with the encounter.</p></div><div className="bg-white p-4 rounded-lg shadow"><h4 className="text-lg font-semibold mb-2">Combat Log</h4><div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar"><CombatLogView log={currentEncounter.log || []} /></div></div></div> )}
            </section>
            
            <section className="lg:col-span-5 space-y-4">
              {/* ACTING COMBATANT: Unchanged */}
              {currentEncounter.status === 'active' && (<div className="bg-blue-50 border-2 border-blue-400 p-4 rounded-lg shadow-md"><h4 className="text-lg font-semibold flex items-center gap-2"><LogIn className="w-5 h-5"/> Now Acting</h4>{activeCombatant ? (<div><div className="flex justify-between items-start"><p className="text-xl font-bold mt-1">{activeCombatant.display_name}</p><Button size="sm" Icon={ChevronsRight} onClick={handleAdvanceTurn}>Next Turn</Button></div><div className="mt-3 flex flex-wrap gap-2">{activeCombatant.monster_id && monstersById.get(activeCombatant.monster_id) && (<Button size="sm" Icon={Dice6} variant='danger_outline' onClick={() => handleRollMonsterAttack(activeCombatant.id, monstersById.get(activeCombatant.monster_id!)!)}>Roll Attack</Button>)}<Button size="sm" Icon={LogOut} variant="outline" onClick={() => setSelectedActorId(null)}>Clear Actor</Button></div><div className="mt-3 border-t pt-3 space-y-3"><div><h5 className="font-semibold text-sm text-gray-700 mb-2">Combatant Stats:</h5><div className="space-y-2"><div className="flex items-center gap-2 p-2 bg-white rounded-md border"><Heart className="w-5 h-5 text-red-600" /><input type="number" value={editingStats[activeCombatant.id]?.current_hp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [activeCombatant.id]: { ...p[activeCombatant.id], current_hp: e.target.value }}))} className="w-20 px-2 py-1 border rounded-md text-sm font-semibold"/><span className="text-sm text-gray-600">/ {activeCombatant.max_hp} HP</span><Button size="sm" onClick={() => handleSaveStats(activeCombatant.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === activeCombatant.id}>Save</Button></div>{activeCombatantMonsterData?.stats && (<div className="p-2 bg-gray-50 rounded-md border"><StatsTableView stats={Object.fromEntries(Object.entries(activeCombatantMonsterData.stats).filter(([key]) => key !== 'HP'))} /></div>)}</div></div>{activeCombatantMonsterData?.effectsSummary && (<div><h5 className="font-semibold text-sm text-gray-700 mb-1">Effects Summary:</h5><div className="text-sm p-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800"><MarkdownDiceRenderer text={activeCombatantMonsterData.effectsSummary} contextLabel={activeCombatant.display_name} /></div></div>)}</div>{activeCombatant.monster_id && currentMonsterAttacks[activeCombatant.id] && (<div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm"><p className="font-bold text-yellow-900">{currentMonsterAttacks[activeCombatant.id]!.name}</p><AttackDescriptionRenderer description={currentMonsterAttacks[activeCombatant.id]!.description} attackName={currentMonsterAttacks[activeCombatant.id]!.name} /></div>)}</div>) : (<p className="text-sm text-gray-600 mt-1">{ combatants.length > 0 ? "End of round. Ready for the next round." : "Add combatants to begin."}</p>)}</div>)}
              
              {/* --- MODIFIED TURN ORDER LIST --- */}
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="flex flex-wrap gap-4 items-center justify-between mb-3">
                  <h4 className="text-lg font-medium">Turn Order</h4>
                  {currentEncounter.status !== 'completed' && combatants.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="selectAll" checked={selectedCombatantsForInitiative.length === combatants.length && combatants.length > 0} onChange={(e) => setSelectedCombatantsForInitiative(e.target.checked ? combatants.map((c) => c.id) : [])}/>
                      <label htmlFor="selectAll" className="text-sm font-medium">All</label>
                    </div>
                    <Button size="sm" onClick={handleRollInitiative} Icon={Dice6} isLoading={rollInitiativeMu.isPending} disabled={selectedCombatantsForInitiative.length === 0}>Roll ({selectedCombatantsForInitiative.length})</Button>
                    <Button size="sm" variant='secondary' onClick={handleInitiativeSwap} Icon={ArrowUpDown} disabled={selectedCombatantsForInitiative.length !== 2}>Swap (2)</Button>
                  </div>
                  )}
                </div>
                {combatants.length === 0 ? <p className="text-sm text-gray-500 mt-2">No combatants in the encounter yet.</p> : (
                  <ul className="divide-y divide-gray-200">
                    {combatants.map((c) => (
                      <li key={c.id} className={`flex flex-wrap items-center justify-between py-2 px-2 -mx-2 rounded-md transition-all cursor-pointer hover:bg-blue-50 ${selectedActorId === c.id ? 'bg-blue-100' : ''}`} onClick={() => handleSelectActor(c.id)}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="ml-1"
                            checked={selectedCombatantsForInitiative.includes(c.id)}
                            onChange={(e) => {
                              e.target.checked
                                ? setSelectedCombatantsForInitiative((p) => [...p, c.id])
                                : setSelectedCombatantsForInitiative((p) => p.filter((id) => id !== c.id));
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="w-8 text-center text-lg font-bold text-gray-700">{c.initiative_roll ?? '-'}</span>
                          <span className="font-medium">{c.display_name}</span>
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" value={editingStats[c.id]?.initiative_roll ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], initiative_roll: e.target.value }}))} placeholder="Init"/>
                          <Button size="icon_sm" variant="ghost" onClick={() => toggleDiceRoller?.({ dice: '1d20', label: `Initiative for ${c.display_name}`, onRoll: (result) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], initiative_roll: String(result.total) }}))})}><Dice6 className="w-4 h-4" /></Button>
                          <Button size="icon_sm" onClick={() => handleSaveStats(c.id)}><Save className="w-4 h-4" /></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            
            <section className="lg:col-span-4 space-y-5">
              {/* MONSTER & PARTY LISTS: Unchanged */}
              <div className="space-y-3"><h4 className="text-lg font-medium flex items-center gap-2 text-red-700"><ShieldPlus className="w-5 h-5" /> Monsters</h4>{loadingCombatants ? (<LoadingSpinner />) : errorCombatants ? (<ErrorMessage message={errorCombatants.message} />) : combatants.filter((c) => c.monster_id).length === 0 ? (<p className="text-sm text-gray-500">No monsters yet.</p>) : (combatants.filter((c) => c.monster_id).map((c) => { const monsterData = c.monster_id ? monstersById.get(c.monster_id.trim()) : undefined; const isOpen = !!showMonsterDetails[c.id]; const currentAttack = currentMonsterAttacks[c.id]; return (<article key={c.id} className={`border-l-4 rounded-r-lg shadow p-3 transition-all ${selectedActorId === c.id ? 'border-red-600 bg-red-50' : 'border-red-400 bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold truncate">{c.display_name}</p><p className="text-xs text-red-800">{monsterData?.name ?? 'Monster'}</p></div><Button size="sm" variant="danger" onClick={() => removeCombatantMu.mutate(c.id)} Icon={Trash2} isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id} /></div><div className="mt-2 flex items-center gap-4"><div className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-600" /><input type="number" value={editingStats[c.id]?.current_hp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_hp: e.target.value }}))} className="w-16 px-2 py-1 border rounded-md text-sm"/><span className="text-sm text-gray-600">/ {c.max_hp}</span></div><Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id} /></div><div className="mt-3 border-t pt-2"><div className="flex items-center justify-between"><h5 className="font-semibold text-sm text-gray-700">Attacks</h5><Button size="sm" variant="ghost" onClick={() => toggleMonsterDetails(c.id)}>{isOpen ? 'Hide' : 'Show'}{isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}</Button></div>{isOpen && (<div className="mt-2 space-y-2"><Button size="sm" Icon={Dice6} onClick={() => monsterData && handleRollMonsterAttack(c.id, monsterData)} disabled={!monsterData?.attacks?.length}>Roll Attack</Button>{currentAttack && (<div className="p-3 bg-yellow-50 border border-yellow-300 rounded text-sm"><p className="font-bold text-yellow-900">{currentAttack.name}</p><AttackDescriptionRenderer description={currentAttack.description} attackName={currentAttack.name}/></div>)}</div>)}</div></article>); }))}</div>
              <div className="space-y-3"><h4 className="text-lg font-medium flex items-center gap-2 text-blue-700"><Users className="w-5 h-5" /> Party</h4>{loadingCombatants ? (<LoadingSpinner />) : errorCombatants ? (<ErrorMessage message={errorCombatants.message} />) : combatants.filter((c) => !c.monster_id).length === 0 ? (<p className="text-sm text-gray-500">No party members yet.</p>) : (combatants.filter((c) => !c.monster_id).map((c) => (<div key={c.id} className={`p-3 rounded-lg border-l-4 shadow transition-all ${selectedActorId === c.id ? 'border-blue-600 bg-blue-50' : 'border-blue-400 bg-white'}`}><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{c.display_name}</p><p className="text-xs text-gray-600">Player Character</p></div><Button size="sm" variant="danger" onClick={() => removeCombatantMu.mutate(c.id)} Icon={Trash2} isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id} /></div><div className="mt-2 flex flex-wrap items-center gap-4"><div className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-600" /><input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" value={editingStats[c.id]?.current_hp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_hp: e.target.value }}))}/><span className="text-sm text-gray-600">/ {c.max_hp}</span></div>{c.max_wp != null && (<div className="flex items-center gap-1"><Zap className="w-4 h-4 text-yellow-600" /><input type="number" className="w-16 px-2 py-1 border rounded-md text-sm" value={editingStats[c.id]?.current_wp ?? ''} onChange={(e) => setEditingStats((p) => ({ ...p, [c.id]: { ...p[c.id], current_wp: e.target.value }}))}/><span className="text-sm text-gray-600">/ {c.max_wp}</span></div>)}<Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id} /></div></div>)))}</div>
            </section>
          </div>

          {/* MODALS: Unchanged */}
          {isAddingMidFight && ( <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4"><div className="flex items-center justify-between"><h4 className="text-lg font-medium flex items-center gap-2"><ShieldPlus className="w-5 h-5" /> Add Reinforcements</h4><Button variant="ghost" size="sm" onClick={() => setIsAddingMidFight(false)} Icon={XCircle}>Cancel</Button></div><div className="space-y-2 pt-2 border-t"><label className="block text-sm font-medium text-gray-700">Add Monster</label><select value={selectedMonster} onChange={(e) => setSelectedMonster(e.target.value)} className="w-full px-3 py-2 border rounded-md"><option value="">Select Monster</option>{allMonsters?.map((m) => (<option key={m.id} value={m.id}>{m.name} {m.category && `(${m.category})`}</option>))}</select>{selectedMonsterData && (<div className="text-xs text-gray-600 p-2 bg-gray-50 rounded border"><p><strong>HP:</strong> {selectedMonsterData.stats?.HP || 'N/A'}</p><p><strong>Ferocity:</strong> {selectedMonsterData.stats?.FEROCITY || 'N/A'}</p></div>)}<div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Custom Name (Optional)" value={customMonsterName} onChange={(e) => setCustomMonsterName(e.target.value)} className="px-3 py-2 border rounded-md"/><input type="number" placeholder="Count" value={monsterInstanceCount} onChange={(e) => setMonsterInstanceCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} className="px-3 py-2 border rounded-md"/></div><div className="flex items-center gap-2"><input type="number" placeholder="Initiative (Optional)" value={monsterInitiativeInput} onChange={(e) => setMonsterInitiativeInput(e.target.value)} className="w-full px-3 py-2 border rounded-md"/><Button type="button" variant="outline" Icon={Dice6} onClick={() => toggleDiceRoller?.({ dice: '1d20', label: 'Reinforcement Initiative', onRoll: (result) => setMonsterInitiativeInput(String(result.total))})} /></div><Button onClick={handleAddMonster} Icon={ShieldPlus} isLoading={addMonsterMu.isPending} disabled={!selectedMonster} className="w-full">Add Monster{monsterInstanceCount > 1 ? `s (${monsterInstanceCount})` : ''} to Fight</Button></div></div></div>)}
          {showEncounterList && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl space-y-4 max-h-[80vh] flex flex-col"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">All Encounters</h3><Button variant="ghost" size="sm" onClick={() => setShowEncounterList(false)} Icon={XCircle}>Close</Button></div><div className="overflow-y-auto space-y-2 border-t pt-4">{(allEncounters ?? []).map(enc => (<div key={enc.id} className={`flex items-center justify-between p-3 rounded-md ${currentEncounterId === enc.id ? 'bg-blue-100' : 'bg-gray-50'}`}><div><p className="font-semibold">{enc.name}</p><p className="text-sm text-gray-600 capitalize">Status: {enc.status}</p></div><div className="flex items-center gap-2"><Button size="sm" onClick={() => handleSelectEncounter(enc.id)} disabled={currentEncounterId === enc.id}>Select</Button><Button size="sm" variant="outline" Icon={Copy} onClick={() => handleDuplicateEncounter(enc.id, enc.name)}>Duplicate</Button><Button size="sm" variant="danger" Icon={Trash2} onClick={() => deleteEncounterMu.mutate(enc.id)}>Delete</Button></div></div>))}</div></div></div>)}
        </div>
      )}
    </div>
  );
}

export default PartyEncounterView;
