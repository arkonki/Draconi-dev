import React, { useMemo, useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/DiceContext';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { Button } from '../../shared/Button';
import { supabase } from '../../../lib/supabase';

interface SkillsModalProps {
  onClose: () => void;
}

// --- Constants and Helpers (Unchanged) ---
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

// --- Component ---
export function SkillsModal({ onClose }: SkillsModalProps) {
  const { toggleDiceRoller } = useDice();
  const { character } = useCharacterSheetStore();

  const [skillInfo, setSkillInfo] = useState<Record<string, { description: string }>>({});
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const fetchSkillInfo = async () => {
      setIsLoadingInfo(true);
      const { data, error } = await supabase.from('game_skills').select('name, description');
      if (error) {
        console.error("Error fetching skill descriptions:", error);
      } else if (data) {
        const infoMap = data.reduce((acc, skill) => {
          acc[skill.name] = { description: skill.description };
          return acc;
        }, {} as Record<string, { description: string }>);
        setSkillInfo(infoMap);
      }
      setIsLoadingInfo(false);
    };
    fetchSkillInfo();
  }, []);

  const isMage = !!(character?.magicSchool && typeof character.magicSchool === 'object');
  const characterSchoolName = isMage ? (character.magicSchool as { name: string }).name : null;

  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6"><LoadingSpinner /></div>
      </div>
    );
  }

  const mageSkills = useMemo(() => {
    if (!characterSchoolName) return [];
    return allMageSkillsList
      .filter(name => name === characterSchoolName)
      .map(name => ({ name, attr: skillAttributeMap[name] }));
  }, [characterSchoolName]);

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

  const handleMouseEnter = (e: React.MouseEvent, description: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipContent(description);
    setTooltipPosition({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  };

  const handleMouseLeave = () => {
    setTooltipContent(null);
    setTooltipPosition(null);
  };

  // --- NEW: Click handler for touch devices ---
  const handleInfoClick = (e: React.MouseEvent, description: string) => {
    e.stopPropagation(); // Prevents the dice roller from opening
    
    // If this tooltip is already open, close it. Otherwise, open it.
    if (tooltipContent === description) {
      handleMouseLeave();
    } else {
      handleMouseEnter(e, description);
    }
  };

  const generalSkills = baseSkills.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name));
  const weaponSkills = weaponSkillsList.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name));

  const renderSkillRow = (skill: { name: string; attr: AttributeName }) => {
    const isTrained = character.trainedSkills?.includes(skill.name) ?? false;
    const skillValue = character.skill_levels?.[skill.name] ?? calculateFallbackLevel(character, skill.name, skill.attr);
    const condition = getConditionForAttribute(skill.attr);
    const isAffected = character.conditions?.[condition] ?? false;
    const description = skillInfo[skill.name]?.description;

    return (
      <div
        key={skill.name}
        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
          isAffected ? 'bg-red-50 hover:bg-red-100 ring-1 ring-red-200' : 'hover:bg-gray-100'
        }`}
        onClick={() => handleSkillClick(skill.name, skillValue, isAffected)}
        title={`Click to roll ${skill.name} (Target ≤ ${skillValue}${isAffected ? ', Bane' : ''})`}
      >
        <div className="flex items-center">
          <span className={`${isTrained ? 'font-bold' : ''} ${isAffected ? 'text-red-700' : 'text-gray-800'}`}>
            {skill.name}
          </span>
          {description && (
            <div
              className="flex items-center ml-2 p-1" // Added padding to make the touch target larger
              onClick={(e) => handleInfoClick(e, description)} // Added onClick for touch
              onMouseEnter={(e) => handleMouseEnter(e, description)}
              onMouseLeave={handleMouseLeave}
            >
              <Info className="w-4 h-4 text-blue-500" />
            </div>
          )}
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
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleMouseLeave} // NEW: Hide tooltip when clicking the backdrop
    >
      <div
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()} // NEW: Prevent clicks inside modal from closing tooltip
      >
        <div className="p-6 border-b bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Skills (D20 Check)</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Tap a skill to roll. Tap the info icon for details. Conditions apply Bane. Trained skills are bolded.
          </p>
        </div>
        
        {isLoadingInfo ? (
          <div className="flex-grow flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${isMage ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 p-6 overflow-y-auto flex-grow`}>
            <div>
              <h3 className="font-bold mb-4 text-gray-700">General Skills</h3>
              <div className="space-y-1">{generalSkills.map(renderSkillRow)}</div>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-gray-700">Weapon Skills</h3>
              <div className="space-y-1">{weaponSkills.map(renderSkillRow)}</div>
            </div>
            {isMage && characterSchoolName && (
              <div>
                <h3 className="font-bold mb-4 text-gray-700">Magic Skill ({characterSchoolName})</h3>
                <div className="space-y-1">
                  {mageSkills.length > 0 ? (
                    mageSkills.map(renderSkillRow)
                  ) : (
                    <p className="text-sm text-gray-500 italic px-2 py-1">No matching magic skill found for "{characterSchoolName}".</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      {tooltipContent && tooltipPosition && (
        <div
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
          className="fixed -translate-x-1/2 -translate-y-full mb-2 w-72 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-[60] pointer-events-none"
        >
          <p>{tooltipContent}</p>
        </div>
      )}
    </div>
  );
}
