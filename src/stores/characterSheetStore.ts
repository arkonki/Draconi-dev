import { create } from 'zustand';
import { Character, InventoryItem, EquippedItems, AttributeName, CharacterSpells, GameItem } from '../types/character';
import { updateCharacter, fetchCharacterById } from '../lib/api/characters';
import { fetchItems } from '../lib/api/items';
import { parseSkillLevels } from '../lib/utils';
import { parseItemString } from '../lib/inventoryUtils';
import { fetchLatestEncounterForParty, fetchEncounterCombatants, updateCombatant } from '../lib/api/encounters';
import type { Encounter, EncounterCombatant } from '../types/encounter';

interface CharacterSheetState {
  character: Character | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveError: string | null;
  markedSkillsThisSession: Set<string>;
  allGameItems: GameItem[];
  isLoadingGameItems: boolean;
  activeStatusMessage: string | null;
  statusMessageTimeoutId: NodeJS.Timeout | null;
  activeEncounter: Encounter | null;
  currentCombatant: EncounterCombatant | null;
  isLoadingEncounter: boolean;
  encounterError: string | null;
  fetchCharacter: (id: string, userId: string) => Promise<void>;
  setCharacter: (character: Character | null) => void;
  _saveCharacter: (updates: Partial<Character>) => Promise<void>;
  _loadGameItems: () => Promise<void>;
  updateCharacterData: (updates: Partial<Character>) => Promise<void>;
  adjustStat: (stat: 'current_hp' | 'current_wp', amount: number) => Promise<void>;
  toggleCondition: (conditionName: keyof Character['conditions']) => Promise<void>;
  performRest: (type: 'round' | 'stretch' | 'shift', healerPresent?: boolean) => Promise<void>;
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
  learnSpell: (spellName: string) => Promise<void>;
  setSkillUnderStudy: (skillName: string | null) => Promise<void>;
  markSkillThisSession: (skillName: string) => void;
  clearMarkedSkillsThisSession: () => void;
  setActiveStatusMessage: (message: string, duration?: number) => void;
  clearActiveStatusMessage: () => void;
  fetchActiveEncounter: (partyId: string, characterId: string) => Promise<void>;
  clearActiveEncounter: () => void;
  drawInitiative: () => Promise<void>;
}

