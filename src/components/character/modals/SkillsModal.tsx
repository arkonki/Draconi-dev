import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/DiceContext';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { Button } from '../../shared/Button';
import { supabase } from '../../../lib/supabase';
import { MagicSchool } from '../../../types/magic'; // Use MagicSchool type from types/magic

interface SkillsModalProps {
  onClose: () => void;
}

// Skill attribute mapping
const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR',
    // Magic skills mapped to Willpower
    'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL',
};

// Base and weapon skills lists
const baseSkills = [
    'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft',
    'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends',
    'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking',
    'Spot Hidden', 'Swimming'
];
const weaponSkillsList = [
    'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
];
// List of all possible Mage skill *names*
const allMageSkillsList = ['Mentalism', 'Animism', 'Elementalism'];

// Fallback calculation function
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
    // Ensure attribute value exists, default to a reasonable minimum if not
    const baseValue = character.attributes?.[attribute] ?? 10; // Default to 10 if attributes missing
    const baseChance = getBaseChance(baseValue);
    return isTrained ? baseChance * 2 : baseChance;
};


export function SkillsModal({ onClose }: SkillsModalProps) {
  const { toggleDiceRoller } = useDice();
  const { character } = useCharacterSheetStore();
  const [magicSchools, setMagicSchools] = useState<MagicSchool[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [errorSchools, setErrorSchools] = useState<string | null>(null);

  // 1. Fetch all magic schools data on mount to map ID to Name
  useEffect(() => {
    const fetchSchools = async () => {
      setIsLoadingSchools(true);
      setErrorSchools(null);
      try {
        const { data, error } = await supabase
          .from('magic_schools')
          .select('id, name'); // Fetch only id and name

        if (error) throw error;
        setMagicSchools(data || []);
        console.log("[SkillsModal] Fetched magic schools:", data);
      } catch (err: any) {
        console.error("[SkillsModal] Error fetching magic schools:", err);
        setErrorSchools("Failed to load magic schools data.");
      } finally {
        setIsLoadingSchools(false);
      }
    };

    fetchSchools();
  }, []); // Empty dependency array ensures this runs only once on mount

  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  // Parse skill_levels (handle string or object)
  let parsedSkillLevels: Record<string, number> | undefined | null = character.skill_levels;
  if (typeof parsedSkillLevels === 'string') {
    try {
      parsedSkillLevels = JSON.parse(parsedSkillLevels);
    } catch (e) {
      console.error("[SkillsModal] Error parsing skill_levels JSON string:", e);
      parsedSkillLevels = {}; // Fallback to empty object on parse error
    }
  } else if (parsedSkillLevels === null || typeof parsedSkillLevels !== 'object') {
      parsedSkillLevels = {}; // Fallback for null or non-object types
  }

  // 2. Identify Character's School ID and determine if they are a mage
  const characterSchoolId = character.magicSchool; // This is the ID from character data
  const isMage = !!characterSchoolId;
  console.log(`[SkillsModal] Character School ID: ${characterSchoolId}, Is Mage: ${isMage}`);

  // 3. Find the character's magic school name using the fetched list
  let characterSchoolName: string | null = null;
  if (isMage && !isLoadingSchools && magicSchools.length > 0) {
    const foundSchool = magicSchools.find(school => school.id === characterSchoolId);
    if (foundSchool) {
      characterSchoolName = foundSchool.name;
      console.log(`[SkillsModal] Found Magic School Name: ${characterSchoolName}`);
    } else {
        console.warn(`[SkillsModal] Could not find magic school name for ID: ${characterSchoolId}`);
        // Keep characterSchoolName as null if not found
    }
  }

  // Function to get condition affecting an attribute
  const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => {
    const conditionMap: Record<AttributeName, keyof Character['conditions']> = {
      'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed',
      'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened'
    };
    return conditionMap[attr];
  };

  // 6. Handle skill click - Opens Dice Roller
  const handleSkillClick = (skillName: string, skillValue: number, isAffected: boolean) => {
    console.log(`[SkillsModal] Rolling for ${skillName}, Target: ${skillValue}, Bane: ${isAffected}`);
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: skillValue,
      description: `${skillName} Check`,
      requiresBane: isAffected, // Pass bane status based on condition
      skillName: skillName, // Pass skill name for potential advancement logic
    });
    onClose(); // Close modal after initiating roll
  };

  // Prepare general and weapon skills lists
  const generalSkills = baseSkills
    .map(name => ({ name, attr: skillAttributeMap[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const weaponSkills = weaponSkillsList
    .map(name => ({ name, attr: skillAttributeMap[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // 4. Filter Mage Skill list based on the FOUND character school name
  const mageSkills = characterSchoolName
    ? allMageSkillsList
        .filter(name => name === characterSchoolName) // Filter using the looked-up name
        .map(name => ({ name, attr: skillAttributeMap[name] })) // Map to object with attribute
        .sort((a, b) => a.name.localeCompare(b.name))
    : []; // Empty array if not a mage or school name not found
  console.log("[SkillsModal] Filtered Mage Skills for display:", mageSkills);


  // Render a single skill row
  const renderSkillRow = (skill: { name: string; attr: AttributeName }) => {
    const isTrained = character.trainedSkills?.includes(skill.name) ?? false;
    // 5. Calculate Target Value: Use stored level or calculate fallback
    const skillValue = parsedSkillLevels?.[skill.name] ?? calculateFallbackLevel(character, skill.name, skill.attr);
    const condition = getConditionForAttribute(skill.attr);
    const isAffected = character.conditions?.[condition] ?? false; // Check if condition is active

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
        {/* Header */}
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

        {/* Body - Adjust grid columns based on whether the mage section will be rendered */}
        <div className={`grid grid-cols-1 ${isMage ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 p-6 overflow-y-auto flex-grow`}>
          {/* General Skills */}
          <div>
            <h3 className="font-bold mb-4 text-gray-700">General Skills</h3>
            <div className="space-y-1">
              {generalSkills.map(renderSkillRow)}
            </div>
          </div>

          {/* Weapon Skills */}
          <div>
            <h3 className="font-bold mb-4 text-gray-700">Weapon Skills</h3>
            <div className="space-y-1">
              {weaponSkills.map(renderSkillRow)}
            </div>
          </div>

          {/* Mage Skills (Conditional & Filtered) */}
          {isMage && (
            <div>
              {/* Show loading or error state ONLY for school lookup */}
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
              {/* Display section only if loading is done, no error, and school name was found */}
              {!isLoadingSchools && !errorSchools && characterSchoolName && (
                <>
                  <h3 className="font-bold mb-4 text-gray-700">Magic Skill ({characterSchoolName})</h3>
                  <div className="space-y-1">
                    {mageSkills.length > 0 ? (
                        mageSkills.map(renderSkillRow) // Render the single relevant magic skill
                    ) : (
                        // This case should be rare if characterSchoolName is found
                        <p className="text-sm text-gray-500 italic px-2 py-1">No matching magic skill component found for {characterSchoolName}.</p>
                    )}
                  </div>
                </>
              )}
               {/* Handle case where school ID exists but name wasn't found in DB */}
               {!isLoadingSchools && !errorSchools && !characterSchoolName && (
                 <div>
                    <h3 className="font-bold mb-4 text-gray-700">Magic Skill</h3>
                    <p className="text-sm text-orange-600 italic px-2 py-1 bg-orange-50 border border-orange-200 rounded">Could not determine magic school name from ID ({characterSchoolId}).</p>
                 </div>
               )}
            </div>
          )}
        </div>
         {/* Footer */}
         <div className="p-4 border-t bg-gray-50 flex justify-end">
           <Button variant="outline" onClick={onClose}>Close</Button>
         </div>
      </div>
    </div>
  );
}

// Ensure MagicSchool type is defined correctly (should be imported from types/magic.ts)
// interface MagicSchool {
//   id: string;
//   name: string;
// }
