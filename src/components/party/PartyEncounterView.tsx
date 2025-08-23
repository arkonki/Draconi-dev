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
} from 'lucide-react';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import type { MonsterData } from '../../types/bestiary';

interface PartyEncounterViewProps {
  partyId: string;
  partyMembers: Character[];
  isDM: boolean;
}

interface EditableCombatantStats {
  current_hp: string;
  current_wp?: string;
  initiative_roll?: string;
}

export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();

  // State for forms, UI toggles, and editing
  const [newEncounterName, setNewEncounterName] = useState('');
  const [newEncounterDescription, setNewEncounterDescription] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [showEncounterList, setShowEncounterList] = useState(false);

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

  // --- DATA FETCHING (QUERIES) ---

  const {
    data: allEncounters,
    isLoading: loadingAllEncounters,
    error: errorAllEncounters,
  } = useQuery<Encounter[], Error>({
    queryKey: ['allEncounters', partyId],
    queryFn: () => fetchAllEncountersForParty(partyId),
    enabled: !!partyId,
  });

  // Determine which encounter to show. Use selected ID, fallback to the first in the list.
  const currentEncounterId = useMemo(() => {
    if (selectedEncounterId) return selectedEncounterId;
    if (allEncounters && allEncounters.length > 0) {
      return allEncounters[0].id;
    }
    return null;
  }, [selectedEncounterId, allEncounters]);

  const {
    data: encounterDetails,
    isLoading: loadingDetails,
    error: errorDetails,
  } = useQuery<Encounter | null, Error>({
    queryKey: ['encounterDetails', currentEncounterId],
    queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)),
    enabled: !!currentEncounterId,
  });

  const {
    data: combatantsData,
    isLoading: loadingCombatants,
    error: errorCombatants,
  } = useQuery<EncounterCombatant[], Error>({
    queryKey: ['encounterCombatants', currentEncounterId],
    queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])),
    enabled: !!currentEncounterId,
  });

  const {
    data: allMonsters,
    isLoading: loadingMonsters,
    error: errorMonsters,
  } = useQuery<MonsterData[], Error>({
    queryKey: ['allMonsters'],
    queryFn: fetchAllMonsters,
  });

  // --- DERIVED STATE & EFFECTS ---

  useEncounterRealtime(currentEncounterId);

  const combatants = useMemo(() => {
    return (
      combatantsData?.slice().sort((a, b) => {
        const ia = a.initiative_roll ?? -Infinity;
        const ib = b.initiative_roll ?? -Infinity;
        if (ia !== ib) return ib - ia;
        return (a.display_name ?? '').localeCompare(b.display_name ?? '');
      }) || []
    );
  }, [combatantsData]);

  useEffect(() => {
    if (!combatants) return;
    const init: Record<string, EditableCombatantStats> = {};
    combatants.forEach((c) => {
      init[c.id] = {
        current_hp: String(c.current_hp ?? c.max_hp ?? 0),
        current_wp: c.max_wp != null ? String(c.current_wp ?? c.max_wp ?? '') : undefined,
        initiative_roll: c.initiative_roll != null ? String(c.initiative_roll) : '',
      };
    });
    setEditingStats(init);
  }, [combatants]);

  useEffect(() => {
    if (encounterDetails) {
      setEditedEncounterName(encounterDetails.name);
      setEditedEncounterDescription(encounterDetails.description || '');
    }
  }, [encounterDetails]);

  // --- DATA MUTATIONS ---

  const createEncounterMu = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createEncounter(partyId, payload.name, payload.description),
    onSuccess: (enc) => {
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
      setSelectedEncounterId(enc.id);
      setNewEncounterName('');
      setNewEncounterDescription('');
    },
  });

  const deleteEncounterMu = useMutation({
    mutationFn: deleteEncounter,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
      if (selectedEncounterId === deletedId) {
        setSelectedEncounterId(null); // Deselect if the current one is deleted
      }
    },
  });

  const duplicateEncounterMu = useMutation({
    mutationFn: ({ encounterId, name }: { encounterId: string; name: string }) =>
      duplicateEncounter(encounterId, name),
    onSuccess: (newEnc) => {
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
      setSelectedEncounterId(newEnc.id);
    },
  });

  const addCombatantMu = useMutation({
    mutationFn: (payload: AddCombatantPayload) => {
      if (!currentEncounterId) throw new Error('No active encounter');
      return addCombatantToEncounter(currentEncounterId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] });
      setSelectedPartyMember('');
      setSelectedMonster('');
      setCustomMonsterName('');
      setMonsterInstanceCount(1);
      setPartyInitiativeInput('');
      setMonsterInitiativeInput('');
    },
  });

  const updateCombatantMu = useMutation({
    mutationFn: (data: { id: string; updates: Partial<EncounterCombatant> }) =>
      updateCombatant(data.id, data.updates),
    onSuccess: (updated) => {
      queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', currentEncounterId], (old) =>
        old?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      );
    },
  });

  const removeCombatantMu = useMutation({
    mutationFn: removeCombatant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] });
    },
  });

  const updateEncounterMu = useMutation({
    mutationFn: (updates: Partial<Pick<Encounter, 'name' | 'description'>>) => {
      if (!currentEncounterId) throw new Error('No active encounter to update');
      return updateEncounter(currentEncounterId, updates);
    },
    onSuccess: (updatedEnc) => {
      queryClient.setQueryData(['encounterDetails', currentEncounterId], updatedEnc);
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
      setIsEditingEncounter(false);
    },
  });

  const rollInitiativeMu = useMutation({
    mutationFn: (combatantIds: string[]) => {
      if (!currentEncounterId) throw new Error('No active encounter');
      return rollInitiativeForCombatants(currentEncounterId, combatantIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] });
      setSelectedCombatantsForInitiative([]);
    },
  });

  const swapInitiativeMu = useMutation({
    mutationFn: ({ id1, id2 }: { id1: string; id2: string }) => swapInitiative(id1, id2),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', currentEncounterId] });
      setSwapMode(false);
      setFirstSwapCombatant(null);
    },
  });

  const startEncounterMu = useMutation({
    mutationFn: () => {
      if (!currentEncounterId) throw new Error('No encounter to start');
      return startEncounter(currentEncounterId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] });
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
    },
  });

  const endEncounterMu = useMutation({
    mutationFn: () => {
      if (!currentEncounterId) throw new Error('No encounter to end');
      return endEncounter(currentEncounterId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] });
      queryClient.invalidateQueries({ queryKey: ['allEncounters', partyId] });
    },
  });

  const nextRoundMu = useMutation({
    mutationFn: () => {
      if (!currentEncounterId) throw new Error('No encounter for next round');
      return nextRound(currentEncounterId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterDetails', currentEncounterId] });
    },
  });

  // --- EVENT HANDLERS ---

  const handleCreateEncounter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEncounterName.trim()) return;
    createEncounterMu.mutate({
      name: newEncounterName.trim(),
      description: newEncounterDescription.trim() || undefined,
    });
  };

  const handleDuplicateEncounter = (encounterId: string, name: string) => {
    const copyName = `${name} (Copy)`;
    duplicateEncounterMu.mutate({ encounterId, name: copyName });
  };

  const handleSelectEncounter = (encounterId: string) => {
    setSelectedEncounterId(encounterId);
    setShowEncounterList(false);
  };

  const handleAddParty = () => {
    if (!selectedPartyMember || !currentEncounterId) return;
    addCombatantMu.mutate({
      type: 'character',
      characterId: selectedPartyMember,
      initiativeRoll: partyInitiativeInput ? parseInt(partyInitiativeInput) : null,
    });
  };

  const handleAddMonster = () => {
    if (!selectedMonster || !currentEncounterId) return;
    addCombatantMu.mutate({
      type: 'monster',
      monsterId: selectedMonster,
      customName: customMonsterName.trim() || undefined,
      instanceCount: monsterInstanceCount,
      initiativeRoll: monsterInitiativeInput ? parseInt(monsterInitiativeInput) : null,
    });
  };

  const handleSaveStats = (id: string) => {
    const stats = editingStats[id];
    const currentCombatant = combatants.find((c) => c.id === id);
    if (!stats || !currentCombatant) return;

    const updates: Partial<EncounterCombatant> = {};

    const newHp = parseInt(stats.current_hp, 10);
    if (!isNaN(newHp) && newHp !== currentCombatant.current_hp) {
      updates.current_hp = newHp;
    }

    if (stats.initiative_roll != null) {
      const newInit = stats.initiative_roll.trim() === '' ? null : parseInt(stats.initiative_roll, 10);
      if ((newInit === null || !isNaN(newInit)) && newInit !== currentCombatant.initiative_roll) {
        updates.initiative_roll = newInit;
      }
    }

    if (currentCombatant.max_wp != null && stats.current_wp != null) {
      const newWp = stats.current_wp.trim() === '' ? null : parseInt(stats.current_wp, 10);
      if ((newWp === null || !isNaN(newWp)) && newWp !== currentCombatant.current_wp) {
        updates.current_wp = newWp;
      }
    }

    if (Object.keys(updates).length > 0) {
      updateCombatantMu.mutate({ id, updates });
    }
  };

  const handleRollInitiative = () => {
    if (selectedCombatantsForInitiative.length === 0) return;
    rollInitiativeMu.mutate(selectedCombatantsForInitiative);
  };

  const handleCombatantSwap = (combatantId: string) => {
    if (!swapMode) return;
    if (!firstSwapCombatant) {
      setFirstSwapCombatant(combatantId);
    } else if (firstSwapCombatant !== combatantId) {
      swapInitiativeMu.mutate({ id1: firstSwapCombatant, id2: combatantId });
    }
  };

  // --- DERIVED DATA for RENDERING ---

  const availableParty = useMemo(() => {
    const idsInEncounter = new Set(combatants.map((c) => c.character_id));
    return partyMembers.filter((m) => !idsInEncounter.has(m.id));
  }, [partyMembers, combatants]);

  const selectedMonsterData = useMemo(() => {
    return allMonsters?.find((m) => m.id === selectedMonster);
  }, [allMonsters, selectedMonster]);

  // --- RENDER LOGIC ---

  if (!isDM) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Only the DM can view and manage encounter details.</p>
      </div>
    );
  }

  if (loadingAllEncounters || loadingMonsters) return <LoadingSpinner />;

  if (errorAllEncounters || errorMonsters) {
    return <ErrorMessage message={errorAllEncounters?.message || errorMonsters?.message || 'Error loading data'} />;
  }

  const currentEncounter = encounterDetails;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Encounter Management Header */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Encounter Management</h2>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowEncounterList(!showEncounterList)} Icon={List} variant="secondary">
              {showEncounterList ? 'Hide' : 'Show'} Encounters ({allEncounters?.length || 0})
            </Button>
            <Button
              onClick={() => {
                setSelectedEncounterId(null);
                setNewEncounterName('');
                setNewEncounterDescription('');
              }}
              Icon={PlusCircle}
            >
              New Encounter
            </Button>
          </div>
        </div>
      </div>

      {/* Encounter List */}
      {showEncounterList && (
        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          <h3 className="text-xl font-semibold mb-3">All Encounters</h3>
          {allEncounters && allEncounters.length > 0 ? (
            allEncounters.map((enc) => (
              <div
                key={enc.id}
                className={`flex flex-col md:flex-row items-start md:items-center justify-between p-3 rounded-lg border ${
                  currentEncounterId === enc.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex-grow mb-3 md:mb-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{enc.name}</h4>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        enc.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : enc.status === 'planning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {enc.status}
                    </span>
                  </div>
                  {enc.description && <p className="text-sm text-gray-600 mt-1">{enc.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleSelectEncounter(enc.id)}
                    disabled={currentEncounterId === enc.id}
                  >
                    {currentEncounterId === enc.id ? 'Current' : 'Select'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDuplicateEncounter(enc.id, enc.name)}
                    Icon={Copy}
                    isLoading={duplicateEncounterMu.isPending && duplicateEncounterMu.variables?.encounterId === enc.id}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteEncounterMu.mutate(enc.id)}
                    Icon={Trash2}
                    isLoading={deleteEncounterMu.isPending && deleteEncounterMu.variables === enc.id}
                    disabled={enc.status === 'active'}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600 text-center py-4">No encounters created yet.</p>
          )}
        </div>
      )}

      {/* Main Content: Create Form OR Encounter View */}
      {!currentEncounterId && !createEncounterMu.isPending ? (
        <form onSubmit={handleCreateEncounter} className="bg-white p-6 rounded-lg shadow space-y-4">
          <h3 className="text-lg font-semibold">Create New Encounter</h3>
          <input
            type="text"
            placeholder="Encounter Name (e.g., 'Goblin Ambush')"
            value={newEncounterName}
            onChange={(e) => setNewEncounterName(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md"
          />
          <textarea
            placeholder="Description (optional)"
            value={newEncounterDescription}
            onChange={(e) => setNewEncounterDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-md"
          />
          <Button type="submit" Icon={PlusCircle} isLoading={createEncounterMu.isPending}>
            Create Encounter
          </Button>
        </form>
      ) : loadingDetails || !currentEncounter ? (
        <LoadingSpinner />
      ) : errorDetails ? (
        <ErrorMessage message={errorDetails.message} />
      ) : (
        <div className="space-y-6">
          {/* Encounter Header */}
          <div className="bg-white p-6 rounded-lg shadow">
            {isEditingEncounter ? (
              <>
                <input
                  type="text"
                  value={editedEncounterName}
                  onChange={(e) => setEditedEncounterName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xl font-semibold"
                  placeholder="Encounter Name"
                />
                <textarea
                  value={editedEncounterDescription}
                  onChange={(e) => setEditedEncounterDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md text-gray-600 mt-2"
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateEncounterMu.mutate({ name: editedEncounterName, description: editedEncounterDescription })
                    }
                    isLoading={updateEncounterMu.isPending}
                    Icon={Save}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setIsEditingEncounter(false)} Icon={XCircle}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-semibold">{currentEncounter.name}</h3>
                    {currentEncounter.description && <p className="text-gray-600">{currentEncounter.description}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingEncounter(true)}
                    Icon={Edit3}
                    aria-label="Edit Encounter Details"
                  />
                </div>
                <div className="text-sm mt-2">
                  Status:{' '}
                  <span
                    className={`font-medium ${
                      currentEncounter.status === 'active'
                        ? 'text-green-600'
                        : currentEncounter.status === 'planning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}
                  >
                    {currentEncounter.status}
                  </span>
                  {currentEncounter.current_round > 0 && currentEncounter.status === 'active' && (
                    <span className="ml-3">Round: {currentEncounter.current_round}</span>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {currentEncounter.status === 'planning' && (
                <Button onClick={() => startEncounterMu.mutate()} isLoading={startEncounterMu.isPending} Icon={Play}>
                  Start Encounter
                </Button>
              )}
              {currentEncounter.status === 'active' && (
                <>
                  <Button onClick={() => nextRoundMu.mutate()} isLoading={nextRoundMu.isPending} Icon={SkipForward}>
                    Next Round
                  </Button>
                  <Button
                    onClick={() => endEncounterMu.mutate()}
                    isLoading={endEncounterMu.isPending}
                    Icon={Square}
                    variant="secondary"
                  >
                    End Encounter
                  </Button>
                </>
              )}
              {currentEncounter.status === 'completed' && (
                <div className="flex items-center gap-2">
                  <p className="text-gray-600 italic">Encounter completed.</p>
                  <Button
                    size="sm"
                    onClick={() => handleDuplicateEncounter(currentEncounter.id, currentEncounter.name)}
                    Icon={Copy}
                    isLoading={duplicateEncounterMu.isPending}
                  >
                    Duplicate
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Add Combatants */}
          {currentEncounter.status !== 'completed' && (
            <div className="bg-gray-50 p-6 rounded-lg shadow space-y-6">
              <h4 className="text-lg font-medium flex items-center gap-2">
                <Users className="w-5 h-5" /> Add Combatants
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Add Party Member</label>
                  <select
                    value={selectedPartyMember}
                    onChange={(e) => setSelectedPartyMember(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Select Party Member</option>
                    {availableParty.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Initiative (Optional)"
                    value={partyInitiativeInput}
                    onChange={(e) => setPartyInitiativeInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <Button
                    onClick={handleAddParty}
                    Icon={UserPlus}
                    isLoading={addCombatantMu.isPending}
                    disabled={!selectedPartyMember}
                  >
                    Add Member
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Add Monster</label>
                  <select
                    value={selectedMonster}
                    onChange={(e) => setSelectedMonster(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Select Monster</option>
                    {allMonsters?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.category && `(${m.category})`}
                      </option>
                    ))}
                  </select>
                  {selectedMonsterData && (
                    <div className="text-xs text-gray-600 p-2 bg-white rounded border">
                      <p><strong>HP:</strong> {selectedMonsterData.stats?.HP || 'N/A'}</p>
                      <p><strong>Ferocity:</strong> {selectedMonsterData.stats?.ferocity || 1}</p>
                      {selectedMonsterData.effectsSummary && (
                        <p><strong>Effects:</strong> {selectedMonsterData.effectsSummary}</p>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Custom Name (Optional)"
                      value={customMonsterName}
                      onChange={(e) => setCustomMonsterName(e.target.value)}
                      className="px-3 py-2 border rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Count"
                      value={monsterInstanceCount}
                      onChange={(e) => setMonsterInstanceCount(Math.max(1, parseInt(e.target.value) || 1))}
                      min="1"
                      className="px-3 py-2 border rounded-md"
                    />
                  </div>
                  <input
                    type="number"
                    placeholder="Initiative (Optional)"
                    value={monsterInitiativeInput}
                    onChange={(e) => setMonsterInitiativeInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <Button
                    onClick={handleAddMonster}
                    Icon={ShieldPlus}
                    isLoading={addCombatantMu.isPending}
                    disabled={!selectedMonster}
                  >
                    Add Monster{monsterInstanceCount > 1 ? `s (${monsterInstanceCount})` : ''}
                  </Button>
                </div>
              </div>
              {addCombatantMu.error && (
                <p className="text-red-600 text-sm mt-4 text-center">Error: {addCombatantMu.error.message}</p>
              )}
            </div>
          )}

          {/* Initiative Management */}
          {currentEncounter.status !== 'completed' && combatants.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg shadow space-y-4">
              <h4 className="text-lg font-medium flex items-center gap-2">
                <Dice6 className="w-5 h-5" /> Initiative Management
              </h4>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="selectAll"
                    checked={selectedCombatantsForInitiative.length === combatants.length && combatants.length > 0}
                    onChange={(e) =>
                      setSelectedCombatantsForInitiative(e.target.checked ? combatants.map((c) => c.id) : [])
                    }
                  />
                  <label htmlFor="selectAll" className="text-sm font-medium">
                    Select All
                  </label>
                </div>
                <Button
                  size="sm"
                  onClick={handleRollInitiative}
                  Icon={Dice6}
                  isLoading={rollInitiativeMu.isPending}
                  disabled={selectedCombatantsForInitiative.length === 0}
                >
                  Roll Initiative ({selectedCombatantsForInitiative.length})
                </Button>
                <Button
                  size="sm"
                  variant={swapMode ? 'danger' : 'secondary'}
                  onClick={() => {
                    setSwapMode(!swapMode);
                    setFirstSwapCombatant(null);
                  }}
                  Icon={ArrowUpDown}
                >
                  {swapMode ? 'Cancel Swap' : 'Swap Initiative'}
                </Button>
              </div>
              {swapMode && (
                <p className="text-sm text-blue-700">
                  {firstSwapCombatant
                    ? 'Click another combatant to swap initiative values.'
                    : 'Click a combatant to start swapping initiative.'}
                </p>
              )}
            </div>
          )}

          {/* Combatant List */}
          <div>
            <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" /> Combatants {combatants.length > 0 && `(${combatants.length})`}
            </h4>
            {loadingCombatants ? (
              <LoadingSpinner />
            ) : errorCombatants ? (
              <ErrorMessage message={errorCombatants.message} />
            ) : combatants.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No combatants added yet. Add them above to begin.</p>
            ) : (
              <ul className="space-y-3">
                {combatants.map((c) => (
                  <li
                    key={c.id}
                    className={`p-4 rounded-lg shadow border-l-4 transition-all ${
                      c.is_player_character ? 'bg-blue-50 border-blue-500' : 'bg-red-50 border-red-500'
                    } ${swapMode ? 'cursor-pointer hover:bg-opacity-80' : ''} ${
                      firstSwapCombatant === c.id ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    onClick={() => handleCombatantSwap(c.id)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-3 flex-grow">
                        {currentEncounter.status !== 'completed' && (
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded"
                            aria-label={`Select ${c.display_name} for initiative roll`}
                            checked={selectedCombatantsForInitiative.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCombatantsForInitiative((prev) => [...prev, c.id]);
                              } else {
                                setSelectedCombatantsForInitiative((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="text-center font-bold text-lg w-8">{c.initiative_roll ?? '-'}</div>
                        <div>
                          <p className="font-semibold">{c.display_name}</p>
                          <p className="text-xs text-gray-500">
                            {c.is_player_character ? 'Player Character' : 'Monster'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Heart className="w-4 h-4 text-red-500" title="Health Points" />
                          <input
                            type="number"
                            aria-label={`${c.display_name} Current HP`}
                            value={editingStats[c.id]?.current_hp ?? ''}
                            onChange={(e) =>
                              setEditingStats((prev) => ({
                                ...prev,
                                [c.id]: { ...prev[c.id], current_hp: e.target.value },
                              }))
                            }
                            className="w-16 px-2 py-1 border rounded-md text-sm"
                            placeholder="HP"
                          />
                          <span className="text-sm text-gray-600">/ {c.max_hp}</span>
                        </div>
                        {c.max_wp != null && (
                          <div className="flex items-center gap-1">
                            <Zap className="w-4 h-4 text-yellow-500" title="Willpower" />
                            <input
                              type="number"
                              aria-label={`${c.display_name} Current WP`}
                              value={editingStats[c.id]?.current_wp ?? ''}
                              onChange={(e) =>
                                setEditingStats((prev) => ({
                                  ...prev,
                                  [c.id]: { ...prev[c.id], current_wp: e.target.value },
                                }))
                              }
                              className="w-16 px-2 py-1 border rounded-md text-sm"
                              placeholder="WP"
                            />
                            <span className="text-sm text-gray-600">/ {c.max_wp}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Dice6 className="w-4 h-4 text-gray-500" title="Initiative" />
                          <input
                            type="number"
                            aria-label={`${c.display_name} Initiative`}
                            value={editingStats[c.id]?.initiative_roll ?? ''}
                            onChange={(e) =>
                              setEditingStats((prev) => ({
                                ...prev,
                                [c.id]: { ...prev[c.id], initiative_roll: e.target.value },
                              }))
                            }
                            className="w-16 px-2 py-1 border rounded-md text-sm"
                            placeholder="Init"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveStats(c.id)}
                            Icon={Save}
                            isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id}
                            aria-label={`Save stats for ${c.display_name}`}
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => removeCombatantMu.mutate(c.id)}
                            Icon={Trash2}
                            isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id}
                            aria-label={`Remove ${c.display_name}`}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PartyEncounterView;
