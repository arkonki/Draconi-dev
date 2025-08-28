// src/components/character/AdvancementSystem.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Character, Ability, AttributeName, SkillRequirement, CharacterSpells } from '../../types/character';
import { Spell, MagicSchool, SpellPrerequisite, SinglePrerequisite, LogicalPrerequisite } from '../../types/magic';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { useDice, RollHistoryEntry } from '../dice/DiceContext';
import { fetchHeroicAbilities } from '../../lib/api/abilities';
import { fetchSpells, fetchMagicSchools } from '../../lib/api/magic';
import { GraduationCap, AlertCircle, Check, Star, Info, Dices, BookOpen, ChevronLeft, ChevronRight, Loader2, Award, X, Zap, Wand2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

// --- Constants and Helpers ---

type AdvancementStep =
  | 'initial'
  | 'enterMarks'
  | 'selectSkills'
  | 'rollSkills'
  | 'selectAbility'
  | 'selectStudyType'
  | 'studyTeacherSelectSkill'
  | 'studyTeacherRollSkill'
  | 'studyMagicSelectSpell'
  | 'studyMagicSelectSchool'
  | 'studyMagicRollSchool'
  | 'finished';

type RollCompletionData = Omit<RollHistoryEntry, 'id' | 'timestamp'>;

interface SkillDisplayInfo {
  name: string;
  attribute: AttributeName;
  level: number;
  isTrained: boolean;
}

const MAGE_SKILLS: Record<string, AttributeName> = {
  'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL',
};

const getSkillLevelFromStore = (skillName: string): number => {
  const currentStoreCharacter = useCharacterSheetStore.getState().character;
  const skillLevels = currentStoreCharacter?.skill_levels || {};
  return skillLevels?.[skillName] ?? 0;
};

function getCharacterSkillInfo(character: Character): SkillDisplayInfo[] {
  const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR',
    ...MAGE_SKILLS,
  };

  const skillInfoList: SkillDisplayInfo[] = [];
  const characterSkills = character.skill_levels || {};

  for (const skillName in characterSkills) {
    const attribute = skillAttributeMap[skillName];
    if (!attribute) {
      console.warn(`[AdvancementSystem] Skill "${skillName}" exists on character but is missing from the attribute map.`);
      continue;
    }

    const level = characterSkills[skillName];
    const isTrained = character.trainedSkills?.includes(skillName) ?? false;

    skillInfoList.push({
      name: skillName,
      attribute: attribute,
      level: level,
      isTrained: isTrained,
    });
  }

  skillInfoList.sort((a, b) => a.name.localeCompare(b.name));
  return skillInfoList;
}


const checkAbilityRequirements = (ability: Ability, character: Character | null): boolean => {
  if (!character) return false;
  if (!ability.requirement) return true;

  const requirements = ability.requirement;
  const characterAttributes = character.attributes;
  const characterSkillLevels = character.skill_levels || {};
  
  const upperCaseAttributes = Object.fromEntries(
    Object.entries(characterAttributes).map(([k, v]) => [k.toUpperCase(), v])
  );

  if (typeof requirements === 'string') {
    const parts = requirements.split(' ');
    if (parts.length === 2) {
      const reqName = parts[0].toUpperCase();
      const reqValue = parseInt(parts[1], 10);
      if (!isNaN(reqValue)) {
        if (reqName in upperCaseAttributes) {
          return upperCaseAttributes[reqName as keyof typeof upperCaseAttributes] >= reqValue;
        }
        const skillLevel = Object.entries(characterSkillLevels).find(([name]) => name.toUpperCase() === reqName)?.[1];
        if (skillLevel !== undefined) {
          return skillLevel >= reqValue;
        }
      }
    }
    return false;
  } else if (typeof requirements === 'object' && requirements !== null) {
     for (const [reqName, reqValue] of Object.entries(requirements)) {
       if (reqValue === null || reqValue === undefined) continue;
       const upperReqName = reqName.toUpperCase();
       if (upperReqName in upperCaseAttributes) {
         if (upperCaseAttributes[upperReqName as keyof typeof upperCaseAttributes] < reqValue) {
           return false;
         }
       } else {
         const skillLevel = Object.entries(characterSkillLevels).find(([name]) => name.toUpperCase() === upperReqName)?.[1];
         if (skillLevel === undefined || skillLevel < reqValue) {
           return false;
         }
       }
     }
     return true;
  }
  return false;
};

// --- REPLACED getKnownSpellNamesUpper FUNCTION ---
const getKnownSpellNamesUpper = (characterSpells: CharacterSpells | null): string[] => {
  if (!characterSpells) return [];

  const schoolSpells = characterSpells.school?.spells ?? [];
  const generalSpells = characterSpells.general ?? [];
  
  return Array.from(new Set([...schoolSpells, ...generalSpells].map(s => s.toUpperCase())));
};

