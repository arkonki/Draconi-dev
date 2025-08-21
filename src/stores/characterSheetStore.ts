import { create } from 'zustand';
import { Character, InventoryItem, EquippedItems, AttributeName, CharacterSpells, GameItem } from '../types/character';
import { updateCharacter, fetchCharacterById } from '../lib/api/characters';
import { fetchItems } from '../lib/api/items';
import { parseSkillLevels } from '../lib/utils';
import { parseItemString } from '../lib/inventoryUtils'; // Import the parser
import { fetchLatestEncounterForParty, fetchEncounterCombatants, updateCombatant } from '../lib/api/encounters'; // Import encounter API
import type { Encounter, EncounterCombatant } from '../types/encounter'; // Import encounter types

interface CharacterSheetState {
  character: Character | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveError: string | null;
  markedSkillsThisSession: Set<string>;
  allGameItems: GameItem[];
  isLoadingGameItems: boolean;

  // Status Panel View state
  activeStatusMessage: string | null;
  statusMessageTimeoutId: NodeJS.Timeout | null;

  // Encounter State
  activeEncounter: Encounter | null;
  currentCombatant: EncounterCombatant | null; // The current character's combatant entry
  isLoadingEncounter: boolean;
  encounterError: string | null;

  fetchCharacter: (id: string, userId: string) => Promise<void>;
  setCharacter: (character: Character | null) => void;
  _saveCharacter: (updates: Partial<Character>) => Promise<void>;
  _loadGameItems: () => Promise<void>;
  updateCharacterData: (updates: Partial<Character>) => Promise<void>;

  // Functions used by CharacterSheet.tsx
  adjustStat: (stat: 'current_hp' | 'current_wp', amount: number) => Promise<void>;
  toggleCondition: (conditionName: keyof Character['conditions']) => Promise<void>;
  performRest: (type: 'round' | 'stretch' | 'shift', healerPresent?: boolean) => Promise<void>;

  // Death Roll specific action
  setDeathRollState: (successes: number, failures: number, rallied?: boolean) => Promise<void>;

  // Existing specific updaters
  updateAttribute: (attribute: AttributeName, value: number) => Promise<void>;
  updateCurrentHP: (value: number) => Promise<void>; // Still "deprecated" in favor of updateCharacterData, but now maps to current_hp
  updateWillpowerPoints: (value: number) => Promise<void>; // Name kept, but maps to current_wp
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

  // New actions for Status Panel View
  setActiveStatusMessage: (message: string, duration?: number) => void;
  clearActiveStatusMessage: () => void;

  // New Encounter Actions
  fetchActiveEncounter: (partyId: string, characterId: string) => Promise<void>;
  drawInitiative: () => Promise<void>;
  clearActiveEncounter: () => void; // For when character leaves party or encounter ends
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