export const useCharacterSheetStore = create<CharacterSheetState>((set, get) => ({
  character: null,
  isLoading: false,
  isSaving: false,
  error: null,
  saveError: null,
  markedSkillsThisSession: new Set(),
  allGameItems: [],
  isLoadingGameItems: false,
  activeStatusMessage: null,
  statusMessageTimeoutId: null,
  activeEncounter: null,
  currentCombatant: null,
  isLoadingEncounter: false,
  encounterError: null,

  fetchCharacter: async (id, userId) => {
    set({ character: null, isLoading: true, error: null, saveError: null });
    try {
      if (get().allGameItems.length === 0 && !get().isLoadingGameItems) {
        await get()._loadGameItems();
      }
      const currentGameItems = get().allGameItems;

      const characterData = await fetchCharacterById(id, userId);
      if (!characterData) {
        throw new Error(`Character with ID ${id} not found.`);
      }

      if (!characterData.equipment) {
        characterData.equipment = { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } };
      } else {
        if (!characterData.equipment.inventory) characterData.equipment.inventory = [];
        if (!characterData.equipment.equipped) characterData.equipment.equipped = { weapons: [] };
        if (!characterData.equipment.money) characterData.equipment.money = { gold: 0, silver: 0, copper: 0 };
      }

      if (
        Array.isArray(characterData.equipment.inventory) &&
        characterData.equipment.inventory.length > 0 &&
        typeof characterData.equipment.inventory[0] === 'string'
      ) {
        characterData.equipment.inventory = (characterData.equipment.inventory as string[]).map(itemStr =>
          parseItemString(itemStr, currentGameItems)
        );
      }

      set({ character: characterData, isLoading: false });

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

  setCharacter: (character) => {
    set({ character });
    if (!character || !character.party_id) {
      get().clearActiveEncounter();
    } else {
      get().fetchActiveEncounter(character.party_id, character.id);
    }
  },

  // --- THIS IS THE CORRECTED FUNCTION ---
  _saveCharacter: async (updates) => {
    const currentCharacter = get().character;
    if (!currentCharacter?.id) {
      const errorMsg = 'Cannot save: Character ID is missing.';
      set({ saveError: errorMsg });
      throw new Error(errorMsg);
    }

    set({ isSaving: true, saveError: null });
    
    try {
      // The `updateCharacter` API call should ONLY receive the fields that have changed.
      // We pass the `updates` object directly, without merging it with the full character state.
      const savedCharacter = await updateCharacter(currentCharacter.id, updates);
      
      // After a successful save, update the local state with the complete character
      // object returned from the database.
      set({ character: savedCharacter, isSaving: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save character';
      set({ saveError: errorMessage, isSaving: false });
      throw err; // Re-throw the error so the calling component knows about it
    }
  },

  _loadGameItems: async () => {
    if (get().isLoadingGameItems || get().allGameItems.length > 0) {
      return;
    }
    set({ isLoadingGameItems: true });
    try {
      const items = await fetchItems();
      set({ allGameItems: items, isLoadingGameItems: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load game items';
      set({ isLoadingGameItems: false, error: errorMessage });
    }
  },

  updateCharacterData: async (updates) => {
    return get()._saveCharacter(updates);
  },

  adjustStat: async (stat, amount) => {
    const character = get().character;
    if (!character) return;

    if (stat === 'current_hp') {
      const currentHP = character.current_hp ?? 0;
      const maxHP = character.max_hp ?? 0;
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
      const maxWP = character.max_wp ?? 0;
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
    const newConditions = {
      ...currentConditions,
      [conditionName]: !currentConditions[conditionName],
    };
    await get()._saveCharacter({ conditions: newConditions });
  },

  performRest: async (type, healerPresent) => {
    const character = get().character;
    if (!character) return;

    const updates: Partial<Character> = {};
    const currentHP = character.current_hp ?? 0;
    const maxHP = character.max_hp ?? 0;
    const currentWP = character.current_wp ?? 0;
    const maxWP = character.max_wp ?? 0;

    const rollD6 = () => Math.floor(Math.random() * 6) + 1;

    if (type === 'round') {
      updates.current_wp = Math.min(maxWP, currentWP + rollD6());
    } else if (type === 'stretch') {
      if (currentHP <= 0) {
        get().setActiveStatusMessage("Cannot take Stretch Rest while dying.", 3000);
        return;
      }
      const hpToHeal = healerPresent ? rollD6() + rollD6() : rollD6();
      updates.current_hp = Math.min(maxHP, currentHP + hpToHeal);
      updates.current_wp = Math.min(maxWP, currentWP + rollD6());

      const currentConditions = character.conditions ?? {};
      const newConditions = { ...currentConditions };
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

  setDeathRollState: async (successes, failures, rallied) => {
    const updates: Partial<Character> = {
      death_rolls_passed: successes,
      death_rolls_failed: failures,
    };
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

    if (attribute === 'CON') {
      updates.max_hp = value;
      updates.current_hp = Math.min(character.current_hp ?? 0, value);
    }
    if (attribute === 'WIL') {
      updates.max_wp = value;
      updates.current_wp = Math.min(character.current_wp ?? 0, value);
    }
    await get()._saveCharacter(updates);
  },

  updateCurrentHP: async (value) => get()._saveCharacter({ current_hp: value }),
  updateWillpowerPoints: async (value) => get()._saveCharacter({ current_wp: value }),
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
    const currentSkillLevels = parseSkillLevels(character.skill_levels);
    const newSkillLevels = { ...currentSkillLevels, [skillName]: level };
    await get()._saveCharacter({ skill_levels: newSkillLevels });
  },

  increaseSkillLevel: async (skillName) => {
    const character = get().character;
    if (!character) return;
    const currentSkillLevels = parseSkillLevels(character.skill_levels);
    const currentLevel = currentSkillLevels[skillName] ?? 0;
    if (currentLevel >= 18) return;

    const newLevel = Math.min(currentLevel + 1, 18);
    const updates: Partial<Character> = {
        skill_levels: { ...currentSkillLevels, [skillName]: newLevel }
    };

    if (character.teacher?.skillUnderStudy === skillName) {
        updates.teacher = null;
    }
    await get()._saveCharacter(updates);
  },

  addHeroicAbility: async (abilityName) => {
    const character = get().character;
    if (!character) return;
    const currentAbilities = character.heroic_abilities || [];
    if (!currentAbilities.includes(abilityName)) {
      await get()._saveCharacter({ heroic_abilities: [...currentAbilities, abilityName] });
    }
  },

  learnSpell: async (spellName) => {
    const character = get().character;
    if (!character) return;

    const currentSpells = character.spells ?? { known: [] };
    const allKnownSpells = currentSpells.known || [];

    if (!allKnownSpells.includes(spellName)) {
      const newSpells: CharacterSpells = {
        ...currentSpells,
        known: [...allKnownSpells, spellName],
      };
      await get()._saveCharacter({ spells: newSpells });
    }
  },

  setSkillUnderStudy: async (skillName) => {
    await get()._saveCharacter({ teacher: skillName ? { skillUnderStudy: skillName } : null });
  },

  markSkillThisSession: (skillName) => {
    set(state => ({
      markedSkillsThisSession: new Set(state.markedSkillsThisSession).add(skillName)
    }));
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

  fetchActiveEncounter: async (partyId, characterId) => {
    set({ isLoadingEncounter: true, encounterError: null, activeEncounter: null, currentCombatant: null });
    try {
      const latestEncounter = await fetchLatestEncounterForParty(partyId);
      if (latestEncounter) {
        const combatants = await fetchEncounterCombatants(latestEncounter.id);
        const characterCombatant = combatants.find(c => c.character_id === characterId);
        set({ activeEncounter: latestEncounter, currentCombatant: characterCombatant ?? null });
      } else {
        set({ activeEncounter: null, currentCombatant: null });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch active encounter';
      set({ encounterError: errorMessage });
    } finally {
      set({ isLoadingEncounter: false });
    }
  },

  drawInitiative: async () => {
    const { currentCombatant, activeEncounter } = get();
    if (!currentCombatant || !activeEncounter || activeEncounter.status !== 'active') {
      get().setActiveStatusMessage("Cannot draw initiative: Not in an active encounter.", 5000);
      return;
    }

    set({ isSaving: true, saveError: null });
    try {
      const initiativeRoll = Math.floor(Math.random() * 10) + 1;
      const updatedCombatant = await updateCombatant(currentCombatant.id, { initiative_roll: initiativeRoll });
      set({ currentCombatant: updatedCombatant });
      get().setActiveStatusMessage(`Initiative drawn: ${initiativeRoll}`, 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to draw initiative';
      set({ saveError: errorMessage });
      get().setActiveStatusMessage(`Failed to draw initiative: ${errorMessage}`, 5000);
    } finally {
      set({ isSaving: false });
    }
  },

  clearActiveEncounter: () => {
    set({ activeEncounter: null, currentCombatant: null, isLoadingEncounter: false, encounterError: null });
  },
}));