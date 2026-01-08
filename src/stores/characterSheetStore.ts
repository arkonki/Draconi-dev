// src/stores/characterSheetStore.ts

import { create } from 'zustand';
import { Character, InventoryItem, EquippedItems, AttributeName, CharacterSpells, GameItem } from '../types/character';
import { Spell, MagicSchool } from '../types/magic';
import { updateCharacter, fetchCharacterById } from '../lib/api/characters';
import { fetchItems } from '../lib/api/items';
import { fetchActiveEncounterForParty, fetchLatestEncounterForParty, fetchEncounterCombatants, updateCombatant as apiUpdateCombatant } from '../lib/api/encounters';
import type { Encounter, EncounterCombatant } from '../types/encounter';
import { supabase } from '../lib/supabase';

export interface HeroicAbility { id: string; name: string; description: string; willpower_cost: number | null; }

interface CharacterSheetState {
  character: Character | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveError: string | null;
  markedSkillsThisSession: Set<string>;
  allGameItems: GameItem[];
  isLoadingGameItems: boolean;
  allHeroicAbilities: HeroicAbility[];
  isLoadingAbilities: boolean;
  activeStatusMessage: string | null;
  statusMessageTimeoutId: NodeJS.Timeout | null;
  
  // Encounter State
  activeEncounter: Encounter | null;
  currentCombatant: EncounterCombatant | null;
  encounterCombatants: EncounterCombatant[];
  isLoadingEncounter: boolean;
  encounterError: string | null;

  // Actions
  fetchCharacter: (id: string, userId: string) => Promise<void>;
  setCharacter: (character: Character | null) => void;
  _saveCharacter: (updates: Partial<Character>) => Promise<void>;
  _loadGameItems: () => Promise<void>;
  _loadAllHeroicAbilities: () => Promise<void>;
  updateCharacterData: (updates: Partial<Character>) => Promise<void>;
  
  // Logic updated to accept VALUES (from Dice Roller) instead of internal random()
  performRest: (type: 'round' | 'stretch' | 'shift', hpHealed?: number, wpHealed?: number) => Promise<void>;
  setInitiativeForCombatant: (combatantId: string, initiative: number) => Promise<void>;
  
  adjustStat: (stat: 'current_hp' | 'current_wp', amount: number) => Promise<void>;
  toggleCondition: (conditionName: keyof Character['conditions']) => Promise<void>;
  setDeathRollState: (successes: number, failures: number, rallied?: boolean) => Promise<void>;
  updateAttribute: (attribute: AttributeName, value: number) => Promise<void>;
  updateCurrentHP: (value: number) => Promise<void>;
  updateWillpowerPoints: (value: number) => Promise<void>;
  updateConditions: (conditions: Character['conditions']) => Promise<void>;
  updateInventory: (inventory: InventoryItem[]) => Promise<void>;
  updateEquipped: (equipped: EquippedItems) => Promise<void>;
  updateMoney: (money: Character['equipment']['money']) => Promise<void>;
  updateNotes: (notes: string) => Promise<void>;
  updateExperience: (value: number) => Promise<void>;
  updateReputation: (value: number) => Promise<void>;
  updateCorruption: (value: number) => Promise<void>;
  updateDeathRolls: (type: 'failed' | 'passed', value: number) => Promise<void>;
  updateAppearance: (appearance: string) => Promise<void>;
  updateSkillLevel: (skillName: string, level: number) => Promise<void>;
  increaseSkillLevel: (skillName: string) => Promise<void>;
  addHeroicAbility: (abilityName: string) => Promise<void>;
  increaseMaxStat: (stat: 'max_hp' | 'max_wp', amount: number) => Promise<void>;
  learnSpell: (spell: Spell) => Promise<void>;
  addMagicSchool: (school: MagicSchool, level: number) => Promise<void>;
  setSkillUnderStudy: (skillName: string | null) => Promise<void>;
  
  markSkillThisSession: (skillName: string) => Promise<void>; // Changed to Promise
  clearMarkedSkillsThisSession: () => void;
  setActiveStatusMessage: (message: string, duration?: number) => void;
  clearActiveStatusMessage: () => void;
  
