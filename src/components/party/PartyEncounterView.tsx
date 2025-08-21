import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLatestEncounterForParty,
  fetchEncounterDetails,
  fetchEncounterCombatants,
  createEncounter,
  addCombatantToEncounter,
  AddCombatantPayload,
  updateEncounter,
  updateCombatant,
  removeCombatant,
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
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import type { MonsterData } from '../../types/bestiary';
import { useCharacterSheetStore } from '../../stores/characterSheetStore'; // Import the store

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
  const { activeEncounter, fetchActiveEncounter, clearActiveEncounter } = useCharacterSheetStore(); // Use store for active encounter state

  const [newEncounterName, setNewEncounterName] = useState('');
  const [newEncounterDescription, setNewEncounterDescription] = useState('');

  const [selectedPartyMember, setSelectedPartyMember] = useState('');
  const [selectedMonster, setSelectedMonster] = useState('');
  const [customMonsterName, setCustomMonsterName] = useState('');
  const [initiativeInput, setInitiativeInput] = useState(''); // For adding combatants

  const [editingStats, setEditingStats] = useState<Record<string, EditableCombatantStats>>({});
  const [isEditingEncounter, setIsEditingEncounter] = useState(false);
  const [editedEncounterName, setEditedEncounterName] = useState('');
  const [editedEncounterDescription, setEditedEncounterDescription] = useState('');


  // Fetch latest encounter on mount and when partyId changes
  // We now use the store's state for the active encounter, but still need to fetch it initially
  // The store's fetchActiveEncounter handles setting the state
  useEffect(() => {
    if (partyId) {
      // We don't have the current character ID here, so we'll rely on the store's
      // fetchCharacter or other mechanisms to eventually call fetchActiveEncounter
      // with the character ID. For the DM view, we primarily need the encounter itself.
      // Let's add a dedicated fetch for the DM view that doesn't require characterId
      // or modify fetchActiveEncounter to handle DM view needs.
      // For now, let's refetch the latest encounter directly in the DM view.
       const fetchDMEncounter = async () => {
           queryClient.invalidateQueries({ queryKey: ['latestEncounter', partyId] });
           const latest = await fetchLatestEncounterForParty(partyId);
           if (latest) {
               queryClient.setQueryData(['encounterDetails', latest.id], latest);
           }
       };
       fetchDMEncounter();

    } else {
        // If partyId is null, clear any cached encounter data for this view
        queryClient.removeQueries({ queryKey: ['latestEncounter', partyId] });
        queryClient.removeQueries({ queryKey: ['encounterDetails'] });
        queryClient.removeQueries({ queryKey: ['encounterCombatants'] });
    }
  }, [partyId, queryClient]);


  const encounterId = activeEncounter?.id; // Get encounter ID from store

  // Fetch encounter details (if not already in store) - useQuery is good for caching
  const {
    data: encounterDetails,
    isLoading: loadingDetails,
    error: errorDetails,
  } = useQuery<Encounter | null, Error>({
    queryKey: ['encounterDetails', encounterId],
    queryFn: () => (encounterId ? fetchEncounterDetails(encounterId) : Promise.resolve(null)),
    enabled: !!encounterId, // Only fetch if encounterId exists
    initialData: activeEncounter, // Use store data as initial data if available
  });

  // Fetch combatants
  const {
    data: combatantsData,
    isLoading: loadingCombatants,
    error: errorCombatants,
  } = useQuery<EncounterCombatant[], Error>({
    queryKey: ['encounterCombatants', encounterId],
    queryFn: () => (encounterId ? fetchEncounterCombatants(encounterId) : Promise.resolve([])),
    enabled: !!encounterId,
  });

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

  // Fetch monsters
  const {
    data: allMonsters,
    isLoading: loadingMonsters,
    error: errorMonsters,
  } = useQuery<MonsterData[], Error>({
    queryKey: ['allMonsters'],
    queryFn: fetchAllMonsters,
  });

  // Real-time updates for combatants
  useEncounterRealtime(encounterId);

  // Initialize editing stats when combatants change
  useEffect(() => {
    if (!combatants) return;
    const init: Record<string, EditableCombatantStats> = {};
    combatants.forEach((c) => {
      init[c.id] = {
        current_hp: String(c.current_hp ?? c.max_hp ?? 0),
        current_wp: c.max_wp != null ? String(c.current_wp ?? c.max_wp) : undefined,
        initiative_roll: c.initiative_roll != null ? String(c.initiative_roll) : '',
      };
    });
    setEditingStats(init);
  }, [combatants]);

  // Initialize encounter editing state when encounter details load
  useEffect(() => {
      if (encounterDetails) {
          setEditedEncounterName(encounterDetails.name);
          setEditedEncounterDescription(encounterDetails.description || '');
      }
  }, [encounterDetails]);


  // Mutations
  const createEncounterMu = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createEncounter(partyId, payload.name, payload.description),
    onSuccess: (enc) => {
      queryClient.invalidateQueries({ queryKey: ['latestEncounter', partyId] });
      queryClient.setQueryData(['encounterDetails', enc.id], enc); // Optimistically update
      // Update store state
      // Note: This DM view doesn't have the character ID, so it can't update currentCombatant in store.
      // The player's view will handle that via its own fetchActiveEncounter call.
      // For the DM, we just need the activeEncounter state updated.
      // Let's add a simple setter to the store for the DM view.
      // For now, rely on the player's view or a separate mechanism to sync the store.
      // A better approach might be to have the store subscribe to the latest encounter for the party.
      // For this iteration, we'll rely on query invalidation and refetching.
      setNewEncounterName('');
      setNewEncounterDescription('');
    },
  });

  const addCombatantMu = useMutation({
    mutationFn: (payload: AddCombatantPayload) => {
      if (!encounterId) throw new Error('No active encounter');
      return addCombatantToEncounter(encounterId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] });
      // Clear add combatant form
      setSelectedPartyMember('');
      setSelectedMonster('');
      setCustomMonsterName('');
      setInitiativeInput('');
    },
  });

  const updateCombatantMu = useMutation({
    mutationFn: (data: { id: string; updates: Partial<EncounterCombatant> }) =>
      updateCombatant(data.id, data.updates),
    onSuccess: (updated) => {
      // Optimistically update the combatants list in the cache
      queryClient.setQueryData<EncounterCombatant[]>(['encounterCombatants', encounterId], (old) =>
        old?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      );
      // Update editing state to reflect saved values
      setEditingStats(prev => ({
          ...prev,
          [updated.id]: {
              current_hp: String(updated.current_hp ?? updated.max_hp ?? 0),
              current_wp: updated.max_wp != null ? String(updated.current_wp ?? updated.max_wp) : undefined,
              initiative_roll: updated.initiative_roll != null ? String(updated.initiative_roll) : '',
          }
      }));
    },
  });

  const removeCombatantMu = useMutation({
    mutationFn: removeCombatant,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] });
      // Remove from editing state
      setEditingStats(prev => {
          const newState = { ...prev };
          delete newState[id];
          return newState;
      });
    },
  });

  const updateEncounterMu = useMutation({
      mutationFn: (updates: Partial<Pick<Encounter, 'name' | 'description' | 'status' | 'current_round'>>) => {
          if (!encounterId) throw new Error('No active encounter to update');
          return updateEncounter(encounterId, updates);
      },
      onSuccess: (updatedEnc) => {
          queryClient.setQueryData(['encounterDetails', encounterId], updatedEnc);
          // Invalidate latest encounter query to ensure other views pick up status changes
          queryClient.invalidateQueries({ queryKey: ['latestEncounter', partyId] });
          setIsEditingEncounter(false);
          setEditedEncounterName(updatedEnc.name);
          setEditedEncounterDescription(updatedEnc.description || '');
      },
  });

  // Handlers
  const handleCreateEncounter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEncounterName.trim()) return;
    createEncounterMu.mutate({ name: newEncounterName.trim(), description: newEncounterDescription.trim() || undefined });
  };

  const handleAddParty = () => {
    if (!selectedPartyMember || !encounterId) return;
    addCombatantMu.mutate({ type: 'character', characterId: selectedPartyMember, initiativeRoll: initiativeInput ? parseInt(initiativeInput) : null });
  };

  const handleAddMonster = () => {
    if (!selectedMonster || !encounterId) return;
    addCombatantMu.mutate({ type: 'monster', monsterId: selectedMonster, customName: customMonsterName || undefined, initiativeRoll: initiativeInput ? parseInt(initiativeInput) : null });
  };

  const handleSaveStats = (id: string) => {
    const stats = editingStats[id];
    if (!stats) return;
    const updates: Partial<EncounterCombatant> = {
      current_hp: parseInt(stats.current_hp),
      initiative_roll: stats.initiative_roll ? parseInt(stats.initiative_roll) : null,
    };
    // Only include WP if it's applicable (max_wp is not null)
    const combatant = combatants.find(c => c.id === id);
    if (combatant?.max_wp != null) {
       if (stats.current_wp !== undefined && stats.current_wp !== null && stats.current_wp.trim() !== '') {
          updates.current_wp = parseInt(stats.current_wp);
       } else if (stats.current_wp === '') { // Allow clearing WP if applicable
          updates.current_wp = null;
       }
    }

    // Check if there are actual changes before mutating
    const currentCombatant = combatants.find(c => c.id === id);
    if (!currentCombatant) return;

    let hasChanges = false;
    if (updates.current_hp !== undefined && updates.current_hp !== currentCombatant.current_hp) hasChanges = true;
    if (updates.initiative_roll !== undefined && updates.initiative_roll !== currentCombatant.initiative_roll) hasChanges = true;
    if (updates.current_wp !== undefined && updates.current_wp !== currentCombatant.current_wp) hasChanges = true;

    if (hasChanges) {
        updateCombatantMu.mutate({ id, updates });
    } else {
        console.log("No changes to save for combatant", id);
    }
  };

  const handleStartEncounter = () => {
      if (!encounterId) return;
      updateEncounterMu.mutate({ status: 'active', current_round: 1 });
  };

  const handleEndEncounter = () => {
      if (!encounterId) return;
      updateEncounterMu.mutate({ status: 'completed' });
      // Optionally clear combatants or archive them
      // For now, we'll leave them associated with the completed encounter
  };

  const handleSaveEncounterDetails = () => {
      if (!encounterId) return;
      updateEncounterMu.mutate({ name: editedEncounterName, description: editedEncounterDescription });
  };


  // Derived data
  const availableParty = useMemo(() => {
    const ids = new Set(combatants.map((c) => c.character_id));
    return partyMembers.filter((m) => !ids.has(m.id));
  }, [partyMembers, combatants]);

  // Early returns
  if (!isDM) return <div className="p-4 text-center text-gray-600">Only the DM can view encounter details.</div>;
  if (loadingMonsters) return <LoadingSpinner />; // Monsters needed for the form
  if (errorMonsters) return <ErrorMessage message={errorMonsters!.message} />;

  // Determine view based on encounterDetails (fetched via useQuery)
  const currentEncounter = encounterDetails; // Use the data from the query

  // Render
  return (
    <div className="space-y-6">
      {!currentEncounter ? (
        // Create Encounter Form
        <form onSubmit={handleCreateEncounter} className="bg-gray-50 p-6 rounded-lg shadow space-y-4">
          <p className="text-gray-700">No encounter. Create one to begin.</p>
          <div>
            <input
              type="text"
              placeholder="Encounter Name"
              value={newEncounterName}
              onChange={(e) => setNewEncounterName(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <textarea
              placeholder="Description (optional)"
              value={newEncounterDescription}
              onChange={(e) => setNewEncounterDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <Button Icon={PlusCircle} type="submit" isLoading={createEncounterMu.isPending}>
            Create Encounter
          </Button>
        </form>
      ) : (
        // Active/Planned Encounter View
        <div className="space-y-6">
          {/* Encounter Header */}
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
              {isEditingEncounter ? (
                  <div className="space-y-2">
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
                          className="w-full px-3 py-2 border rounded-md text-gray-600"
                          placeholder="Description (optional)"
                      />
                      <div className="flex space-x-2">
                          <Button size="sm" onClick={handleSaveEncounterDetails} isLoading={updateEncounterMu.isPending} Icon={Save}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={() => setIsEditingEncounter(false)} Icon={XCircle}>Cancel</Button>
                      </div>
                  </div>
              ) : (
                  <div className="flex justify-between items-start">
                      <div>
                          <h3 className="text-xl font-semibold">{currentEncounter.name}</h3>
                          {currentEncounter.description && <p className="text-gray-600">{currentEncounter.description}</p>}
                          <p className="mt-2 text-sm">
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
                             {currentEncounter.current_round != null && currentEncounter.status === 'active' && ` | Round: ${currentEncounter.current_round}`}
                          </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} Icon={Edit3} aria-label="Edit Encounter Details" />
                  </div>
              )}

              {/* Encounter Actions (Start/End) */}
              <div className="flex space-x-4 mt-4">
                  {currentEncounter.status === 'planning' && (
                      <Button onClick={handleStartEncounter} isLoading={updateEncounterMu.isPending} Icon={Play}>
                          Start Encounter
                      </Button>
                  )}
                   {currentEncounter.status === 'active' && (
                      <Button onClick={handleEndEncounter} isLoading={updateEncounterMu.isPending} Icon={Square} variant="secondary">
                          End Encounter
                      </Button>
                  )}
                   {currentEncounter.status === 'completed' && (
                       <p className="text-gray-600 italic">Encounter completed.</p>
                   )}
              </div>
          </div>

          {/* Add Combatants */}
          {(currentEncounter.status === 'planning' || currentEncounter.status === 'active') && (
            <div className="bg-gray-50 p-6 rounded-lg shadow space-y-6">
              <h4 className="text-lg font-medium">Add Combatants</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Party Member */}
                <div className="space-y-2">
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
                    value={initiativeInput}
                    onChange={(e) => setInitiativeInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <Button onClick={handleAddParty} Icon={UserPlus} isLoading={addCombatantMu.isPending} disabled={!selectedPartyMember}>
                    Add Member
                  </Button>
                </div>

                {/* Monster */}
                <div className="space-y-2">
                  <select
                    value={selectedMonster}
                    onChange={(e) => setSelectedMonster(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Select Monster</option>
                    {allMonsters?.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Custom Name (Optional)"
                    value={customMonsterName}
                    onChange={(e) => setCustomMonsterName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <input
                    type="number"
                    placeholder="Initiative (Optional)"
                    value={initiativeInput}
                    onChange={(e) => setInitiativeInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <Button onClick={handleAddMonster} Icon={ShieldPlus} isLoading={addCombatantMu.isPending} disabled={!selectedMonster}>
                    Add Monster
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Combatant List */}
          <div>
            <h4 className="text-lg font-medium mb-4">Combatants</h4>
            {loadingCombatants ? (
              <LoadingSpinner />
            ) : errorCombatants ? (
              <ErrorMessage message={errorCombatants.message} />
            ) : combatants.length === 0 ? (
              <p className="text-gray-600">No combatants added yet.</p>
            ) : (
              <ul className="space-y-3">
                {combatants.map((c) => (
                  <li key={c.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-4 rounded-lg shadow">
                    <div className="flex-grow mb-2 sm:mb-0">
                      <p className="font-semibold">{c.display_name}</p>
                      <p className="text-sm text-gray-600">
                        <Heart size={14} className="inline mr-1 text-red-500" />
                        {editingStats[c.id]?.current_hp ?? c.current_hp} / {c.max_hp}
                        {c.max_wp != null && (
                          <>
                            <Zap size={14} className="inline ml-2 mr-1 text-blue-500" />
                             {editingStats[c.id]?.current_wp ?? c.current_wp} / {c.max_wp}
                          </>
                        )}
                      </p>
                      { (editingStats[c.id]?.initiative_roll || c.initiative_roll != null) &&
                        <p className="text-xs text-gray-500">
                          <ShieldCheck size={12} className="inline mr-1 text-green-500" />
                          Initiative: {editingStats[c.id]?.initiative_roll ?? c.initiative_roll}
                        </p>
                      }
                    </div>
                    <div className="flex flex-wrap gap-2 items-center justify-end sm:justify-start">
                      <input
                        type="number"
                        aria-label={`${c.display_name} Current HP`}
                        value={editingStats[c.id]?.current_hp ?? ''}
                        onChange={(e) => setEditingStats((prev) => ({ ...prev, [c.id]: { ...prev[c.id], current_hp: e.target.value } }))}
                        className="w-16 px-2 py-1 border rounded-md text-sm"
                        placeholder="HP"
                      />
                      {c.max_wp != null && (
                        <input
                          type="number"
                          aria-label={`${c.display_name} Current WP`}
                          value={editingStats[c.id]?.current_wp ?? ''}
                          onChange={(e) => setEditingStats((prev) => ({ ...prev, [c.id]: { ...prev[c.id], current_wp: e.target.value } }))}
                          className="w-16 px-2 py-1 border rounded-md text-sm"
                          placeholder="WP"
                        />
                      )}
                       <input
                        type="number"
                        aria-label={`${c.display_name} Initiative`}
                        value={editingStats[c.id]?.initiative_roll ?? ''}
                        onChange={(e) => setEditingStats((prev) => ({ ...prev, [c.id]: { ...prev[c.id], initiative_roll: e.target.value } }))}
                        className="w-16 px-2 py-1 border rounded-md text-sm"
                        placeholder="Init"
                      />
                      <Button size="sm" onClick={() => handleSaveStats(c.id)} Icon={Save} isLoading={updateCombatantMu.isPending && updateCombatantMu.variables?.id === c.id}>
                        Save
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => removeCombatantMu.mutate(c.id)} Icon={Trash2} isLoading={removeCombatantMu.isPending && removeCombatantMu.variables === c.id} />
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
