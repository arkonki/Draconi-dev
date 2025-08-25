// src/components/character/SkillsModal.tsx

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/DiceContext';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { Button } from '../../shared/Button';
import { supabase } from '../../../lib/supabase';
import { MagicSchool } from '../../../types/magic';

interface SkillsModalProps {
  onClose: () => void;
}

// --- Constants and Helpers ---

const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR',
    'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL',
};

const baseSkills = [
    'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft',
    'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends',
    'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking',
    'Spot Hidden', 'Swimming'
];
const weaponSkillsList = [
    'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
];
const allMageSkillsList = ['Mentalism', 'Animism', 'Elementalism'];

const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => {
    console.warn(`[SkillsModal] Calculating fallback level for ${skillName}.`);
    const isTrained = character.trainedSkills?.includes(skillName) ?? false;
    const baseValue = character.attributes?.[attribute] ?? 10;
    const baseChance = getBaseChance(baseValue);
    return isTrained ? baseChance * 2 : baseChance;
};

export function SkillsModal({ onClose }: SkillsModalProps) {
  const { toggleDiceRoller } = useDice();
  const { character } = useCharacterSheetStore();
  const [magicSchools, setMagicSchools] = useState<MagicSchool[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [errorSchools, setErrorSchools] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchools = async () => {
      setIsLoadingSchools(true);
      setErrorSchools(null);
      try {
        const { data, error } = await supabase
          .from('magic_schools')
          .select('id, name');

        if (error) throw error;
        setMagicSchools(data || []);
      } catch (err: any) {
        console.error("[SkillsModal] Error fetching magic schools:", err);
        setErrorSchools("Failed to load magic schools data.");
      } finally {
        setIsLoadingSchools(false);
      }
    };
    fetchSchools();
  }, []);

  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6"><LoadingSpinner /></div>
      </div>
    );
  }

  // --- FIX: The parsing logic is removed from this component ---
  // The `character` object from the store now has a guaranteed `skill_levels` object.
  // We can use `character.skill_levels` directly.

  const characterSchoolId = character.magicSchool;
  const isMage = !!characterSchoolId;

  let characterSchoolName: string | null = null;
  if (isMage && !isLoadingSchools && magicSchools.length > 0) {
    const foundSchool = magicSchools.find(school => school.id === characterSchoolId);
    if (foundSchool) {
      characterSchoolName = foundSchool.name;
    } else {
      console.warn(`[SkillsModal] Could not find magic school name for ID: ${characterSchoolId}`);
    }
  }

  const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => {
    const conditionMap: Record<AttributeName, keyof Character['conditions']> = {
      'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed',
      'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened'
    };
    return conditionMap[attr];
  };

  const handleSkillClick = (skillName: string, skillValue: number, isAffected: boolean) => {
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: skillValue,
      description: `${skillName} Check`,
      requiresBane: isAffected,
      skillName: skillName,
    });
    onClose();
  };

  const generalSkills = baseSkills
    .map(name => ({ name, attr: skillAttributeMap[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const weaponSkills = weaponSkillsList
    .map(name => ({ name, attr: skillAttributeMap[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const mageSkills = characterSchoolName
    ? allMageSkillsList
        .filter(name => name === characterSchoolName)
        .map(name => ({ name, attr: skillAttributeMap[name] }))
    : [];

  const renderSkillRow = (skill: { name: string; attr: AttributeName }) => {
    const isTrained = character.trainedSkills?.includes(skill.name) ?? false;
    
    // --- FIX: Directly use the skill_levels object from the character ---
    const skillValue = character.skill_levels?.[skill.name] ?? calculateFallbackLevel(character, skill.name, skill.attr);
    
    const condition = getConditionForAttribute(skill.attr);
    const isAffected = character.conditions?.[condition] ?? false;

    return (
      <div
        key={skill.name}
        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
          isAffected ? 'bg-red-50 hover:bg-red-100 ring-1 ring-red-200' : 'hover:bg-gray-100'
        }`}
        onClick={() => handleSkillClick(skill.name, skillValue, isAffected)}
        title={`Click to roll ${skill.name} (Target ≤ ${skillValue}${isAffected ? ', Bane' : ''})`}
      >
        <div>
          <span className={`${isTrained ? 'font-bold' : ''} ${isAffected ? 'text-red-700' : 'text-gray-800'}`}>
            {skill.name}
          </span>
          <span className="text-sm text-gray-500 ml-2">({skill.attr})</span>
          {isAffected && <span className="text-xs text-red-600 font-semibold ml-2">(Bane)</span>}
        </div>
        <span className={`font-medium text-sm ${isAffected ? 'text-red-700' : 'text-gray-600'}`}>
          Target: {skillValue}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="p-6 border-b bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Skills (d20 Check)</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Click a skill to roll a d20 check. Roll ≤ Skill Level for success. 1 is Dragon (Crit Success), 20 is Demon (Crit Fail). Conditions apply Bane (roll 2d20, take highest/worst). Trained skills are bolded.
          </p>
        </div>
        <div className={`grid grid-cols-1 ${isMage ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 p-6 overflow-y-auto flex-grow`}>
          <div>
            <h3 className="font-bold mb-4 text-gray-700">General Skills</h3>
            <div className="space-y-1">
              {generalSkills.map(renderSkillRow)}
            </div>
          </div>
          <div>
            <h3 className="font-bold mb-4 text-gray-700">Weapon Skills</h3>
            <div className="space-y-1">
              {weaponSkills.map(renderSkillRow)}
            </div>
          </div>
          {isMage && (
            <div>
              {isLoadingSchools && (
                <div className="text-center text-gray-500 p-4">
                  <LoadingSpinner size="sm" /> Loading magic info...
                </div>
              )}
              {errorSchools && !isLoadingSchools && (
                <div className="text-center text-red-600 p-4 border border-red-200 bg-red-50 rounded">
                  {errorSchools}
                </div>
              )}
              {!isLoadingSchools && !errorSchools && characterSchoolName && (
                <>
                  <h3 className="font-bold mb-4 text-gray-700">Magic Skill ({characterSchoolName})</h3>
                  <div className="space-y-1">
                    {mageSkills.length > 0 ? (
                      mageSkills.map(renderSkillRow)
                    ) : (
                      <p className="text-sm text-gray-500 italic px-2 py-1">No matching magic skill component found for {characterSchoolName}.</p>
                    )}
                  </div>
                </>
              )}
              {!isLoadingSchools && !errorSchools && !characterSchoolName && (
                <div>
                  <h3 className="font-bold mb-4 text-gray-700">Magic Skill</h3>
                  <p className="text-sm text-orange-600 italic px-2 py-1 bg-orange-50 border border-orange-200 rounded">Could not determine magic school name from ID ({characterSchoolId}).</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}