const checkSpellPrerequisite = (
  prerequisiteString: string | null,
  character: Character,
  characterSchoolName: string | null,
  allMagicSchools: MagicSchool[]
): boolean => {
  if (!prerequisiteString) return true;

  const knownSpellsUpper = getKnownSpellNamesUpper(character.spells);
  const characterSkillLevels = character.skill_levels || {};
  const characterAttributes = character.attributes;

  const evaluateSinglePrerequisite = (prereq: SinglePrerequisite): boolean => {
    let result = false;
    switch (prereq.type) {
      case "spell":
        result = knownSpellsUpper.includes(prereq.name.toUpperCase());
        break;
      case "school":
        result = characterSchoolName?.toUpperCase() === prereq.name.toUpperCase();
        break;
      case "anySchool":
        result = !!character.magicSchool;
        break;
      case "skill":
        const skillLevel = characterSkillLevels[prereq.name];
        result = skillLevel !== undefined && skillLevel >= prereq.value;
        break;
      case "attribute":
        const attrValue = characterAttributes[prereq.name.toUpperCase() as AttributeName];
        result = attrValue !== undefined && attrValue >= prereq.value;
        break;
    }
    return prereq.negate ? !result : result;
  };
  
  let evaluateRecursive: (prereq: SpellPrerequisite) => boolean;

  const evaluateLogicalPrerequisite = (prereq: LogicalPrerequisite): boolean => {
    const operator = prereq.operator.toUpperCase();
    if (operator === "AND") {
      const result = prereq.conditions.every(cond => evaluateRecursive(cond));
      return prereq.negate ? !result : result;
    } else if (operator === "OR") {
      const result = prereq.conditions.some(cond => evaluateRecursive(cond));
      return prereq.negate ? !result : result;
    }
    return false;
  };

  evaluateRecursive = (prereq: SpellPrerequisite): boolean => {
    if ("operator" in prereq) {
      return evaluateLogicalPrerequisite(prereq as LogicalPrerequisite);
    }
    return evaluateSinglePrerequisite(prereq as SinglePrerequisite);
  };

  let parsedReq: SpellPrerequisite | null = null;
  try {
    if (prerequisiteString.trim().startsWith("{")) {
        parsedReq = JSON.parse(prerequisiteString) as SpellPrerequisite;
    }
  } catch (e) {
    // Fallback proceeds
  }

  if (parsedReq) {
    return evaluateRecursive(parsedReq);
  }

  const schoolNamesUpper = allMagicSchools.map(s => s.name.toUpperCase());
  const currentCharacterSchoolName = characterSchoolName;

  const evaluateOldCondition = (condition: string): boolean => {
    const trimmed = condition.trim().toUpperCase();
    if (trimmed === 'ANY SCHOOL OF MAGIC') return !!character.magicSchool;
    if (knownSpellsUpper.includes(trimmed)) return true;
    if (schoolNamesUpper.includes(trimmed)) return currentCharacterSchoolName?.toUpperCase() === trimmed;
    const parts = trimmed.split(' ');
    if (parts.length === 2) {
      const [namePart, valuePart] = parts;
      const n = parseInt(valuePart, 10);
      if (!isNaN(n)) {
        const attrKey = Object.keys(characterAttributes).find(k => k.toUpperCase() === namePart);
        if (attrKey) return characterAttributes[attrKey as AttributeName] >= n;
        const skillKey = Object.keys(characterSkillLevels).find(k => k.toUpperCase() === namePart);
        if (skillKey) return characterSkillLevels[skillKey] >= n;
      }
    }
    return false;
  };

  const evaluateOldAndGroup = (andGroup: string): boolean => {
    return andGroup.trim().split(/ AND /i).every(evaluateOldCondition);
  };

  return prerequisiteString.trim().split(/ OR /i).some(evaluateOldAndGroup);
};


interface AdvancementSystemProps {
  character: Character;
  onClose: () => void;
}