  fetchActiveEncounter: (partyId: string, characterId: string) => Promise<void>;
  clearActiveEncounter: () => void;
  updateCombatant: (combatantId: string, updates: Partial<EncounterCombatant>) => Promise<void>;
}

export const useCharacterSheetStore = create<CharacterSheetState>((set, get) => ({
  character: null,
  isLoading: true,
  isSaving: false,
  error: null,
  saveError: null,
  markedSkillsThisSession: new Set(),
  allGameItems: [],
  isLoadingGameItems: false,
  allHeroicAbilities: [],
  isLoadingAbilities: false,
  activeStatusMessage: null,
  statusMessageTimeoutId: null,
  activeEncounter: null,
  currentCombatant: null,
  encounterCombatants: [],
  isLoadingEncounter: false,
  encounterError: null,

  fetchCharacter: async (id, userId) => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all([get()._loadGameItems(), get()._loadAllHeroicAbilities()]);
      const characterData = await fetchCharacterById(id, userId);
      if (!characterData) {
        throw new Error(`Character with ID ${id} not found.`);
      }
      set({ character: characterData, isLoading: false, markedSkillsThisSession: new Set(characterData.marked_skills || []) });
      if (characterData?.party_id) {
        get().fetchActiveEncounter(characterData.party_id, characterData.id);
      } else {
        get().clearActiveEncounter();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch character';
      set({ error: errorMessage, isLoading: false });
    }
  },

  fetchActiveEncounter: async (partyId, characterId) => {
    set({ isLoadingEncounter: true });
    try {
      // 1. Fetch ONLY the active encounter
      const activeEncounter = await fetchActiveEncounterForParty(partyId);

      // 2. Check if an active encounter exists
      if (activeEncounter) {
        const allCombatants = await fetchEncounterCombatants(activeEncounter.id);
        const characterCombatant = allCombatants.find(c => c.character_id === characterId);
        
        // Sort by initiative (nulls last)
        const sortedCombatants = allCombatants.sort((a, b) => (a.initiative_roll ?? 100) - (b.initiative_roll ?? 100));
        
        set({
          activeEncounter: activeEncounter, // Use the active one
          currentCombatant: characterCombatant ?? null,
          encounterCombatants: sortedCombatants,
        });
      } else {
        get().clearActiveEncounter();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch encounter';
      set({ encounterError: errorMessage });
    } finally {
      set({ isLoadingEncounter: false });
    }
  },

	

  setCharacter: (character) => {
    set({ character });
    if (!character || !character.party_id) {
      get().clearActiveEncounter();
    } else {
      get().fetchActiveEncounter(character.party_id, character.id);
    }
  },

  _saveCharacter: async (updates) => {
    const characterId = get().character?.id;
    if (!characterId) {
      const errorMsg = 'Cannot save: Character ID is missing.';
      set({ saveError: errorMsg });
      throw new Error(errorMsg);
    }
    set({ isSaving: true, saveError: null });
    try {
      await updateCharacter(characterId, updates);
      set(state => {
        if (!state.character) return {};
        const newCharacterState: Character = {
          ...state.character,
          ...updates,
          updated_at: new Date().toISOString(),
        };
        return { character: newCharacterState, isSaving: false };
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save character';
      set({ saveError: errorMessage, isSaving: false });
      throw err;
    }
  },

  _loadGameItems: async () => {
    if (get().isLoadingGameItems || get().allGameItems.length > 0) return;
    set({ isLoadingGameItems: true });
    try {
      const items = await fetchItems();
      set({ allGameItems: items, isLoadingGameItems: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load game items';
      set({ isLoadingGameItems: false, error: errorMessage });
    }
  },

  _loadAllHeroicAbilities: async () => {
    if (get().isLoadingAbilities || get().allHeroicAbilities.length > 0) return;
    set({ isLoadingAbilities: true });
    try {
      const { data, error } = await supabase.from('heroic_abilities').select('*').order('name');
      if (error) throw error;
      set({ allHeroicAbilities: data || [], isLoadingAbilities: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load heroic abilities';
      set({ isLoadingAbilities: false, error: errorMessage });
    }
  },

  updateCharacterData: async (updates) => {
    return get()._saveCharacter(updates);
  },

  // --- REFACTORED: Now accepts rolled values from UI ---
  performRest: async (type, hpHealed = 0, wpHealed = 0) => {
    const character = get().character;
    if (!character) return;
    const updates: Partial<Character> = {};
    const currentHP = character.current_hp ?? 0;
    const maxHP = character.max_hp ?? 10;
    const currentWP = character.current_wp ?? 0;
    const maxWP = character.max_wp ?? 10;

    if (type === 'round') {
      updates.current_wp = Math.min(maxWP, currentWP + wpHealed);
    } else if (type === 'stretch') {
      if (currentHP <= 0) {
        get().setActiveStatusMessage("Cannot take Stretch Rest while dying.", 3000);
        return;
      }
      if (hpHealed > 0) updates.current_hp = Math.min(maxHP, currentHP + hpHealed);
      if (wpHealed > 0) updates.current_wp = Math.min(maxWP, currentWP + wpHealed);
      
      const currentConditions = character.conditions ?? {};
      const newConditions = { ...currentConditions };
      // Heals one condition
      for (const key of Object.keys(newConditions) as Array<keyof typeof newConditions>) {
        if (newConditions[key] === true) {
          newConditions[key] = false;
          updates.conditions = newConditions;
          break;
        }
      }
    } else if (type === 'shift') {
      updates.current_hp = maxHP;
      updates.current_wp = maxWP;
      updates.conditions = { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false };
      updates.death_rolls_failed = 0;
      updates.death_rolls_passed = 0;
      updates.is_rallied = false;
    }
    
    if (Object.keys(updates).length > 0) {
      await get()._saveCharacter(updates);
    }
  },

  adjustStat: async (stat, amount) => {
    const character = get().character;
    if (!character) return;
    if (stat === 'current_hp') {
      const currentHP = character.current_hp ?? 0;
      const maxHP = character.max_hp ?? 10;
      const newValue = Math.max(0, Math.min(maxHP, currentHP + amount));
      if (newValue !== currentHP) {
        const updates: Partial<Character> = { current_hp: newValue };
        if (currentHP <= 0 && newValue > 0) {
          updates.death_rolls_passed = 0;
          updates.death_rolls_failed = 0;
          updates.is_rallied = false;
        }
        await get()._saveCharacter(updates);
      }
    } else if (stat === 'current_wp') {
      const currentWP = character.current_wp ?? 0;
      const maxWP = character.max_wp ?? 10;
      const newValue = Math.max(0, Math.min(maxWP, currentWP + amount));
      if (newValue !== currentWP) {
        await get()._saveCharacter({ current_wp: newValue });
      }
    }
  },

  toggleCondition: async (conditionName) => {
    const character = get().character;
    if (!character) return;
    const currentConditions = character.conditions ?? { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false };
    const newConditions = { ...currentConditions, [conditionName]: !currentConditions[conditionName] };
    await get()._saveCharacter({ conditions: newConditions });
  },

  setDeathRollState: async (successes, failures, rallied) => {
    const updates: Partial<Character> = { death_rolls_passed: successes, death_rolls_failed: failures };
    if (rallied !== undefined) {
      updates.is_rallied = rallied;
    }
    await get()._saveCharacter(updates);
  },

  updateAttribute: async (attribute, value) => {
    const character = get().character;
    if (!character) return;
    const newAttributes = { ...(character.attributes || {}), [attribute]: value };
    const updates: Partial<Character> = { attributes: newAttributes };
    if (attribute === 'CON' && character.max_hp == null) {
      updates.max_hp = value;
      updates.current_hp = Math.min(character.current_hp ?? 0, value);
    }
    if (attribute === 'WIL' && character.max_wp == null) {
      updates.max_wp = value;
      updates.current_wp = Math.min(character.current_wp ?? 0, value);
    }
    await get()._saveCharacter(updates);
  },

  updateCurrentHP: async (value) => {
    const maxHP = get().character?.max_hp ?? 10;
    if (value > maxHP) return;
    await get()._saveCharacter({ current_hp: value });
  },

  updateWillpowerPoints: async (value) => {
    const maxWP = get().character?.max_wp ?? 10;
    if (value > maxWP) return;
    await get()._saveCharacter({ current_wp: value });
  },

  updateConditions: async (conditions) => get()._saveCharacter({ conditions }),
  updateInventory: async (inventory) => get()._saveCharacter({ equipment: { ...get().character?.equipment, inventory } }),
  updateEquipped: async (equipped) => get()._saveCharacter({ equipment: { ...get().character?.equipment, equipped } }),
  updateMoney: async (money) => get()._saveCharacter({ equipment: { ...get().character?.equipment, money } }),
  updateNotes: async (notes) => get()._saveCharacter({ notes }),
  updateExperience: async (value) => get()._saveCharacter({ experience: value }),
  updateReputation: async (value) => get()._saveCharacter({ reputation: value }),
  updateCorruption: async (value) => get()._saveCharacter({ corruption: value }),
  updateAppearance: async (appearance) => get()._saveCharacter({ appearance }),
  
  updateDeathRolls: async (type, value) => {
    const char = get().character;
    if (!char) return;
    if (type === 'failed') {
      await get().setDeathRollState(char.death_rolls_passed ?? 0, value, char.is_rallied);
    } else {
      await get().setDeathRollState(value, char.death_rolls_failed ?? 0, char.is_rallied);
    }
  },

  updateSkillLevel: async (skillName, level) => {
    const character = get().character;
    if (!character) return;
    const newSkillLevels = { ...character.skill_levels, [skillName]: level };
    await get()._saveCharacter({ skill_levels: newSkillLevels });
  },

  increaseSkillLevel: async (skillName) => {
    const character = get().character;
    if (!character) return;
    const currentSkillLevels = character.skill_levels || {};
    const currentLevel = currentSkillLevels[skillName] ?? 0;
    if (currentLevel >= 18) return;
    const newLevel = Math.min(currentLevel + 1, 18);
    const updates: Partial<Character> = { skill_levels: { ...currentSkillLevels, [skillName]: newLevel } };
    if (character.teacher?.skillUnderStudy === skillName) {
      updates.teacher = null;
    }
    await get()._saveCharacter(updates);
  },

  addHeroicAbility: async (abilityName) => {
    const character = get().character;
    if (!character) return;
    const currentAbilities = character.heroic_abilities || [];
    await get()._saveCharacter({ heroic_abilities: [...currentAbilities, abilityName] });
  },

  increaseMaxStat: async (stat, amount) => {
    const character = get().character;
    if (!character?.id) throw new Error("Character ID not found for RPC call.");
    set({ isSaving: true, saveError: null });
    try {
      const { error } = await supabase.rpc('increase_character_max_stat', { character_id_input: character.id, stat_name: stat, amount_increase: amount });
      if (error) throw new Error(error.message);
      set({ isSaving: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'A failure occurred in increaseMaxStat';
      set({ saveError: errorMessage, isSaving: false });
      throw err;
    }
  },

  learnSpell: async (spellToLearn: Spell) => {
    const { character, _saveCharacter } = get();
    if (!character) throw new Error("Cannot learn spell: No active character.");
    const currentSpells: CharacterSpells = JSON.parse(JSON.stringify(character.spells ?? {}));
    if (!currentSpells.school) currentSpells.school = { name: null, spells: [] };
    if (!currentSpells.school.spells) currentSpells.school.spells = [];
    if (!currentSpells.general) currentSpells.general = [];
    
    let wasUpdated = false;
    if (spellToLearn.school_id) {
      if (!currentSpells.school.spells.includes(spellToLearn.name)) {
        currentSpells.school.spells.push(spellToLearn.name);
        wasUpdated = true;
      }
    } else {
      if (!currentSpells.general.includes(spellToLearn.name)) {
        currentSpells.general.push(spellToLearn.name);
        wasUpdated = true;
      }
    }
    if (wasUpdated) {
      await _saveCharacter({ spells: currentSpells });
    }
  },

  addMagicSchool: async (school, level) => {
    const character = get().character;
    if (!character) return;
    const newSkillLevels = { ...character.skill_levels, [school.name]: level, };
    const updates: Partial<Character> = { skill_levels: newSkillLevels, };
    if (!character.magic_school) updates.magic_school = school.id;
    await get()._saveCharacter(updates);
  },

  setSkillUnderStudy: async (skillName) => {
    await get()._saveCharacter({ teacher: skillName ? { skillUnderStudy: skillName } : null });
  },

  // --- REFACTORED: Persistent Marking ---
  markSkillThisSession: async (skillName) => {
    const { character, _saveCharacter, markedSkillsThisSession } = get();
    
    // 1. Update local memory Set (for UI speed)
    const newSet = new Set(markedSkillsThisSession).add(skillName);
    set({ markedSkillsThisSession: newSet });

    // 2. Persist to Database immediately
    if (character) {
      const currentMarks = new Set(character.marked_skills || []);
      if (!currentMarks.has(skillName)) {
        currentMarks.add(skillName);
        await _saveCharacter({ marked_skills: Array.from(currentMarks) });
      }
    }
  },

  clearMarkedSkillsThisSession: () => set({ markedSkillsThisSession: new Set() }),

  setActiveStatusMessage: (message, duration = 30000) => {
    clearTimeout(get().statusMessageTimeoutId as NodeJS.Timeout);
    set({ activeStatusMessage: message });
    const newTimeoutId = setTimeout(() => {
      set({ activeStatusMessage: null, statusMessageTimeoutId: null });
    }, duration);
    set({ statusMessageTimeoutId: newTimeoutId });
  },

  clearActiveStatusMessage: () => {
    clearTimeout(get().statusMessageTimeoutId as NodeJS.Timeout);
    set({ activeStatusMessage: null, statusMessageTimeoutId: null });
  },

  setInitiativeForCombatant: async (combatantId, initiative) => {
    set({ isSaving: true, saveError: null });
    try {
      await apiUpdateCombatant(combatantId, { initiative_roll: initiative });
      get().setActiveStatusMessage(`Initiative set to ${initiative}`, 4000);
      set(state => ({
        encounterCombatants: state.encounterCombatants.map(c => 
          c.id === combatantId ? { ...c, initiative_roll: initiative } : c
        )
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set initiative';
      set({ saveError: errorMessage });
    } finally {
      set({ isSaving: false });
    }
  },

  updateCombatant: async (combatantId, updates) => {
    set({ isSaving: true, saveError: null });
    try {
      // 1. Update the Encounter Combatant (Triggers Realtime for everyone)
      await apiUpdateCombatant(combatantId, updates);

      // 2. CRITICAL: If this is MY character, also update the main Character Sheet
      // This ensures the damage persists even after the encounter ends.
      const state = get();
      const combatant = state.encounterCombatants.find(c => c.id === combatantId);
      
      if (combatant && state.character && combatant.character_id === state.character.id) {
          const charUpdates: Partial<Character> = {};
          if (updates.current_hp !== undefined) charUpdates.current_hp = updates.current_hp;
          if (updates.current_wp !== undefined) charUpdates.current_wp = updates.current_wp;
          
          if (Object.keys(charUpdates).length > 0) {
              await updateCharacter(state.character.id, charUpdates);
          }
      }
      
      // 3. Update Local State immediately
      set(state => {
        const updatedCombatants = state.encounterCombatants.map(c => 
          c.id === combatantId ? { ...c, ...updates } : c
        );
        
        // Also update the loaded character object if it matches
        let updatedCharacter = state.character;
        if (combatant && state.character && combatant.character_id === state.character.id) {
            updatedCharacter = {
                ...state.character,
                current_hp: updates.current_hp !== undefined ? updates.current_hp : state.character.current_hp,
                current_wp: updates.current_wp !== undefined ? updates.current_wp : state.character.current_wp,
            };
        }
        return { encounterCombatants: updatedCombatants, character: updatedCharacter };
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update combatant';
      set({ saveError: errorMessage });
    } finally {
      set({ isSaving: false });
    }
  },

  clearActiveEncounter: () => {
    set({ activeEncounter: null, currentCombatant: null, isLoadingEncounter: false, encounterError: null, encounterCombatants: [] });
  },
}));