  // Encounter State
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
        characterData.equipment = {
          inventory: [],
          equipped: { weapons: [] },
          money: { gold: 0, silver: 0, copper: 0 },
        };
      } else {
        if (!characterData.equipment.inventory) {
          characterData.equipment.inventory = [];
        }
        if (!characterData.equipment.equipped) {
          characterData.equipment.equipped = { weapons: [] };
        }
        if (!characterData.equipment.money) {
          characterData.equipment.money = { gold: 0, silver: 0, copper: 0 };
        }
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

  _saveCharacter: async (updates) => {
    const currentCharacter = get().character;
    if (!currentCharacter?.id) {
      const errorMsg = 'Cannot save: Character ID is missing.';
      set({ saveError: errorMsg });
      throw new Error(errorMsg);
    }
    set({ isSaving: true, saveError: null });
    try {
      const updatedData: Partial<Character> = { ...currentCharacter };

      if (updates.equipment) {
          updatedData.equipment = {
              ...(currentCharacter.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }),
              ...updates.equipment,
              ...(updates.equipment.money && {
                  money: {
                      ...(currentCharacter.equipment?.money || { gold: 0, silver: 0, copper: 0 }),
                      ...updates.equipment.money
                  }
              }),
              ...(updates.equipment.inventory && { inventory: updates.equipment.inventory }),
              ...(updates.equipment.equipped && {
                  equipped: {
                      ...(currentCharacter.equipment?.equipped || { weapons: [] }),
                      ...updates.equipment.equipped,
                      ...(updates.equipment.equipped.weapons && { weapons: updates.equipment.equipped.weapons })
                  }
              }),
          };
      }
      if (updates.attributes) {
          updatedData.attributes = {
              ...(currentCharacter.attributes || { STR: 10, AGL: 10, INT: 10, CHA: 10, CON: 10, WIL: 10 }),
              ...updates.attributes,
          };
      }
      if (updates.conditions) {
          updatedData.conditions = {
              ...(currentCharacter.conditions || { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false }),
              ...updates.conditions,
          };
      }
      
      if ('teacher' in updates) updatedData.teacher = updates.teacher;
      if (updates.skill_levels) updatedData.skill_levels = updates.skill_levels;
      if (updates.spells) updatedData.spells = updates.spells;
      if (updates.heroic_ability) updatedData.heroic_ability = updates.heroic_ability;
      
      // Standardized health/willpower fields to match Character type (current_hp, current_wp)
      if ('max_hp' in updates) updatedData.max_hp = updates.max_hp;
      if ('current_hp' in updates) updatedData.current_hp = updates.current_hp;
      if ('temporary_hp' in updates) updatedData.temporary_hp = updates.temporary_hp;
      if ('max_wp' in updates) updatedData.max_wp = updates.max_wp;
      if ('current_wp' in updates) updatedData.current_wp = updates.current_wp;

      if ('death_rolls_passed' in updates) updatedData.death_rolls_passed = updates.death_rolls_passed;
      if ('death_rolls_failed' in updates) updatedData.death_rolls_failed = updates.death_rolls_failed;
      if ('is_rallied' in updates) updatedData.is_rallied = updates.is_rallied;
      if ('notes' in updates) updatedData.notes = updates.notes;
      if ('experience' in updates) updatedData.experience = updates.experience;
      if ('reputation' in updates) updatedData.reputation = updates.reputation;
      if ('corruption' in updates) updatedData.corruption = updates.corruption;
      if ('appearance' in updates) updatedData.appearance = updates.appearance;
      if ('name' in updates) updatedData.name = updates.name;
      if ('class' in updates) updatedData.class = updates.class; 
      if ('race' in updates) updatedData.race = updates.race;   
      if ('level' in updates) updatedData.level = updates.level;
      if ('background' in updates) updatedData.background = updates.background;
      if ('alignment' in updates) updatedData.alignment = updates.alignment;
      if ('experience_points' in updates) updatedData.experience_points = updates.experience_points;
      if ('armor_class' in updates) updatedData.armor_class = updates.armor_class;
      if ('speed' in updates) updatedData.speed = updates.speed;
      if ('proficiency_bonus' in updates) updatedData.proficiency_bonus = updates.proficiency_bonus;
      if ('age' in updates) updatedData.age = updates.age;
      if ('kin' in updates) updatedData.kin = updates.kin;
      if ('profession' in updates) updatedData.profession = updates.profession;
      if ('mementos' in updates) updatedData.mementos = updates.mementos;
      if ('weak_spot' in updates) updatedData.weak_spot = updates.weak_spot;
      if ('prepared_spells' in updates) {
        updatedData.prepared_spells = updates.prepared_spells;
      }

      const savedCharacter = await updateCharacter(currentCharacter.id, updatedData as Partial<Character>);
      set({ character: savedCharacter, isSaving: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save character';
      set({ saveError: errorMessage, isSaving: false });
      throw err;
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
      set({ isLoadingGameItems: false, error: errorMessage, allGameItems: [] });
    }
  },

  updateCharacterData: async (updates) => {
    return get()._saveCharacter(updates);
  },

  adjustStat: async (stat, amount) => {
    const character = get().character;
    if (!character) return;

    let newValue: number;
    if (stat === 'current_hp') {
      const currentHP = character.current_hp; 
      const maxHP = character.max_hp;       
      newValue = Math.max(0, Math.min(maxHP, currentHP + amount));

      if (newValue !== currentHP) {
        const updates: Partial<Character> = { current_hp: newValue };
        if (character.current_hp <= 0 && newValue > 0) {
          updates.death_rolls_passed = 0;
          updates.death_rolls_failed = 0;
		      updates.is_rallied = false;
        }
        await get()._saveCharacter(updates);
      }
    } else if (stat === 'current_wp') {
      const currentWP = character.current_wp; 
      const maxWP = character.max_wp;       
      newValue = Math.max(0, Math.min(maxWP, currentWP + amount));
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
    const currentHP = character.current_hp;
    const maxHP = character.max_hp;
    const currentWP = character.current_wp;
    const maxWP = character.max_wp;

    const rollD6 = () => Math.floor(Math.random() * 6) + 1;

    if (type === 'round') {
      updates.current_wp = Math.min(maxWP, currentWP + rollD6());
    } else if (type === 'stretch') {
      if (currentHP <= 0) {
        set({ saveError: "Cannot take Stretch Rest while dying." });
        setTimeout(() => set(state => ({ ...state, saveError: state.saveError === "Cannot take Stretch Rest while dying." ? null : state.saveError })), 3000);
        return;
      }
      const hpToHeal = healerPresent ? rollD6() + rollD6() : rollD6();
      updates.current_hp = Math.min(maxHP, currentHP + hpToHeal);
      updates.current_wp = Math.min(maxWP, currentWP + rollD6());

      const currentConditions = character.conditions ?? { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false };
      const conditionKeys = Object.keys(currentConditions) as Array<keyof Character['conditions']>;
      let newConditions = { ...currentConditions };
      let conditionHealedThisRest = false;
      for (const key of conditionKeys) {
        if (newConditions[key] === true) {
          newConditions[key] = false;
          conditionHealedThisRest = true;
          break;
        }
      }
      if (conditionHealedThisRest) {
        updates.conditions = newConditions;
      }
    } else if (type === 'shift') {
      updates.current_hp = maxHP;
      updates.current_wp = maxWP;

      const newConditions = { ...(character.conditions ?? {}) };
      for (const key in newConditions) {
        newConditions[key as keyof Character['conditions']] = false;
      }
      updates.conditions = newConditions;
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
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const newAttributes = { ...(currentCharacter.attributes || { STR: 10, AGL: 10, INT: 10, CHA: 10, CON: 10, WIL: 10 }), [attribute]: value };
    const updates: Partial<Character> = { attributes: newAttributes };

    if (attribute === 'CON') {
      updates.max_hp = value; 
      updates.current_hp = Math.min(currentCharacter.current_hp, value);
    }
    if (attribute === 'WIL') {
      updates.max_wp = value; 
      updates.current_wp = Math.min(currentCharacter.current_wp, value);
    }
    await get()._saveCharacter(updates);
  },

  updateCurrentHP: async (value) => { 
    await get()._saveCharacter({ current_hp: value });
  },

  updateWillpowerPoints: async (value) => { // Name kept, but now maps to current_wp
    await get()._saveCharacter({ current_wp: value });
  },

  updateConditions: async (conditions) => {
    await get()._saveCharacter({ conditions });
  },

  updateInventory: async (inventory) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const newEquipment = { ...(currentCharacter.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }), inventory };
    await get()._saveCharacter({ equipment: newEquipment });
  },

  updateEquipped: async (equipped) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const newEquipment = { ...(currentCharacter.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }), equipped };
    await get()._saveCharacter({ equipment: newEquipment });
  },

  updateMoney: async (money) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const newEquipment = { ...(currentCharacter.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } }), money };
    await get()._saveCharacter({ equipment: newEquipment });
  },

  updateNotes: async (notes) => {
    await get()._saveCharacter({ notes });
  },

  updateExperience: async (value) => {
    await get()._saveCharacter({ experience: value });
  },

  updateReputation: async (value) => {
    await get()._saveCharacter({ reputation: value });
  },

  updateCorruption: async (value) => {
    await get()._saveCharacter({ corruption: value });
  },

  updateDeathRolls: async (type, value) => {
    const character = get().character;
    if (!character) return;
    if (type === 'failed') {
      await get().setDeathRollState(character.death_rolls_passed ?? 0, value, character.is_rallied);
    } else {
      await get().setDeathRollState(value, character.death_rolls_failed ?? 0, character.is_rallied);
    }
  },

  updateAppearance: async (appearance) => {
    await get()._saveCharacter({ appearance });
  },

  updateSkillLevel: async (skillName, level) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const currentSkillLevels = parseSkillLevels(currentCharacter.skill_levels);
    const newSkillLevels = { ...currentSkillLevels, [skillName]: level };
    await get()._saveCharacter({ skill_levels: newSkillLevels });
  },

  increaseSkillLevel: async (skillName) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const currentSkillLevels = parseSkillLevels(currentCharacter.skill_levels);
    const currentLevel = currentSkillLevels[skillName] ?? 0;
    if (currentLevel >= 18) return;

    const newLevel = Math.min(currentLevel + 1, 18);
    const updates: Partial<Character> = {
        skill_levels: { ...currentSkillLevels, [skillName]: newLevel }
    };

    if (currentCharacter.teacher?.skillUnderStudy === skillName) {
        updates.teacher = null;
    }
    await get()._saveCharacter(updates);
  },

  addHeroicAbility: async (abilityName) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const currentAbilities = currentCharacter.heroic_ability || [];
    if (!currentAbilities.includes(abilityName)) {
      const newAbilities = [...currentAbilities, abilityName];
      await get()._saveCharacter({ heroic_ability: newAbilities });
    }
  },

  learnSpell: async (spellName) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;

    const currentSpellsData = currentCharacter.spells
      ? { ...currentCharacter.spells }
      : { school: null, general: [] };

    if (!currentSpellsData.general) {
        currentSpellsData.general = [];
    }
    if (currentSpellsData.school && !currentSpellsData.school.spells) {
        currentSpellsData.school.spells = [];
    }

    const isKnownInGeneral = currentSpellsData.general.includes(spellName);
    const isKnownInSchool = currentSpellsData.school?.spells?.includes(spellName) ?? false;

    if (!isKnownInGeneral && !isKnownInSchool) {
      const newGeneralSpells = [...currentSpellsData.general, spellName];
      const newSpells: CharacterSpells = {
        ...currentSpellsData,
        general: newGeneralSpells,
      };
      await get()._saveCharacter({ spells: newSpells });
    }
  },

  setSkillUnderStudy: async (skillName) => {
    const currentCharacter = get().character;
    if (!currentCharacter) return;
    const newTeacher = skillName ? { skillUnderStudy: skillName } : null;
    await get()._saveCharacter({ teacher: newTeacher });
  },

  markSkillThisSession: (skillName) => {
    set(state => ({
      markedSkillsThisSession: new Set(state.markedSkillsThisSession).add(skillName)
    }));
  },

  clearMarkedSkillsThisSession: () => {
    set({ markedSkillsThisSession: new Set() });
  },

  setActiveStatusMessage: (message, duration = 30000) => {
    const existingTimeoutId = get().statusMessageTimeoutId;
    if (existingTimeoutId) {
      clearTimeout(existingTimeoutId);
    }
    set({ activeStatusMessage: message });
    const newTimeoutId = setTimeout(() => {
      set({ activeStatusMessage: null, statusMessageTimeoutId: null });
    }, duration);
    set({ statusMessageTimeoutId: newTimeoutId });
  },

  clearActiveStatusMessage: () => {
    const existingTimeoutId = get().statusMessageTimeoutId;
    if (existingTimeoutId) {
      clearTimeout(existingTimeoutId);
    }
    set({ activeStatusMessage: null, statusMessageTimeoutId: null });
  },

  fetchActiveEncounter: async (partyId, characterId) => {
    set({ isLoadingEncounter: true, encounterError: null, activeEncounter: null, currentCombatant: null });
    try {
      const latestEncounter = await fetchLatestEncounterForParty(partyId);

      if (latestEncounter) {
        set({ activeEncounter: latestEncounter });
        const combatants = await fetchEncounterCombatants(latestEncounter.id);
        const characterCombatant = combatants.find(c => c.character_id === characterId);
        set({ currentCombatant: characterCombatant ?? null }); 
      } else {
        set({ activeEncounter: null, currentCombatant: null });
      }
      set({ isLoadingEncounter: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch active encounter';
      set({ encounterError: errorMessage, isLoadingEncounter: false });
    }
  },

  drawInitiative: async () => {
    const { currentCombatant, activeEncounter } = get();
    if (!currentCombatant || !activeEncounter || activeEncounter.status !== 'active') {
      get().setActiveStatusMessage("Cannot draw initiative: Not in an active encounter or not added as a combatant.", 5000);
      return;
    }

    set({ isSaving: true, saveError: null }); 
    try {
      const initiativeRoll = Math.floor(Math.random() * 10) + 1;
      const updatedCombatant = await updateCombatant(currentCombatant.id, { initiative_roll: initiativeRoll });

      set(state => ({
        currentCombatant: updatedCombatant,
        isSaving: false,
        saveError: null,
      }));
       get().setActiveStatusMessage(`Initiative drawn: ${initiativeRoll}`, 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to draw initiative';
      set({ saveError: errorMessage, isSaving: false });
      get().setActiveStatusMessage(`Failed to draw initiative: ${errorMessage}`, 5000);
    }
  },

  clearActiveEncounter: () => {
    set({ activeEncounter: null, currentCombatant: null, isLoadingEncounter: false, encounterError: null });
  },
}));
