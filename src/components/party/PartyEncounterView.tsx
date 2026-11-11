import { useState, useMemo, useEffect, useRef } from 'react';
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
  swapInitiative,
  startEncounter,
  applyEncounterDamage,
  finishEncounter,
  updateCharacterCombatState,
  appendEncounterLog,
  nextRound,
} from '../../lib/api/encounters';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { CustomMonsterModal } from './CustomMonsterModal';
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import { CharacterSheetDialog } from '../character/CharacterSheetDialog';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import {
  PlusCircle,
  UserPlus,
  Trash2,
  Play,
  Square,
  Edit3,
  XCircle,
  SkipForward,
  ArrowUpDown,
  Copy,
  List,
  ShieldAlert,
  Dices,
  Swords,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import { QUERY_STALE_TIME, queryKeys } from '../../lib/queryKeys';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import { FEAR_STATUS_EFFECT, hasEncounterStatusEffect, POISONED_STATUS_EFFECT, toggleEncounterStatusEffect } from '../../lib/encounterStatusEffects';
import { rollMonsterAttackTable } from '../../lib/monsterAttackTable';
import { resolveMonsterFerocity } from '../../lib/monsterFerocity';
import { completeCurrentInitiativeSlot, nextInitiativeActions, pendingInitiativeSlotsFor } from '../../lib/initiativeSlots';
import { TrustedRollFeed } from './TrustedRollFeed';
import { AttackResolutionModal, type AttackResolution } from './AttackResolutionModal';
import { CombatSummaryDialog } from './CombatSummaryDialog';
import { CONDITIONS, type ConditionKey } from '../../lib/conditions';
import { fetchItems } from '../../lib/api/items';
import { playerArmorRating } from '../../lib/combatDamage';
import { buildCombatSummary, type SummaryLogEntry } from '../../lib/combatSummary';

import { useAuth } from '../../contexts/useAuth';
import {
  getEncounterViewStateStorageKey,
  getSiblings,
  matchesMonsterAttackRoll,
  getDefaultMonsterAttack,
  getEffectiveMonsterWp,
  getEquippedArmorValue,
  createMonsterGearAttackDescription,
} from './partyEncounterShared';
import type {
  MonsterAttack,
  MonsterData,
  MonsterGearItem,
  PartyEncounterViewProps,
  EditableCombatantStats,
  MonsterAttackResolutionContext,
  CombatLogEntry,
  InitiativeUpdate,
  PersistedEncounterViewState,
} from './partyEncounterShared';
import {
  CombatLogView,
  FearReferenceModal,
  WaitTurnModal,
  InitiativeDrawModal,
  AddCombatantsModal,
  RollTablesModal,
  ActiveCombatantSpotlight,
  DragonbaneCombatantCard,
} from './PartyEncounterParts';

export type { MonsterAttack, MonsterData, MonsterGearItem, MonsterStats } from './partyEncounterShared';


// ...

export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    character: viewedSheetCharacter,
    isLoading: isCharacterSheetLoading,
    error: characterSheetError,
    fetchCharacter: fetchCharacterSheetData,
    setCharacter: setViewedSheetCharacter,
  } = useCharacterSheetStore();
  // const { toggleDiceRoller } = useDice();
  const previousViewedCharacterRef = useRef<Character | null>(null);
  const activeSheetRequestIdRef = useRef(0);
  const shouldRestoreCharacterContextRef = useRef(false);
  const hasHydratedPersistedStateRef = useRef(false);

  // Determine current user's character ID from the party members list
  const myCharacterId = useMemo(() => {
    if (!user || !partyMembers) return null;
    return partyMembers.find((m) => m.user_id === user.id)?.id;
  }, [user, partyMembers]);

  const handleSetInitiativeSingle = (id: string, val: number) => {
    updateCombatantMu.mutate({ id, updates: { initiative_roll: val } });
  };

  // STATE
  const [newEncounterName, setNewEncounterName] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'create'>('details');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const [isWaitModalOpen, setIsWaitModalOpen] = useState(false); // NEW: Wait Modal State
  const [isFearModalOpen, setIsFearModalOpen] = useState(false);
  const [isRollTablesModalOpen, setIsRollTablesModalOpen] = useState(false);
  const [isCharacterSheetModalOpen, setIsCharacterSheetModalOpen] = useState(false);
  const [showEncounterList, setShowEncounterList] = useState(false);
  const [isEditingEncounter, setIsEditingEncounter] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editingStats, setEditingStats] = useState<Record<string, EditableCombatantStats>>({});
  const [currentMonsterAttacks, setCurrentMonsterAttacks] = useState<Record<string, MonsterAttack | null>>({});
  const [currentMonsterAttackContexts, setCurrentMonsterAttackContexts] = useState<Record<string, MonsterAttackResolutionContext | null>>({});
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [sheetCombatant, setSheetCombatant] = useState<EncounterCombatant | null>(null);
  const [temporaryNotes, setTemporaryNotes] = useState('');
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ id: number; text: string, type?: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const syncActiveEncounterContext = (isActive: boolean) => {
      const payload = { partyId, active: isActive };

      if (isActive) {
        sessionStorage.setItem('active_encounter_context', JSON.stringify(payload));
      } else {
        const current = sessionStorage.getItem('active_encounter_context');
        if (current) {
          try {
            const parsed = JSON.parse(current) as { partyId?: string; active?: boolean };
            if (parsed.partyId === partyId) {
              sessionStorage.removeItem('active_encounter_context');
            }
          } catch {
            sessionStorage.removeItem('active_encounter_context');
          }
        }
      }

      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then((registration) => {
          registration.active?.postMessage({
            type: 'ACTIVE_ENCOUNTER_CONTEXT',
            ...payload,
          });
        });
      }
    };

    const updateContext = () => {
      syncActiveEncounterContext(document.visibilityState === 'visible');
    };

    updateContext();
    document.addEventListener('visibilitychange', updateContext);

    return () => {
      document.removeEventListener('visibilitychange', updateContext);
      syncActiveEncounterContext(false);
    };
  }, [partyId]);

  const { data: allEncounters, isLoading: loadingEnc } = useQuery<Encounter[]>({
    queryKey: queryKeys.encounters(partyId),
    queryFn: () => fetchAllEncountersForParty(partyId),
    enabled: !!partyId,
  });
  const { data: allMonsters } = useQuery<MonsterData[]>({
    queryKey: queryKeys.campaignMonsters(partyId),
    queryFn: async () => {
      const monsters = await fetchAllMonsters(partyId);
      return monsters as MonsterData[];
    },
    staleTime: QUERY_STALE_TIME.reference,
  });

  const currentEncounterId = useMemo(() => selectedEncounterId || allEncounters?.[0]?.id || null, [selectedEncounterId, allEncounters]);
  const { data: encounterDetails } = useQuery<Encounter | null>({
    queryKey: queryKeys.encounter(currentEncounterId),
    queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)),
    enabled: !!currentEncounterId,
    staleTime: QUERY_STALE_TIME.live,
  });
  const { data: combatantsData } = useQuery<EncounterCombatant[]>({
    queryKey: queryKeys.encounterCombatants(currentEncounterId),
    queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])),
    enabled: !!currentEncounterId,
    staleTime: QUERY_STALE_TIME.live,
  });

  useEncounterRealtime(currentEncounterId, partyId);

  const monstersById = useMemo(() => {
    const map = new Map<string, MonsterData>();
    if (allMonsters) {
      allMonsters.forEach((m) => {
        if (m.id) map.set(m.id, m);
      });
    }
    return map;
  }, [allMonsters]);
  const combatants = useMemo(() => (combatantsData?.slice().sort((a, b) => { const ia = a.initiative_roll ?? 1000; const ib = b.initiative_roll ?? 1000; if (ia !== ib) return ia - ib; return (a.display_name ?? '').localeCompare(b.display_name ?? ''); }) || []), [combatantsData]);
  const activeCombatant = useMemo(() => combatants.find(c => c.id === selectedActorId), [combatants, selectedActorId]);
  const activeInitiativeSlot = useMemo(() => activeCombatant ? pendingInitiativeSlotsFor(activeCombatant)[0] : null, [activeCombatant]);
  const activeCombatantMonsterData = useMemo(() => activeCombatant?.monster_id ? monstersById.get(activeCombatant.monster_id) : null, [activeCombatant, monstersById]);
  const availableParty = useMemo(() => partyMembers.filter(m => !combatants.some(c => c.character_id === m.id)), [partyMembers, combatants]);
  const requestedSheetCharacterId = sheetCombatant?.character_id || null;
  const isRequestedCharacterLoaded = !!requestedSheetCharacterId && viewedSheetCharacter?.id === requestedSheetCharacterId;

  const restorePreviousCharacterContext = () => {
    const previousCharacter = previousViewedCharacterRef.current;
    previousViewedCharacterRef.current = null;
    shouldRestoreCharacterContextRef.current = false;
    setViewedSheetCharacter(previousCharacter ?? null);
  };

  const loadCharacterSheetForModal = (characterId: string, userId: string) => {
    shouldRestoreCharacterContextRef.current = false;
    const requestId = ++activeSheetRequestIdRef.current;

    void fetchCharacterSheetData(characterId, userId).finally(() => {
      if (activeSheetRequestIdRef.current !== requestId) return;
      if (shouldRestoreCharacterContextRef.current) {
        restorePreviousCharacterContext();
      }
    });
  };

  const handleOpenCharacterSheet = (combatant: EncounterCombatant) => {
    if (!combatant.character_id) return;
    if (!user?.id) {
      setFeedbackToast({ id: Date.now(), text: 'Cannot open sheet: user not authenticated.', type: 'error' });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    if (!isCharacterSheetModalOpen) {
      previousViewedCharacterRef.current = useCharacterSheetStore.getState().character;
    }

    setSheetCombatant(combatant);
    setIsCharacterSheetModalOpen(true);
    loadCharacterSheetForModal(combatant.character_id, user.id);
  };

  const handleRetryCharacterSheetLoad = () => {
    if (!requestedSheetCharacterId || !user?.id) return;
    loadCharacterSheetForModal(requestedSheetCharacterId, user.id);
  };

  const handleCloseCharacterSheetModal = () => {
    setIsCharacterSheetModalOpen(false);
    setSheetCombatant(null);

    shouldRestoreCharacterContextRef.current = true;
    if (!isCharacterSheetLoading) {
      restorePreviousCharacterContext();
    }
  };

  useEffect(() => {
    hasHydratedPersistedStateRef.current = false;
    if (!partyId || typeof window === 'undefined') {
      hasHydratedPersistedStateRef.current = true;
      return;
    }

    try {
      const stored = window.localStorage.getItem(getEncounterViewStateStorageKey(partyId));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedEncounterViewState>;
        if (typeof parsed.selectedEncounterId === 'string' || parsed.selectedEncounterId === null) setSelectedEncounterId(parsed.selectedEncounterId ?? null);
        if (parsed.viewMode === 'details' || parsed.viewMode === 'create') setViewMode(parsed.viewMode);
        if (typeof parsed.selectedActorId === 'string' || parsed.selectedActorId === null) setSelectedActorId(parsed.selectedActorId ?? null);
        if (typeof parsed.temporaryNotes === 'string') setTemporaryNotes(parsed.temporaryNotes);
        if (typeof parsed.editedName === 'string') setEditedName(parsed.editedName);
        if (typeof parsed.isEditingEncounter === 'boolean') setIsEditingEncounter(parsed.isEditingEncounter);
        if (typeof parsed.swapSourceId === 'string' || parsed.swapSourceId === null) setSwapSourceId(parsed.swapSourceId ?? null);
      }
    } catch (error) {
      console.warn('Failed to restore encounter view state:', error);
    } finally {
      hasHydratedPersistedStateRef.current = true;
    }
  }, [partyId]);

  useEffect(() => {
    if (!hasHydratedPersistedStateRef.current || !partyId || typeof window === 'undefined') return;

    const stateToPersist: PersistedEncounterViewState = {
      selectedEncounterId,
      viewMode,
      selectedActorId,
      temporaryNotes,
      editedName,
      isEditingEncounter,
      swapSourceId,
    };

    try {
      window.localStorage.setItem(getEncounterViewStateStorageKey(partyId), JSON.stringify(stateToPersist));
    } catch (error) {
      console.warn('Failed to persist encounter view state:', error);
    }
  }, [partyId, selectedEncounterId, viewMode, selectedActorId, temporaryNotes, editedName, isEditingEncounter, swapSourceId]);

  useEffect(() => {
    if (loadingEnc) return;
    if (!allEncounters || allEncounters.length === 0) {
      if (selectedEncounterId) setSelectedEncounterId(null);
      return;
    }
    if (selectedEncounterId && !allEncounters.some((enc) => enc.id === selectedEncounterId)) {
      setSelectedEncounterId(null);
    }
  }, [allEncounters, loadingEnc, selectedEncounterId]);

  useEffect(() => {
    if (selectedActorId && !combatants.some((combatant) => combatant.id === selectedActorId)) {
      setSelectedActorId(null);
    }
    if (swapSourceId && !combatants.some((combatant) => combatant.id === swapSourceId)) {
      setSwapSourceId(null);
    }
  }, [combatants, selectedActorId, swapSourceId]);

  useEffect(() => {
    return () => {
      if (previousViewedCharacterRef.current) {
        setViewedSheetCharacter(previousViewedCharacterRef.current);
        previousViewedCharacterRef.current = null;
      }
    };
  }, [setViewedSheetCharacter]);

  useEffect(() => { if (!loadingEnc && (!allEncounters || allEncounters.length === 0)) setViewMode('create'); }, [allEncounters, loadingEnc]);
  useEffect(() => { if (encounterDetails && !isEditingEncounter) setEditedName(encounterDetails.name); }, [encounterDetails, isEditingEncounter]);

  useEffect(() => {
    if (!combatants) return;
    const init: Record<string, EditableCombatantStats> = {};
    combatants.forEach(c => {
      const monsterWp = c.monster_id ? (monstersById.get(c.monster_id || '')?.stats?.WP || 0) : 0;
      const maxWp = c.monster_id ? monsterWp : (c.max_wp || c.character?.max_wp || 0);
      init[c.id] = {
        current_hp: String(c.current_hp ?? 0),
        current_wp: maxWp > 0 ? String(c.current_wp ?? c.character?.current_wp ?? maxWp) : String(c.current_wp ?? ''),
        initiative_roll: String(c.initiative_roll || '')
      };
    });
    setEditingStats(init);
  }, [combatants, monstersById]);

  // FIX: ROBUST AUTO-SELECTION
  useEffect(() => {
    if (encounterDetails?.status !== 'active') return;

    // 1. Find the correct "Next Up" actor (Lowest init, not acted, alive)
    const nextUp = nextInitiativeActions(combatants)[0]?.combatant;

    if (nextUp) {
      // 2. Determine current selection state
      if (selectedActorId !== nextUp.id) {
        setSelectedActorId(nextUp.id);
      }
    } else {
      // End of round (everyone acted)
      setSelectedActorId(null);
    }
  }, [combatants, encounterDetails?.status, selectedActorId]);

  const invalidateEncounterList = () => queryClient.invalidateQueries({ queryKey: queryKeys.encounters(partyId), exact: true });
  const invalidateEncounter = () => queryClient.invalidateQueries({ queryKey: queryKeys.encounter(currentEncounterId), exact: true });
  const invalidateCombatants = () => queryClient.invalidateQueries({ queryKey: queryKeys.encounterCombatants(currentEncounterId), exact: true });
  const createEncounterMu = useMutation({ mutationFn: (name: string) => createEncounter(partyId, name), onSuccess: (newEnc) => { void invalidateEncounterList(); setSelectedEncounterId(newEnc.id); setViewMode('details'); } });
  const deleteEncounterMu = useMutation({ mutationFn: deleteEncounter, onSuccess: invalidateEncounterList });
  const duplicateEncounterMu = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => duplicateEncounter(id, name), onSuccess: (newEnc) => { void invalidateEncounterList(); setSelectedEncounterId(newEnc.id); } });
  const updateEncounterMu = useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Partial<Encounter> }) => updateEncounter(id, updates), onSuccess: () => { void Promise.all([invalidateEncounter(), invalidateEncounterList()]); setIsEditingEncounter(false); } });
  const addCharacterMu = useMutation({ mutationFn: addCharacterToEncounter, onSuccess: invalidateCombatants });
  const addMonsterMu = useMutation({ mutationFn: addMonsterToEncounter, onSuccess: invalidateCombatants });
  const [customMonsterKind, setCustomMonsterKind] = useState<'monster' | 'npc' | null>(null);
  const removeCombatantMu = useMutation({ mutationFn: removeCombatant, onSuccess: invalidateCombatants });
  const updateCombatantMu = useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Partial<EncounterCombatant> }) => updateCombatant(id, updates), onSuccess: invalidateCombatants });

  // FIX: Explicitly handle object destructuring for mutation
  const swapInitiativeMu = useMutation({
    mutationFn: (vars: { id1: string, id2: string }) => swapInitiative(vars),
    onSuccess: () => {
      void invalidateCombatants();
      setSwapSourceId(null);
      setFeedbackToast({ id: Date.now(), text: 'Initiative Swapped!', type: 'success' });
      setTimeout(() => setFeedbackToast(null), 3000);
    },
    onError: () => {
      setFeedbackToast({ id: Date.now(), text: 'Failed to swap.', type: 'error' });
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  });

  const appendLogMu = useMutation({ mutationFn: (entry: CombatLogEntry) => appendEncounterLog(currentEncounterId!, entry), onSuccess: invalidateEncounter });
  const startEncounterMu = useMutation({ mutationFn: () => startEncounter(currentEncounterId!), onSuccess: () => { void Promise.all([invalidateEncounter(), invalidateEncounterList()]); setIsInitModalOpen(true); } });
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const finishEncounterMu = useMutation({
    mutationFn: (clearConditions: boolean) => finishEncounter(currentEncounterId!, clearConditions),
    onSuccess: async () => { setIsSummaryOpen(false); await Promise.all([invalidateEncounter(), invalidateEncounterList(), invalidateCombatants()]); },
    onError: (error: Error) => { setFeedbackToast({ id: Date.now(), text: error.message, type: 'error' }); setTimeout(() => setFeedbackToast(null), 3500); },
  });
  const nextRoundMu = useMutation({ mutationFn: () => nextRound(currentEncounterId!), onSuccess: () => { setSelectedActorId(null); setIsInitModalOpen(true); void Promise.all([invalidateEncounter(), invalidateCombatants()]); }, onError: (error: Error) => { setFeedbackToast({ id: Date.now(), text: error.message, type: 'error' }); setTimeout(() => setFeedbackToast(null), 3500); } });

  // `monster` is passed for one that was just made, before the monster list has caught up with it.
  const handleAddMonster = (id: string, count: number, customName: string, monster?: MonsterData) => {
    const m = monster ?? (id ? monstersById.get(id) : null);
    const encounterPlayerCount = combatantsData?.filter((combatant) => combatant.is_player_character).length || 0;
    const ferocity = resolveMonsterFerocity(
      m?.stats?.FEROCITY,
      encounterPlayerCount > 0 ? encounterPlayerCount : partyMembers.length
    );
    const nameToUse = customName || m?.name || 'Monster';
    for (let i = 1; i <= count; i++) {
      const base = count > 1 ? `${nameToUse} ${i}` : nameToUse;
      for (let f = 1; f <= ferocity; f++) {
        addMonsterMu.mutate({ encounterId: currentEncounterId!, monsterId: id, customName: ferocity > 1 ? `${base} (Act ${f})` : base, initiativeRoll: null });
      }
    }
    setFeedbackToast({ id: Date.now(), text: `Added ${count}x ${nameToUse}` });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleSaveStats = (id: string) => {
    const stats = editingStats[id];
    const c = combatants.find(x => x.id === id);
    if (!stats || !c) return;
    const nh = parseInt(stats.current_hp); const nw = parseInt(stats.current_wp);
    const updates: Partial<EncounterCombatant> = {};
    let siblings = [c];
    if (c.monster_id && combatantsData) siblings = getSiblings(c, combatantsData);
    if (!isNaN(nh) && nh !== c.current_hp) { updates.current_hp = nh; appendLogMu.mutate({ type: 'hp_change', ts: Date.now(), who: id, name: c.display_name, delta: nh - (c.current_hp || 0) }); }
    if (!isNaN(nw) && nw !== c.current_wp) { updates.current_wp = nw; appendLogMu.mutate({ type: 'wp_change', ts: Date.now(), who: id, name: c.display_name, delta: nw - (c.current_wp || 0) }); }
    if (Object.keys(updates).length > 0) siblings.forEach(sib => updateCombatantMu.mutate({ id: sib.id, updates }));
  };

  const handleToggleStatusEffect = (
    combatant: EncounterCombatant,
    effectName: string,
    activeMessage: string,
    inactiveMessage: string
  ) => {
    const nextStatusEffects = toggleEncounterStatusEffect(combatant.status_effects, effectName);
    const hadEffect = hasEncounterStatusEffect(combatant.status_effects, effectName);
    let siblings = [combatant];

    if (combatant.monster_id && combatantsData) {
      siblings = getSiblings(combatant, combatantsData);
    }

    siblings.forEach((sibling) => {
      updateCombatantMu.mutate({
        id: sibling.id,
        updates: { status_effects: nextStatusEffects },
      });
    });

    appendLogMu.mutate({
      type: 'generic',
      ts: Date.now(),
      message: `${combatant.display_name} ${hadEffect ? inactiveMessage : activeMessage}.`,
    });
  };

  const handleTogglePoison = (combatant: EncounterCombatant) => {
    handleToggleStatusEffect(
      combatant,
      POISONED_STATUS_EFFECT,
      'is now poisoned',
      'is no longer poisoned'
    );
  };

  const handleToggleFear = (combatant: EncounterCombatant) => {
    handleToggleStatusEffect(
      combatant,
      FEAR_STATUS_EFFECT,
      'is now affected by fear',
      'is no longer affected by fear'
    );
  };

  const handleUseMonsterHeroicAbility = (
    combatant: EncounterCombatant,
    ability: { ability_id: string; name: string; description?: string; willpower_cost?: number | null }
  ) => {
    const cost = ability.willpower_cost ?? 0;
    const currentWp = getEffectiveMonsterWp(
      combatant.current_wp,
      combatant.monster_id ? monstersById.get(combatant.monster_id)?.stats?.WP : null,
      Number.parseInt(editingStats[combatant.id]?.current_wp ?? '', 10)
    );

    if (cost > 0 && currentWp < cost) {
      setFeedbackToast({ id: Date.now(), text: `Not enough WP for ${ability.name}.`, type: 'error' });
      setTimeout(() => setFeedbackToast(null), 2500);
      return;
    }

    const updatedWp = Math.max(0, currentWp - cost);
    let siblings = [combatant];
    if (combatant.monster_id && combatantsData) {
      siblings = getSiblings(combatant, combatantsData);
    }

    siblings.forEach((sibling) => {
      updateCombatantMu.mutate({
        id: sibling.id,
        updates: { current_wp: updatedWp },
      });
    });

    setEditingStats((previous) => ({
      ...previous,
      [combatant.id]: {
        ...(previous[combatant.id] || { current_hp: String(combatant.current_hp ?? 0), current_wp: String(currentWp) }),
        current_wp: String(updatedWp),
      },
    }));

    if (cost > 0) {
      appendLogMu.mutate({
        type: 'wp_change',
        ts: Date.now(),
        who: combatant.id,
        name: combatant.display_name,
        delta: -cost,
      });
    }

    appendLogMu.mutate({
      type: 'generic',
      ts: Date.now(),
      message: `${combatant.display_name} used ${ability.name}${cost > 0 ? ` for ${cost} WP` : ''}.`,
    });

    setFeedbackToast({
      id: Date.now(),
      text: cost > 0 ? `${ability.name} used. ${updatedWp} WP left.` : `${ability.name} activated.`,
      type: 'success',
    });
    setTimeout(() => setFeedbackToast(null), 2500);
  };

  /*
  const handleRemove = (id: string) => {
    const c = combatants.find(x => x.id === id);
    if (c && c.monster_id && combatantsData) { const siblings = getSiblings(c, combatantsData); siblings.forEach((sib) => removeCombatantMu.mutate(sib.id)); } else { removeCombatantMu.mutate(id); }
  };
  */

  const handleRollMonsterAttack = (id: string, m: MonsterData) => {
    if (!m.attacks?.length) return;
    const { die: tableDie, roll } = rollMonsterAttackTable(m.attacks);
    const attack = m.attacks.find((candidate) => matchesMonsterAttackRoll(candidate.roll_values, roll)) ?? getDefaultMonsterAttack(m);
    if (attack) {
      setCurrentMonsterAttacks(p => ({ ...p, [id]: attack }));
      setCurrentMonsterAttackContexts((previous) => ({
        ...previous,
        [id]: {
          roll,
          tableDie,
          attackName: attack.name,
          damage: null,
          damageFormula: null,
        },
      }));
      appendLogMu.mutate({
        type: 'monster_attack',
        ts: Date.now(),
        who: id,
        name: m.name,
        roll,
        attack: { name: attack.name, tableDie },
      });
      setSelectedActorId(id);
      setIsAttackModalOpen(true);
      return;
    }

    setFeedbackToast({ id: Date.now(), text: `${m.name} has no attack entry for roll ${roll} on ${tableDie.toUpperCase()}.`, type: 'error' });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handlePrepareGearAttack = (
    combatantId: string,
    gearItem: MonsterGearItem,
    result?: { total: number | null; formula: string }
  ) => {
    setCurrentMonsterAttacks((previous) => ({
      ...previous,
      [combatantId]: {
        name: gearItem.name,
        description: createMonsterGearAttackDescription(gearItem, monstersById.get(combatants.find((combatant) => combatant.id === combatantId)?.monster_id || '')?.stats),
        effects: [],
      },
    }));

    setCurrentMonsterAttackContexts((previous) => ({
      ...previous,
      [combatantId]: {
        roll: previous[combatantId]?.roll ?? 0,
        tableDie: previous[combatantId]?.tableDie ?? 'd6',
        attackName: gearItem.name,
        damage: result?.total ?? null,
        damageFormula: result?.formula ?? null,
      },
    }));
  };

  const handleMonsterDamageRollComplete = (combatantId: string, attackName: string, result: { total: number | null; formula: string }) => {
    setCurrentMonsterAttackContexts((previous) => ({
      ...previous,
      [combatantId]: {
        roll: previous[combatantId]?.roll ?? 0,
        tableDie: previous[combatantId]?.tableDie ?? 'd6',
        attackName,
        damage: result.total,
        damageFormula: result.formula,
      },
    }));

    if (result.total != null) {
      setFeedbackToast({ id: Date.now(), text: `${attackName} damage rolled: ${result.total}` });
      setTimeout(() => setFeedbackToast(null), 2500);
    }
  };

  const handleInitApply = async (updates: InitiativeUpdate[]) => { await Promise.all(updates.map(u => updateCombatant(u.id, { initiative_roll: u.initiative_roll, initiative_slots: u.initiative_slots, completed_initiative_slots: [], has_acted: false }))); setIsInitModalOpen(false); void invalidateCombatants(); appendLogMu.mutate({ type: 'generic', ts: Date.now(), message: 'Initiative drawn.' }); };

  const handleFlip = (id: string, current: boolean) => {
    const combatant = combatants.find((entry) => entry.id === id);
    if (!combatant) return;
    updateCombatantMu.mutate({
      id,
      updates: current
        ? { has_acted: false, completed_initiative_slots: [] }
        : completeCurrentInitiativeSlot(combatant),
    });
  };

  const { data: gameItems } = useQuery({ queryKey: queryKeys.gameItems, queryFn: () => fetchItems(), staleTime: QUERY_STALE_TIME.reference });

  /** Armor rating a target starts with: what a player wears, or a monster's stat block and gear. */
  const armorFor = (target: EncounterCombatant) => {
    if (target.monster_id) {
      const data = monstersById.get(target.monster_id);
      return getEquippedArmorValue(data?.stats?.GEAR_ITEMS, data?.stats);
    }
    return playerArmorRating(target.character?.equipment, gameItems || []).total;
  };

  const showToast = (text: string, type?: 'error', duration = 3500) => {
    setFeedbackToast({ id: Date.now(), text, ...(type ? { type } : {}) });
    setTimeout(() => setFeedbackToast(null), duration);
  };

  const activeAttackName = activeCombatant?.monster_id
    ? currentMonsterAttacks[activeCombatant.id]?.name ?? getDefaultMonsterAttack(activeCombatantMonsterData || undefined)?.name
    : undefined;

  const applyDamageMu = useMutation({
    mutationFn: async (resolution: AttackResolution) => {
      if (!activeCombatant) throw new Error('No one is acting');
      const outcomes = await applyEncounterDamage({
        encounterId: currentEncounterId!,
        attackerName: activeCombatant.monster_id ? activeCombatant.display_name.replace(/ \(Act \d+\)$/, '') : activeCombatant.display_name,
        attackName: activeAttackName ?? null,
        entries: resolution.entries,
      });
      if (resolution.markSkill && activeCombatant.character_id) {
        const marked = new Set(activeCombatant.character?.marked_skills ?? []);
        marked.add(resolution.markSkill);
        await updateCharacterCombatState(activeCombatant.character_id, { marked_skills: [...marked] });
      }
      return outcomes;
    },
    onSuccess: (outcomes) => {
      setIsAttackModalOpen(false);
      const notes = outcomes.flatMap((outcome) => (
        outcome.instantDeath ? [`${outcome.target} dies instantly`]
          : outcome.dying ? [`${outcome.target} is down: death rolls begin`]
            : outcome.defeated ? [`${outcome.target} is defeated`] : []
      ));
      if (notes.length > 0) showToast(notes.slice(0, 3).join(' · '), undefined, 4500);
      void Promise.all([invalidateEncounter(), invalidateCombatants()]);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const characterStateMu = useMutation({
    mutationFn: ({ characterId, updates }: { characterId: string; updates: Parameters<typeof updateCharacterCombatState>[1] }) => updateCharacterCombatState(characterId, updates),
    onSuccess: () => invalidateCombatants(),
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const handleToggleCondition = (combatant: EncounterCombatant, key: ConditionKey) => {
    if (!combatant.character_id) return;
    const current = combatant.character?.conditions ?? {};
    const label = CONDITIONS.find((condition) => condition.key === key)?.label ?? key;
    const next = { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false, ...current, [key]: !current[key] };
    characterStateMu.mutate({ characterId: combatant.character_id, updates: { conditions: next } });
    appendLogMu.mutate({ type: 'generic', ts: Date.now(), message: `${combatant.display_name} ${current[key] ? `is no longer ${label}` : `is now ${label}`}.` });
  };

  const handleDeathRollChange = (combatant: EncounterCombatant, changes: { passed?: number; failed?: number; rallied?: boolean }) => {
    if (!combatant.character_id) return;
    const updates: Parameters<typeof updateCharacterCombatState>[1] = {};
    if (changes.passed !== undefined) updates.death_rolls_passed = changes.passed;
    if (changes.failed !== undefined) updates.death_rolls_failed = changes.failed;
    if (changes.rallied !== undefined) updates.is_rallied = changes.rallied;
    characterStateMu.mutate({ characterId: combatant.character_id, updates });
    const message = changes.failed === 3 ? `${combatant.display_name} has died.`
      : changes.passed === 3 ? `${combatant.display_name} is stabilised.`
        : changes.rallied === true ? `${combatant.display_name} rallied.`
          : null;
    if (message) appendLogMu.mutate({ type: 'generic', ts: Date.now(), message });
  };

  const stabiliseMu = useMutation({
    mutationFn: async ({ combatant, hp }: { combatant: EncounterCombatant; hp: number }) => {
      await updateCombatant(combatant.id, { current_hp: hp });
      if (combatant.character_id) await updateCharacterCombatState(combatant.character_id, { death_rolls_passed: 0, death_rolls_failed: 0, is_rallied: false });
      await appendEncounterLog(currentEncounterId!, { type: 'generic', ts: Date.now(), message: `${combatant.display_name} recovers ${hp} HP and is back on their feet.` });
    },
    onSuccess: () => Promise.all([invalidateEncounter(), invalidateCombatants()]),
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const combatSummary = useMemo(
    () => buildCombatSummary((encounterDetails?.log ?? []) as SummaryLogEntry[], combatants, encounterDetails?.current_round ?? 0),
    [encounterDetails?.log, encounterDetails?.current_round, combatants],
  );

  const handleWaitConfirm = (targetId: string) => {
    if (!activeCombatant) return;
    swapInitiativeMu.mutate({ id1: activeCombatant.id, id2: targetId });
    setIsWaitModalOpen(false);
  }

  // REMOVED: if (!isDM) return <div ...> check to allow players to see the view.

  if (loadingEnc) return <LoadingSpinner />;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 sticky top-2 z-30">
        <div><h2 className="text-2xl font-bold font-serif text-stone-900">{encounterDetails ? encounterDetails.name : 'Encounters'}</h2>{encounterDetails && (<div className="flex items-center gap-3 text-sm mt-1"><span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider ${encounterDetails.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{encounterDetails.status}</span>{encounterDetails.status === 'active' && (<span className="font-mono font-bold text-stone-600">Round {encounterDetails.current_round}</span>)}</div>)}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {viewMode === 'details' && (
              <>
                {isDM && (
                  <>
                    <Button variant="ghost" icon={PlusCircle} onClick={() => setViewMode('create')}>New</Button>
                    <Button onClick={() => setShowEncounterList(true)} icon={List} variant="secondary">List</Button>
                    <Button onClick={() => setIsRollTablesModalOpen(true)} icon={Dices} variant="secondary">Tables</Button>
                  </>
                )}
                <Button onClick={() => setIsFearModalOpen(true)} icon={ShieldAlert} variant="secondary">Fear</Button>
                {encounterDetails?.status === 'planning' && isDM && <Button variant="primary" icon={Play} onClick={() => startEncounterMu.mutate()}>Start</Button>}
                {encounterDetails?.status === 'active' && isDM && (
                  <>
                    <Button variant="primary" icon={SkipForward} onClick={() => nextRoundMu.mutate()}>Next Round</Button>
                    <Button variant="outline" icon={Square} onClick={() => setIsSummaryOpen(true)}>End</Button>
                  </>
                )}
                {/* Player View: Simple Status Indicator if not DM */}
                {!isDM && encounterDetails?.status === 'active' && (
                  <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 animate-pulse">
                    <Swords size={12} /> COMBAT ACTIVE
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {feedbackToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in ${feedbackToast.type === 'error' ? 'bg-red-600' : 'bg-stone-900'}`}>
          <div className={`${feedbackToast.type === 'error' ? 'bg-red-800' : 'bg-green-500'} rounded-full p-1`}>
            {feedbackToast.type === 'error' ? <AlertCircle size={12} className="text-white" /> : <Check size={12} className="text-white" />}
          </div>
          <span className="font-medium text-sm">{feedbackToast.text}</span>
        </div>
      )}

      {viewMode === 'create' ? (
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md mx-auto text-center"><h3 className="text-xl font-bold mb-4">Start a New Encounter</h3><input className="w-full p-3 border rounded-lg mb-4" placeholder="Name" value={newEncounterName} onChange={e => setNewEncounterName(e.target.value)} /><div className="flex justify-center gap-3"><Button variant="primary" onClick={() => createEncounterMu.mutate(newEncounterName)}>Create</Button><Button variant="ghost" onClick={() => setViewMode('details')}>Cancel</Button></div></div>
      ) : !encounterDetails ? (
        <div className="text-center py-12 text-stone-400">No encounter selected.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-1 h-fit lg:sticky lg:top-24">
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden"><div className="p-3 bg-stone-50 border-b border-stone-200"><h4 className="font-bold text-stone-600 text-sm uppercase">Combat Log</h4></div><div className="h-64 lg:h-[calc(100vh-300px)] overflow-y-auto p-3 bg-white"><CombatLogView log={(encounterDetails.log as CombatLogEntry[] | undefined) || []} /></div></div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 shadow-sm">
              <TrustedRollFeed partyId={partyId} encounterId={currentEncounterId} compact />
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200"><textarea className="w-full text-sm p-2 border rounded bg-yellow-50/50 min-h-[100px]" placeholder={isDM ? "DM Notes..." : "Encounter Notes"} disabled={!isDM} value={temporaryNotes} onChange={e => setTemporaryNotes(e.target.value)} />{isDM && <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} icon={Edit3}>Edit Encounter</Button></div>}</div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {swapSourceId && (<div className="bg-purple-600 text-white p-3 rounded-lg shadow-md flex justify-between items-center animate-pulse"><span className="font-bold flex items-center gap-2"><ArrowUpDown /> Select swap target...</span><Button size="sm" variant="secondary" onClick={() => setSwapSourceId(null)}>Cancel</Button></div>)}
            {isEditingEncounter && (<div className="bg-white p-4 rounded-xl shadow mb-4 border border-blue-200"><h4 className="font-bold mb-2">Edit Details</h4><input className="w-full mb-2 p-2 border rounded" value={editedName} onChange={e => setEditedName(e.target.value)} /><div className="flex gap-2"><Button size="sm" onClick={() => updateEncounterMu.mutate({ id: currentEncounterId!, updates: { name: editedName } })}>Save</Button><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(false)}>Cancel</Button></div></div>)}
            {encounterDetails.status === 'active' && activeCombatant && (
              <ActiveCombatantSpotlight
                combatant={activeCombatant}
                initiativeSlot={activeInitiativeSlot}
                monsterData={activeCombatantMonsterData || undefined}
                currentAttack={currentMonsterAttacks[activeCombatant.id]}
                onRollAttack={() => activeCombatantMonsterData && handleRollMonsterAttack(activeCombatant.id, activeCombatantMonsterData as MonsterData)}
                onEndTurn={() => handleFlip(activeCombatant.id, false)}
                onOpenAttackModal={(result, attackName) => {
                  const resolvedAttackName = attackName || currentMonsterAttacks[activeCombatant.id]?.name || 'Attack';
                  if (activeCombatant.monster_id) {
                    const gearMatch = activeCombatantMonsterData?.stats?.GEAR_ITEMS?.find((gearItem) => gearItem.name === resolvedAttackName);
                    if (gearMatch) {
                      handlePrepareGearAttack(activeCombatant.id, gearMatch, result);
                    } else
                    if (result) {
                      handleMonsterDamageRollComplete(activeCombatant.id, resolvedAttackName, result);
                    }
                  }
                  setIsAttackModalOpen(true);
                }}
                onUseHeroicAbility={(ability) => handleUseMonsterHeroicAbility(activeCombatant, ability)}
                onWait={() => setIsWaitModalOpen(true)}
                onOpenCharacterSheet={() => handleOpenCharacterSheet(activeCombatant)}
                isDM={isDM}
              />
            )}
            <div className="bg-stone-100/50 p-4 rounded-xl border border-stone-200">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-stone-500 uppercase tracking-wider text-sm">Initiative Track</h3><div className="flex gap-2">{isDM && encounterDetails.status === 'active' && <Button size="sm" variant="outline" icon={RefreshCw} onClick={() => setIsInitModalOpen(true)}>Re-Draw</Button>}{isDM && <Button size="sm" variant="outline" icon={UserPlus} onClick={() => setIsAddModalOpen(true)}>Add</Button>}</div></div>

              <div className="space-y-2">{combatants.length === 0 && <p className="text-center py-8 text-stone-400 italic">No combatants added.</p>}{combatants.map(c => (<DragonbaneCombatantCard key={c.id} combatant={c} monsterData={monstersById.get(c.monster_id || '')} isSelected={selectedActorId === c.id} isSwapSource={swapSourceId === c.id} onSelect={setSelectedActorId} onSwapRequest={(id: string) => swapSourceId ? swapInitiativeMu.mutate({ id1: swapSourceId, id2: id }) : setSwapSourceId(id)} onFlipCard={handleFlip} onSaveStats={handleSaveStats} onToggleFear={handleToggleFear} onTogglePoison={handleTogglePoison} onRemove={(id: string) => removeCombatantMu.mutate(id)} statsState={editingStats[c.id] || { current_hp: '', current_wp: '' }} setStatsState={(v: EditableCombatantStats) => setEditingStats(prev => ({ ...prev, [c.id]: v }))} isDM={isDM} myCharacterId={myCharacterId ?? null} onSetInitiative={handleSetInitiativeSingle} onOpenCharacterSheet={handleOpenCharacterSheet} onToggleCondition={handleToggleCondition} onDeathRollChange={handleDeathRollChange} onStabilise={(combatant, hp) => stabiliseMu.mutate({ combatant, hp })} />))}</div>
            </div>
          </div>
        </div>
      )}
      <AddCombatantsModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        partyMembers={partyMembers}
        availablePartyMembers={availableParty}
        allMonsters={allMonsters || []}
        onAddParty={(id: string) => addCharacterMu.mutate({ encounterId: currentEncounterId!, characterId: id, initiativeRoll: null })}
        onAddMonster={handleAddMonster}
        onCreateCustom={(asNpc: boolean) => setCustomMonsterKind(asNpc ? 'npc' : 'monster')}
      />
      {customMonsterKind && (
        <CustomMonsterModal
          partyId={partyId}
          asNpc={customMonsterKind === 'npc'}
          onClose={() => setCustomMonsterKind(null)}
          onCreated={(monster, count, customName) => {
            if (count > 0 && monster.id && currentEncounterId) handleAddMonster(monster.id, count, customName, monster as unknown as MonsterData);
          }}
        />
      )}
      <InitiativeDrawModal isOpen={isInitModalOpen} onClose={() => setIsInitModalOpen(false)} combatants={combatants} onApply={handleInitApply} />
      {isAttackModalOpen && activeCombatant && (
        <AttackResolutionModal
          isOpen={isAttackModalOpen}
          onClose={() => setIsAttackModalOpen(false)}
          attacker={activeCombatant}
          targets={combatants.filter(c => c.id !== activeCombatant.id)}
          attackName={activeAttackName}
          attackContext={activeCombatant.monster_id ? currentMonsterAttackContexts[activeCombatant.id] : null}
          armorFor={armorFor}
          isSaving={applyDamageMu.isPending}
          onConfirm={(resolution) => applyDamageMu.mutate(resolution)}
        />
      )}
      <CombatSummaryDialog
        isOpen={isSummaryOpen}
        summary={combatSummary}
        isSaving={finishEncounterMu.isPending}
        onClose={() => setIsSummaryOpen(false)}
        onFinish={(clearConditions) => finishEncounterMu.mutate(clearConditions)}
      />
      {/* NEW: WAIT MODAL */}
      {isWaitModalOpen && activeCombatant && (
        <WaitTurnModal
          isOpen={isWaitModalOpen}
          onClose={() => setIsWaitModalOpen(false)}
          currentActor={activeCombatant}
          allCombatants={combatants}
          onSwap={handleWaitConfirm}
        />
      )}
      <CharacterSheetDialog
        isOpen={isCharacterSheetModalOpen}
        onClose={handleCloseCharacterSheetModal}
        title={sheetCombatant?.display_name || 'Character'}
        isLoading={isCharacterSheetLoading}
        isReady={isRequestedCharacterLoaded}
        error={characterSheetError}
        onRetry={handleRetryCharacterSheetLoad}
      />
      <RollTablesModal
        isOpen={isRollTablesModalOpen}
        onClose={() => setIsRollTablesModalOpen(false)}
        partyId={partyId}
      />
      <FearReferenceModal
        isOpen={isFearModalOpen}
        onClose={() => setIsFearModalOpen(false)}
      />
      {showEncounterList && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl space-y-4 max-h-[80vh] flex flex-col"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">All Encounters</h3><Button variant="ghost" size="sm" onClick={() => setShowEncounterList(false)} icon={XCircle}>Close</Button></div><div className="overflow-y-auto space-y-2 border-t pt-4">{(allEncounters ?? []).map(enc => (<div key={enc.id} className={`flex items-center justify-between p-3 rounded-md ${currentEncounterId === enc.id ? 'bg-blue-100' : 'bg-gray-50'}`}><div><p className="font-semibold">{enc.name}</p><p className="text-sm text-gray-600 capitalize">Status: {enc.status}</p></div><div className="flex items-center gap-2"><Button size="sm" onClick={() => setSelectedEncounterId(enc.id)} disabled={currentEncounterId === enc.id}>Select</Button><Button size="sm" variant="outline" icon={Copy} onClick={() => duplicateEncounterMu.mutate({ id: enc.id, name: enc.name })}>Copy</Button><Button size="sm" variant="danger" icon={Trash2} onClick={() => deleteEncounterMu.mutate(enc.id)}>Del</Button></div></div>))}</div></div></div>)}
    </div>
  );
}