export function AdvancementSystem({ character: initialCharacter, onClose }: AdvancementSystemProps) {
  const {
    character: storeCharacter,
    markedSkillsThisSession,
    clearMarkedSkillsThisSession,
    increaseSkillLevel,
    addHeroicAbility,
    setSkillUnderStudy,
    learnSpell,
    addMagicSchool,
    isSaving,
    saveError,
  } = useCharacterSheetStore();

  const { toggleDiceRoller } = useDice();

  const [step, setStep] = useState<AdvancementStep>('initial');
  const [error, setError] = useState<string | null>(null);
  const [advancementMarks, setAdvancementMarks] = useState<number>(0);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [skillsToRoll, setSkillsToRoll] = useState<string[]>([]);
  const [currentSkillIndex, setCurrentSkillIndex] = useState<number>(0);
  const [rollResult, setRollResult] = useState<string | null>(null);
  const [skillJustReached18, setSkillJustReached18] = useState<string | null>(null);
  const [availableAbilities, setAvailableAbilities] = useState<Ability[]>([]);
  const [loadingAbilities, setLoadingAbilities] = useState<boolean>(false);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const [studySkillSelected, setStudySkillSelected] = useState<string | null>(null);
  const [studyRollResult, setStudyRollResult] = useState<string | null>(null);
  const [magicSchoolName, setMagicSchoolName] = useState<string | null>(null);
  const [allSpells, setAllSpells] = useState<Spell[]>([]);
  const [allMagicSchools, setAllMagicSchools] = useState<MagicSchool[]>([]);
  const [learnableSpells, setLearnableSpells] = useState<Spell[]>([]);
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [selectedMagicSchool, setSelectedMagicSchool] = useState<MagicSchool | null>(null);
  const [loadingMagicData, setLoadingMagicData] = useState<boolean>(false);


  const characterForInfo = storeCharacter || initialCharacter;
  const characterSkillsInfo = useMemo(() => {
      if (!characterForInfo) return [];
      return getCharacterSkillInfo(characterForInfo);
  }, [characterForInfo]);

  const skillCurrentlyUnderStudy = storeCharacter?.teacher?.skillUnderStudy;


  const resetState = () => {
    setError(null);
    setRollResult(null);
    setStudyRollResult(null);
    setAdvancementMarks(0);
    setSelectedSkills(new Set());
    setSkillsToRoll([]);
    setCurrentSkillIndex(0);
    setSkillJustReached18(null);
    setSelectedAbility(null);
    setStudySkillSelected(null);
    setLearnableSpells([]);
    setSelectedSpell(null);
    setSelectedMagicSchool(null);
    setLoadingMagicData(false);
    setLoadingAbilities(false);
  };

  const handleStartEndSession = () => {
    resetState();
    setStep('enterMarks');
  };

  const handleStartStudy = () => {
    resetState();
    setStep('selectStudyType');
  };

  const loadAndFilterMagicData = async () => {
      if (!storeCharacter || !storeCharacter.magicSchool) {
          setError("Character has no magic school assigned.");
          setStep('selectStudyType');
          return;
      }

      setLoadingMagicData(true);
      setError(null);
      try {
          let currentSchools = allMagicSchools.length > 0 ? allMagicSchools : await fetchMagicSchools();
          if (allMagicSchools.length === 0) setAllMagicSchools(currentSchools);
          
          let currentSpells = allSpells.length > 0 ? allSpells : await fetchSpells();
          if (allSpells.length === 0) setAllSpells(currentSpells);
          
          const schoolObject = currentSchools.find(s => s.id === (storeCharacter.magicSchool as any).id);
          const currentCharacterSchoolName = schoolObject ? schoolObject.name : null;
          setMagicSchoolName(currentCharacterSchoolName);

          const knownSpellNamesUpper = getKnownSpellNamesUpper(storeCharacter.spells);

          const filteredSpells = currentSpells.filter(spell => 
              !knownSpellNamesUpper.includes(spell.name.toUpperCase()) &&
              checkSpellPrerequisite(spell.prerequisite, storeCharacter, currentCharacterSchoolName, currentSchools)
          );

          setLearnableSpells(filteredSpells);
          setStep('studyMagicSelectSpell');

      } catch (err) {
          console.error("Error loading magic data:", err);
          setError(err instanceof Error ? err.message : "Failed to load magic study data.");
          setStep('selectStudyType');
      } finally {
          setLoadingMagicData(false);
      }
  };


  const handleSelectStudyType = async (type: 'teacher' | 'magic' | 'learnSchool') => {
    if (type === 'teacher') {
      setStep('studyTeacherSelectSkill');
    } else if (type === 'magic') {
      loadAndFilterMagicData();
    } else if (type === 'learnSchool') {
      setLoadingMagicData(true);
      setError(null);
      try {
        const schools = await fetchMagicSchools();
        setAllMagicSchools(schools);
        setStep('studyMagicSelectSchool');
      } catch (err) {
        console.error("Error loading magic schools:", err);
        setError(err instanceof Error ? err.message : "Failed to load magic schools.");
      } finally {
        setLoadingMagicData(false);
      }
    }
  };

  const handleMarksEntered = (e: React.FormEvent) => {
    e.preventDefault();
    if (advancementMarks > 0) {
      const initialSelection = new Set<string>();
      let count = 0;
      const availableSkillNames = characterSkillsInfo.map(s => s.name);
      for (const skill of markedSkillsThisSession) {
        if (count < advancementMarks && availableSkillNames.includes(skill)) {
          initialSelection.add(skill);
          count++;
        }
      }
      setSelectedSkills(initialSelection);
      setError(null);
      setStep('selectSkills');
    } else {
      setError("Please enter at least one Advancement Mark.");
    }
  };

  const handleSkillSelectionChange = (skillName: string) => {
    setSelectedSkills(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(skillName)) {
        newSelection.delete(skillName);
      } else if (newSelection.size < advancementMarks) {
        newSelection.add(skillName);
      }
      return newSelection;
    });
  };

  const handleSkillsSelected = () => {
    if (selectedSkills.size !== advancementMarks) {
      setError(`Please select exactly ${advancementMarks} skill(s).`);
      return;
    }
    setError(null);
    setSkillsToRoll(Array.from(selectedSkills));
    setCurrentSkillIndex(0);
    setRollResult(null);
    setStep('rollSkills');
  };

  const handleRollComplete = useCallback(async (resultEntry: RollCompletionData) => {
    if (!storeCharacter || !resultEntry.results || resultEntry.results.length === 0) {
        setRollResult("Error: Roll failed due to missing data.");
        toggleDiceRoller();
        return;
    }
    const { value: rollValue } = resultEntry.results[0];
    const { skillName, targetValue } = resultEntry;

    if (!skillName || targetValue === undefined) {
      setRollResult("Error: Roll context missing skill information.");
      toggleDiceRoller();
      return;
    }

    const success = rollValue > targetValue;
    let resultText = `Rolled ${rollValue} vs ${skillName} (Target > ${targetValue}). `;

    if (success) {
      resultText += "Success! Skill increased.";
      await increaseSkillLevel(skillName);
      const newLevel = getSkillLevelFromStore(skillName); 
      resultText += ` New Level: ${newLevel}.`;
      if (newLevel === 18 && targetValue < 18) {
        setSkillJustReached18(skillName);
        resultText += " Reached level 18!";
      }
    } else {
      resultText += "Failed to increase skill.";
    }
    setRollResult(resultText);
    toggleDiceRoller();
  }, [storeCharacter, increaseSkillLevel, toggleDiceRoller]);


  const performSkillRoll = (skillName: string, rollContext: 'endSession' | 'study') => {
    const currentLevel = getSkillLevelFromStore(skillName);
    const resultSetter = rollContext === 'study' ? setStudyRollResult : setRollResult;
    if (currentLevel >= 18) {
      resultSetter(`Skill ${skillName} is already at max level (18).`);
      return;
    }
    resultSetter(null);
    toggleDiceRoller({
      rollMode: 'advancementRoll',
      targetValue: currentLevel,
      skillName: skillName,
      description: `Advancement Roll: ${skillName} (d20 vs > ${currentLevel})`,
      onRollComplete: rollContext === 'study' ? handleStudyRollComplete : handleRollComplete,
    });
  };

  const handleManualAdvance = async (skillName: string, context: 'endSession' | 'study') => {
    const resultSetter = context === 'study' ? setStudyRollResult : setRollResult;
    if (!storeCharacter) {
        resultSetter("Error: Character data not available.");
        return;
    }
    const currentLevel = getSkillLevelFromStore(skillName);
    if (currentLevel >= 18) {
      resultSetter(`Skill ${skillName} is already at max level (18).`);
      return;
    }
    resultSetter(null);

    let resultText = `Manually advanced ${skillName}. Skill increased.`;
    await increaseSkillLevel(skillName);
    const newLevel = getSkillLevelFromStore(skillName);
    resultText += ` New Level: ${newLevel}.`;
    if (newLevel === 18 && currentLevel < 18) {
        if (context === 'endSession') setSkillJustReached18(skillName);
        resultText += " Reached level 18!";
    }
    resultSetter(resultText);
  };

  const handleNextSkill = () => {
    setRollResult(null);
    if (skillJustReached18) {
      fetchAndFilterAbilities();
      setStep('selectAbility');
    } else if (currentSkillIndex < skillsToRoll.length - 1) {
      setCurrentSkillIndex(prev => prev + 1);
    } else {
      handleFinishSession();
    }
  };

  const fetchAndFilterAbilities = async () => {
    setLoadingAbilities(true);
    setError(null);
    try {
      const allAbilities = await fetchHeroicAbilities();
      const currentCharacterState = useCharacterSheetStore.getState().character; 

      if (!currentCharacterState) throw new Error("Character data not available for ability filtering.");
      
      const currentKnownAbilities = new Set((currentCharacterState.heroic_abilities || []).map(a => a.toUpperCase()));
      const filtered = allAbilities.filter(ability => 
          !currentKnownAbilities.has(ability.name.toUpperCase()) &&
          (!ability.kin || ability.kin.toLowerCase() === currentCharacterState.kin?.toLowerCase()) &&
          (!ability.profession || ability.profession.toLowerCase() === currentCharacterState.profession?.toLowerCase()) &&
          checkAbilityRequirements(ability, currentCharacterState)
      );
      setAvailableAbilities(filtered);
    } catch (err) {
      console.error("Error fetching abilities:", err);
      setError(err instanceof Error ? err.message : "Failed to load heroic abilities.");
    } finally {
      setLoadingAbilities(false);
    }
  };


  const handleSelectAbility = (ability: Ability) => {
    setSelectedAbility(ability);
  };

  const handleConfirmAbilitySelection = async () => {
    if (!selectedAbility) {
      setError("Please select a heroic ability.");
      return;
    }
    setError(null);
    await addHeroicAbility(selectedAbility.name);
    setSkillJustReached18(null);
    setSelectedAbility(null);

    if (currentSkillIndex < skillsToRoll.length - 1) {
      setCurrentSkillIndex(prev => prev + 1);
      setStep('rollSkills');
    } else {
      handleFinishSession();
    }
  };

  const handleFinishSession = () => {
    clearMarkedSkillsThisSession();
    setStep('finished');
  };

  const handleStudySkillSelection = (skillName: string) => {
    setStudySkillSelected(skillName);
  };

  const handleConfirmStudySkill = async () => {
    if (!studySkillSelected) {
      setError("Please select a skill to study.");
      return;
    }
    setError(null);
    setStudyRollResult(null);
    await setSkillUnderStudy(studySkillSelected);
    setStep('studyTeacherRollSkill');
  };

  const handleStudyRollComplete = useCallback(async (resultEntry: RollCompletionData) => {
    if (!storeCharacter || !resultEntry.results || !resultEntry.results.length) {
        setStudyRollResult("Error: Roll failed due to missing data.");
        toggleDiceRoller();
        return;
    }
    const { value: rollValue } = resultEntry.results[0];
    const { skillName, targetValue } = resultEntry;
    if (!skillName || targetValue === undefined) {
      setStudyRollResult("Error: Roll context missing skill information.");
      toggleDiceRoller();
      return;
    }

    const success = rollValue > targetValue;
    let resultText = `Studied ${skillName}. Rolled ${rollValue} vs Target > ${targetValue}. `;

    if (success) {
      resultText += "Success! Skill increased.";
      await increaseSkillLevel(skillName);
      const newLevel = getSkillLevelFromStore(skillName);
      resultText += ` New Level: ${newLevel}.`;
      if (newLevel === 18 && targetValue < 18) {
        resultText += " Reached level 18!";
      }
    } else {
      resultText += "Failed to increase skill this time.";
    }
    setStudyRollResult(resultText);
    toggleDiceRoller();
  }, [storeCharacter, increaseSkillLevel, toggleDiceRoller]);
  
  const handleLearnSchoolRollComplete = useCallback(async (resultEntry: RollCompletionData) => {
    if (!storeCharacter || !resultEntry.results?.length || !selectedMagicSchool) {
        setStudyRollResult("Error: Roll failed due to missing data.");
        toggleDiceRoller();
        return;
    }
    const { value: rollValue } = resultEntry.results[0];
    const targetInt = resultEntry.targetValue;

    if (targetInt === undefined) {
        setStudyRollResult("Error: Character INT value not found for roll.");
        toggleDiceRoller();
        return;
    }

    const success = rollValue > targetInt;
    let resultText = `Attempting to learn ${selectedMagicSchool.name}. Rolled ${rollValue} vs INT > ${targetInt}. `;

    if (success) {
        resultText += `Success! You have learned the basics of ${selectedMagicSchool.name}. The skill is added at your base chance of ${targetInt}.`;
        await addMagicSchool(selectedMagicSchool, targetInt);
    } else {
        resultText += "Failure. You must study for another week to try again.";
    }
    setStudyRollResult(resultText);
    toggleDiceRoller();
  }, [storeCharacter, selectedMagicSchool, addMagicSchool, toggleDiceRoller]);

  const performLearnSchoolRoll = () => {
      if (!storeCharacter || !selectedMagicSchool) return;
      const targetInt = storeCharacter.attributes.INT;
      setStudyRollResult(null);
      toggleDiceRoller({
          rollMode: 'advancementRoll',
          targetValue: targetInt,
          skillName: `Learn ${selectedMagicSchool.name}`,
          description: `Learn Magic School: ${selectedMagicSchool.name} (d20 vs > ${targetInt})`,
          onRollComplete: handleLearnSchoolRollComplete,
      });
  };

  const handleManualLearnSchool = async () => {
      if (!storeCharacter || !selectedMagicSchool) return;
      const targetInt = storeCharacter.attributes.INT;
      setStudyRollResult(null);
      let resultText = `Manually learned ${selectedMagicSchool.name}. Success! The skill is added at your base chance of ${targetInt}.`;
      await addMagicSchool(selectedMagicSchool, targetInt);
      setStudyRollResult(resultText);
  };

  const handleSelectSpell = (spell: Spell) => {
    setSelectedSpell(spell);
  };

  // --- MODIFIED handleConfirmLearnSpell ---
  const handleConfirmLearnSpell = async () => {
    if (!selectedSpell) {
      setError("Please select a spell to learn.");
      return;
    }
    setError(null);
    try {
      await learnSpell(selectedSpell); // Pass the full spell object
      onClose(); 
    } catch (err) {
      console.error("Error learning spell:", err);
      setError(err instanceof Error ? err.message : "Failed to learn the spell.");
    }
  };

  const handleFinishStudy = () => {
    setStudySkillSelected(null);
    setStudyRollResult(null);
    setSelectedSpell(null);
    setSelectedMagicSchool(null);
    setLearnableSpells([]);
    onClose();
  };
  
  // Omitted renderStepContent for brevity, no changes needed inside it
  
  const renderStepContent = () => {
    if (!characterForInfo && step !== 'initial') { 
        return <LoadingSpinner text="Loading character data..." />;
    }

    switch (step) {
      case 'initial':
        return (
          <div className="space-y-4">
            <p className="text-gray-600">Choose an action to proceed.</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={handleStartEndSession} className="flex-1">
                <GraduationCap className="w-5 h-5 mr-2" /> End Session & Advance
              </Button>
              <Button onClick={handleStartStudy} variant="outline" className="flex-1">
                <BookOpen className="w-5 h-5 mr-2" /> Study
              </Button>
            </div>
          </div>
        );

      case 'enterMarks':
        return (
          <form onSubmit={handleMarksEntered} className="space-y-4">
            <h4 className="font-medium text-gray-800">End Session Advancement</h4>
            <label htmlFor="advancementMarks" className="block font-medium text-gray-700">
              How many Advancement Marks did you gain this session?
            </label>
            <input
              type="number"
              id="advancementMarks"
              name="advancementMarks"
              min="1"
              value={advancementMarks === 0 ? '' : advancementMarks}
              onChange={(e) => setAdvancementMarks(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {error && <ErrorMessage message={error} />}
            <div className="flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep('initial')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button type="submit" disabled={advancementMarks <= 0}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </form>
        );

      case 'selectSkills':
        if (!characterForInfo) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">
              Select {advancementMarks} skill(s) to attempt advancement:
            </h4>
            <div className="max-h-72 overflow-y-auto space-y-1 border rounded p-3 bg-gray-50">
              {characterSkillsInfo.length === 0 ? (
                 <p className="text-gray-500 italic">No skills found for this character.</p>
              ) : (
                characterSkillsInfo.map(skill => {
                  const currentLevel = getSkillLevelFromStore(skill.name); 
                  const isMaxLevel = currentLevel >= 18;
                  const isUnderStudy = skill.name === skillCurrentlyUnderStudy;
                  return (
                    <label key={skill.name} className={`flex items-center space-x-3 p-2 rounded ${isMaxLevel ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(skill.name)}
                        onChange={() => handleSkillSelectionChange(skill.name)}
                        disabled={isMaxLevel || (!selectedSkills.has(skill.name) && selectedSkills.size >= advancementMarks)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className={`flex-grow ${skill.isTrained ? 'font-semibold' : ''}`}>{skill.name}</span>
                      <span className="text-xs text-gray-500">({skill.attribute})</span>
                      <span className="text-sm text-gray-600 font-medium">Lvl {currentLevel}</span>
                      {isMaxLevel && <span className="text-xs text-yellow-600 font-semibold ml-1">(Max)</span>}
                      {markedSkillsThisSession.has(skill.name) && !isMaxLevel && (
                        <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" title="Marked this session (rolled 1 or 20)" />
                      )}
                      {isUnderStudy && (
                         <GraduationCap className="w-4 h-4 text-purple-600 flex-shrink-0 ml-1" title="Currently studying with teacher" />
                      )}
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-sm text-gray-600">Selected: {selectedSkills.size} / {advancementMarks}</p>
            {error && <ErrorMessage message={error} />}
            <div className="flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep('enterMarks')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleSkillsSelected} disabled={selectedSkills.size !== advancementMarks}>
                Confirm Selection <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        );

      case 'rollSkills':
        if (skillsToRoll.length === 0 || !characterForInfo) return <LoadingSpinner text="Preparing skill roll..." />;
        const currentSkill = skillsToRoll[currentSkillIndex];
        const currentLevel = getSkillLevelFromStore(currentSkill);
        const isMaxLevel = currentLevel >= 18;
        const hasBeenProcessed = !!rollResult;

        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">
              Attempting Advancement ({currentSkillIndex + 1} / {skillsToRoll.length})
            </h4>
            <div className="p-4 border rounded bg-gray-50 text-center">
              <p className="text-lg font-semibold">{currentSkill}</p>
              <p className="text-gray-600">Current Level: {currentLevel}</p>
              {isMaxLevel && !hasBeenProcessed && <p className="text-yellow-600 font-medium mt-1">Max Level Reached. Skipped.</p>}
            </div>

            {rollResult && (
              <div className={`p-3 rounded border text-center ${rollResult.includes('Success') || rollResult.includes('Manually advanced') ? 'bg-green-50 border-green-200 text-green-800' : rollResult.includes('Failed') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                {rollResult}
              </div>
            )}

            {saveError && <ErrorMessage message={saveError} />}
            {error && <ErrorMessage message={error} />}

            <div className="flex justify-center gap-4 pt-2">
              {!hasBeenProcessed && !isMaxLevel && (
                <>
                  <Button onClick={() => performSkillRoll(currentSkill, 'endSession')} disabled={isSaving} loading={isSaving}>
                    <Dices className="w-4 h-4 mr-1" /> Roll (d20 vs {'>'} {currentLevel})
                  </Button>
                  <Button variant="outline" onClick={() => handleManualAdvance(currentSkill, 'endSession')} disabled={isSaving} loading={isSaving}>
                     <Zap className="w-4 h-4 mr-1" /> Advance Manually
                  </Button>
                </>
              )}
              {(hasBeenProcessed || (isMaxLevel && !hasBeenProcessed)) && (
                <Button onClick={handleNextSkill} disabled={isSaving} loading={isSaving}>
                  {skillJustReached18 ? 'Select Heroic Ability' : (currentSkillIndex < skillsToRoll.length - 1 ? 'Next Skill' : 'Finish Session')} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
             {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
          </div>
        );

      case 'selectAbility':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-green-700 flex items-center gap-2">
              <Award className="w-5 h-5" /> Skill <span className="font-bold">{skillJustReached18}</span> reached level 18!
            </h4>
            <p className="text-gray-700">Select a new Heroic Ability:</p>

            {loadingAbilities && <LoadingSpinner text="Loading available abilities..." />}
            {error && <ErrorMessage message={error} />}

            {!loadingAbilities && availableAbilities.length === 0 && !error && (
              <p className="text-center text-gray-500 italic py-4">No eligible heroic abilities found for this character.</p>
            )}

            {!loadingAbilities && availableAbilities.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-3 bg-gray-50">
                {availableAbilities.map(ability => (
                  <div
                    key={ability.id}
                    onClick={() => handleSelectAbility(ability)}
                    className={`p-3 rounded border cursor-pointer ${selectedAbility?.id === ability.id ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' : 'bg-white hover:bg-blue-50 border-gray-200'}`}
                  >
                    <p className="font-semibold">{ability.name}</p>
                    <p className="text-xs text-gray-600 mt-1">{ability.description}</p>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                       {ability.willpower_cost && <span>WP: {ability.willpower_cost}</span>}
                       {ability.requirement && typeof ability.requirement === 'object' && Object.keys(ability.requirement).length > 0 && (
                         <span>Req: {Object.entries(ability.requirement).filter(([,val]) => val !== null && val !== undefined).map(([k,v]) => `${k} ${v}`).join(', ')}</span>
                       )}
                       {ability.requirement && typeof ability.requirement === 'string' && (
                         <span>Req: {ability.requirement}</span>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {saveError && <ErrorMessage message={saveError} />}

            <div className="flex justify-end pt-2">
              <Button 
                onClick={handleConfirmAbilitySelection} 
                disabled={!selectedAbility || loadingAbilities || isSaving || (availableAbilities.length === 0 && !error && !loadingAbilities) }
                loading={isSaving}
              >
                Confirm Ability & Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
             {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
          </div>
        );

      case 'selectStudyType':
        const canStudyMagicSpells = !!storeCharacter?.magicSchool;
        const magicTalentCount = storeCharacter?.heroic_abilities?.filter(a => a.toUpperCase() === 'MAGIC TALENT').length ?? 0;
        const knownMagicSchoolSkillsCount = Object.keys(storeCharacter?.skill_levels ?? {}).filter(skill => MAGE_SKILLS[skill]).length;
        const canLearnNewSchool = magicTalentCount > knownMagicSchoolSkillsCount;
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Choose Study Method</h4>
            <p className="text-gray-600">How would you like to study to improve a skill or learn magic?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button onClick={() => handleSelectStudyType('teacher')} className="w-full">
                <GraduationCap className="w-5 h-5 mr-2" /> Find a Teacher (Skills)
              </Button>
              <Button
                onClick={() => handleSelectStudyType('magic')}
                variant="outline"
                className="w-full"
                disabled={!canStudyMagicSpells || loadingMagicData}
                loading={loadingMagicData}
              >
                <Wand2 className="w-5 h-5 mr-2" /> Study Magic (Spells)
              </Button>
              <Button
                  onClick={() => handleSelectStudyType('learnSchool')}
                  variant="outline"
                  className="w-full sm:col-span-2"
                  disabled={!canLearnNewSchool || loadingMagicData}
                  loading={loadingMagicData}
                >
                  <BookOpen className="w-5 h-5 mr-2" /> Learn a New Magic School
              </Button>
            </div>
             {!canStudyMagicSpells && (
                <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-200 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0"/> Character must belong to a Magic School to study its spells.
                </p>
             )}
              {!canLearnNewSchool && (
                <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-200 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0"/> Requires the 'Magic Talent' heroic ability. You must have one use of this ability for each school you wish to learn.
                </p>
             )}
             {error && <ErrorMessage message={error} />}
            <div className="flex justify-start">
              <Button type="button" variant="secondary" onClick={() => setStep('initial')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </div>
          </div>
        );

      case 'studyTeacherSelectSkill':
        if (!characterForInfo) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Study with a Teacher</h4>
            <p className="text-gray-600">Select one skill to focus on improving. You cannot study a skill currently being studied until it has been advanced or study is completed.</p>
            {skillCurrentlyUnderStudy && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded text-purple-800 text-sm flex items-center gap-2">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    Currently studying: <span className="font-semibold">{skillCurrentlyUnderStudy}</span>. Complete or advance this study first to pick another skill.
                </div>
            )}
            <div className="max-h-72 overflow-y-auto space-y-1 border rounded p-3 bg-gray-50">
              {characterSkillsInfo.map(skill => {
                const currentLevel = getSkillLevelFromStore(skill.name);
                const isMaxLevel = currentLevel >= 18;
                const isDisabled = isMaxLevel || (!!skillCurrentlyUnderStudy && skillCurrentlyUnderStudy !== skill.name);

                return (
                  <label
                    key={skill.name}
                    className={`flex items-center space-x-3 p-2 rounded ${
                      isDisabled
                        ? 'opacity-60 cursor-not-allowed'
                        : studySkillSelected === skill.name
                        ? 'bg-blue-100 border border-blue-300'
                        : 'hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="studySkill"
                      checked={studySkillSelected === skill.name}
                      onChange={() => handleStudySkillSelection(skill.name)}
                      disabled={isDisabled}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className={`flex-grow ${skill.isTrained ? 'font-semibold' : ''}`}>{skill.name}</span>
                    <span className="text-xs text-gray-500">({skill.attribute})</span>
                    <span className="text-sm text-gray-600 font-medium">Lvl {currentLevel}</span>
                    {isMaxLevel && <span className="text-xs text-yellow-600 font-semibold ml-1">(Max)</span>}
                  </label>
                );
              })}
            </div>
            {error && <ErrorMessage message={error} />}
            <div className="flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep('selectStudyType')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleConfirmStudySkill} disabled={!studySkillSelected || !!skillCurrentlyUnderStudy || isSaving} loading={isSaving}>
                Confirm Study Skill <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
             {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
          </div>
        );

      case 'studyTeacherRollSkill':
        const skillToStudy = skillCurrentlyUnderStudy || studySkillSelected; 
        if (!skillToStudy || !characterForInfo) {
            return <ErrorMessage message="Error: No skill selected or found for study, or character data missing." />;
        }
        const studySkillLevel = getSkillLevelFromStore(skillToStudy);
        const studySkillIsMax = studySkillLevel >= 18;
        const studyProcessed = !!studyRollResult;

        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Study Session: {skillToStudy}</h4>
            <div className="p-4 border rounded bg-gray-50 text-center">
              <p className="text-lg font-semibold">{skillToStudy}</p>
              <p className="text-gray-600">Current Level: {studySkillLevel}</p>
              {studySkillIsMax && !studyProcessed && <p className="text-yellow-600 font-medium mt-1">Max Level Reached. Study complete.</p>}
            </div>

            {studyRollResult && (
              <div className={`p-3 rounded border text-center ${studyRollResult.includes('Success') || studyRollResult.includes('Manually advanced') ? 'bg-green-50 border-green-200 text-green-800' : studyRollResult.includes('Failed') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                {studyRollResult}
              </div>
            )}

            {saveError && <ErrorMessage message={saveError} />}
            {error && <ErrorMessage message={error} />}

            <div className="flex justify-center gap-4 pt-2">
              {!studyProcessed && !studySkillIsMax && (
                <>
                  <Button onClick={() => performSkillRoll(skillToStudy, 'study')} disabled={isSaving} loading={isSaving}>
                    <Dices className="w-4 h-4 mr-1" /> Roll (d20 vs {'>'} {studySkillLevel})
                  </Button>
                  <Button variant="outline" onClick={() => handleManualAdvance(skillToStudy, 'study')} disabled={isSaving} loading={isSaving}>
                     <Zap className="w-4 h-4 mr-1" /> Advance Manually
                  </Button>
                </>
              )}
              {(studyProcessed || (studySkillIsMax && !studyProcessed) ) && (
                <Button onClick={handleFinishStudy} disabled={isSaving} loading={isSaving}>
                  Finish Study <Check className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
             {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
          </div>
        );

      case 'studyMagicSelectSpell':
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-600" /> Study Magic (Spells)
            </h4>
            {magicSchoolName && (
                <p className="text-gray-600">School: <span className="font-semibold">{magicSchoolName}</span></p>
            )}
            <p className="text-gray-600">Select a spell to learn:</p>

            {loadingMagicData && <LoadingSpinner text="Loading spells..." />}
            {error && <ErrorMessage message={error} />}

            {!loadingMagicData && learnableSpells.length === 0 && !error && (
              <p className="text-center text-gray-500 italic py-4">No new spells available to learn at this time, or prerequisites not met.</p>
            )}

            {!loadingMagicData && learnableSpells.length > 0 && (
              <div className="max-h-72 overflow-y-auto space-y-2 border rounded p-3 bg-gray-50">
                {learnableSpells.map(spell => (
                  <label
                    key={spell.id}
                    className={`flex items-start space-x-3 p-3 rounded border cursor-pointer ${selectedSpell?.id === spell.id ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' : 'bg-white hover:bg-blue-50 border-gray-200'}`}
                  >
                    <input
                      type="radio"
                      name="learnSpell"
                      checked={selectedSpell?.id === spell.id}
                      onChange={() => handleSelectSpell(spell)}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 mt-1 flex-shrink-0"
                    />
                    <div className="flex-grow">
                        <p className="font-semibold">{spell.name} <span className="text-xs font-normal text-gray-500">(Rank {spell.rank ?? 'N/A'})</span></p>
                        <p className="text-xs text-gray-600 mt-1">{spell.description}</p>
                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                            {spell.casting_time && <span>Cast: {spell.casting_time}</span>}
                            {spell.range && <span>Range: {spell.range}</span>}
                            {spell.duration && <span>Duration: {spell.duration}</span>}
                            {spell.willpower_cost && <span>WP: {spell.willpower_cost}</span>}
                            {spell.prerequisite && <span className="italic">(Learn Req: {spell.prerequisite})</span>}
                            {spell.casting_requirement && <span className="italic">(Cast Req: {spell.casting_requirement})</span>}
                        </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {saveError && <ErrorMessage message={saveError} />}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => { setStep('selectStudyType'); setError(null); }}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleConfirmLearnSpell} disabled={!selectedSpell || loadingMagicData || isSaving || (learnableSpells.length === 0 && !error && !loadingMagicData)} loading={isSaving}>
                Learn Selected Spell <Check className="w-4 h-4 ml-1" />
              </Button>
            </div>
             {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
          </div>
        );
      
      case 'studyMagicSelectSchool':
        const knownSchoolNames = Object.keys(storeCharacter?.skill_levels ?? {});
        const availableSchools = allMagicSchools.filter(school => !knownSchoolNames.includes(school.name));
        return (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-600" /> Learn a New Magic School
            </h4>
            <p className="text-gray-600">Select a school of magic to study for a week. At the end of the week, you will roll against your INT to learn it.</p>
            {error && <ErrorMessage message={error} />}
            {!loadingMagicData && availableSchools.length === 0 && !error && (
              <p className="text-center text-gray-500 italic py-4">There are no new magic schools available for you to learn.</p>
            )}
             <div className="max-h-72 overflow-y-auto space-y-2 border rounded p-3 bg-gray-50">
                {availableSchools.map(school => (
                  <label
                    key={school.id}
                    className={`flex items-start space-x-3 p-3 rounded border cursor-pointer ${selectedMagicSchool?.id === school.id ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' : 'bg-white hover:bg-blue-50 border-gray-200'}`}
                  >
                    <input
                      type="radio"
                      name="learnSchool"
                      checked={selectedMagicSchool?.id === school.id}
                      onChange={() => setSelectedMagicSchool(school)}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 mt-1 flex-shrink-0"
                    />
                    <div className="flex-grow">
                        <p className="font-semibold">{school.name}</p>
                        <p className="text-xs text-gray-600 mt-1">{school.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => { setStep('selectStudyType'); setError(null); }}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep('studyMagicRollSchool')} disabled={!selectedMagicSchool || isSaving} loading={isSaving}>
                Begin Study <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        );

      case 'studyMagicRollSchool':
        if (!selectedMagicSchool || !storeCharacter) {
          return <ErrorMessage message="Error: No magic school selected or character data missing." />;
        }
        const targetInt = storeCharacter.attributes.INT;
        const learnSchoolProcessed = !!studyRollResult;
        return (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Study Session: Learn {selectedMagicSchool.name}</h4>
              <div className="p-4 border rounded bg-gray-50 text-center">
                <p className="text-lg font-semibold">{selectedMagicSchool.name}</p>
                <p className="text-gray-600">You must roll greater than your Intelligence ({targetInt}) on a d20 to succeed.</p>
              </div>

              {studyRollResult && (
                <div className={`p-3 rounded border text-center ${studyRollResult.includes('Success') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  {studyRollResult}
                </div>
              )}

              {saveError && <ErrorMessage message={saveError} />}
              {error && <ErrorMessage message={error} />}

              <div className="flex justify-center gap-4 pt-2">
                {!learnSchoolProcessed && (
                  <>
                    <Button onClick={performLearnSchoolRoll} disabled={isSaving} loading={isSaving}>
                      <Dices className="w-4 h-4 mr-1" /> Roll (d20 vs {'>'} {targetInt})
                    </Button>
                    <Button variant="outline" onClick={handleManualLearnSchool} disabled={isSaving} loading={isSaving}>
                       <Zap className="w-4 h-4 mr-1" /> Succeed Manually
                    </Button>
                  </>
                )}
                {learnSchoolProcessed && (
                  <Button onClick={handleFinishStudy} disabled={isSaving} loading={isSaving}>
                    Finish <Check className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
               {isSaving && <div className="text-center text-sm text-blue-600 flex items-center justify-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</div>}
            </div>
        );

      case 'finished':
        return (
          <div className="text-center space-y-4 p-6 bg-green-50 rounded border border-green-200">
            <Check className="w-12 h-12 text-green-500 mx-auto" />
            <h4 className="text-xl font-semibold text-green-800">Session Ended & Advancement Complete!</h4>
            <p className="text-gray-700">Character data has been updated. Marked skills for this session have been cleared.</p>
            <Button onClick={onClose}>
              Done
            </Button>
          </div>
        );

      default:
        const _exhaustiveCheck: never = step;
        return <p>Unknown step: {_exhaustiveCheck}</p>;
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-white z-10">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600" />
            Character Advancement
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close advancement modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
}
