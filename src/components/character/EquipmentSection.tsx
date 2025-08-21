import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Sword, Dices, ListChecks } from 'lucide-react'; // Added ListChecks
import { Character, AttributeName, DiceType } from '../../types/character';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useDice } from '../dice/DiceContext';
import { Button } from '../shared/Button';

// --- Helper functions ---
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

const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => {
    const isTrained = character.trainedSkills?.includes(skillName) ?? false;
    const baseValue = character.attributes?.[attribute] ?? 10;
    const baseChance = getBaseChance(baseValue);
    return isTrained ? baseChance * 2 : baseChance;
};

const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => {
    const conditionMap: Record<AttributeName, keyof Character['conditions']> = {
      'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed',
      'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened'
    };
    return conditionMap[attr];
};

const parseSkillLevels = (skillLevelsData: any): Record<string, number> => {
  if (typeof skillLevelsData === 'string') {
    try {
      const parsed = JSON.parse(skillLevelsData);
      return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
    } catch (e) {
      return {};
    }
  } else if (typeof skillLevelsData === 'object' && skillLevelsData !== null) {return skillLevelsData;
  }
  return {};
};

const parseBaseSkillName = (skillNameWithAttr: string | null | undefined): string | null => {
    if (!skillNameWithAttr) return null;
    return skillNameWithAttr.split('(')[0].trim();
}

const isValidDiceType = (s: string): s is DiceType => {
    return ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(s);
}

const formatItemFeatures = (features: string | string[] | undefined): string => {
  if (!features) return '-';
  if (Array.isArray(features)) return features.join(', ');
  return features;
};
// --- End Helper Functions ---


interface EquipmentSectionProps {
  character: Character;
}

export function EquipmentSection({ character }: EquipmentSectionProps) {
  const { toggleDiceRoller } = useDice();

  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  const findItemDetails = (itemName: string): GameItem | undefined => {
    if (!itemName) return undefined;
    return allItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  };

  const calculateTotalArmor = () => {
    let totalArmor = 0;
    const equippedArmorName = character.equipment?.equipped?.armor;
    const equippedHelmetName = character.equipment?.equipped?.helmet;

    if (equippedArmorName) {
      const armorDetails = findItemDetails(equippedArmorName);
      totalArmor += Number(armorDetails?.armor_rating) || 0;
    }
    if (equippedHelmetName) {
      const helmetDetails = findItemDetails(equippedHelmetName);
      totalArmor += Number(helmetDetails?.armor_rating) || 0;
    }
    return totalArmor;
  };

  const handleDamageRoll = (weaponName: string, damageDiceString: string) => {
    const diceMatch = damageDiceString?.match(/(\d+)?d(\d+)/i);
    let baseDicePool: DiceType[] = ['d6'];
    let baseFormulaPart = '1d6';

    if (diceMatch) {
      const numDice = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1;
      const dieSizeString = `d${diceMatch[2]}`;

      if (isValidDiceType(dieSizeString)) {
         baseDicePool = Array(numDice).fill(dieSizeString);
         baseFormulaPart = `${numDice}d${diceMatch[2]}`;
      }
    }

    let bonusDiceString = '';
    let bonusDiceType: DiceType | null = null;
    const weaponDetails = findItemDetails(weaponName);
    const skillNameFromDb = weaponDetails?.skill;
    const baseSkillName = parseBaseSkillName(skillNameFromDb);
    const attribute = baseSkillName ? skillAttributeMap[baseSkillName] : null;

    if (attribute === 'STR') {
        if (character.attributes.STR > 15) { bonusDiceString = 'd6'; bonusDiceType = 'd6'; }
        else if (character.attributes.STR > 12) { bonusDiceString = 'd4'; bonusDiceType = 'd4'; }
    } else if (attribute === 'AGL') {
        if (character.attributes.AGL > 15) { bonusDiceString = 'd6'; bonusDiceType = 'd6'; }
        else if (character.attributes.AGL > 12) { bonusDiceString = 'd4'; bonusDiceType = 'd4'; }
    }

    let fullDiceFormula = baseFormulaPart;
    if (bonusDiceString) {
        fullDiceFormula += ` + ${bonusDiceString}`;
    }

    const initialDicePool = [...baseDicePool];
    if (bonusDiceType) {
        initialDicePool.push(bonusDiceType);
    }

    toggleDiceRoller({
      rollMode: 'attackDamage',
      initialDice: initialDicePool, 
      description: `Damage roll for ${weaponName} (${fullDiceFormula})`, 
    });
  };

  const handleSkillRoll = (skillName: string, skillValue: number, isAffected: boolean) => {
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: skillValue,
      description: `${skillName} Check`,
      requiresBane: isAffected,
      skillName: skillName, 
    });
  };

  const totalArmorRating = calculateTotalArmor();
  const equippedWeapons = character.equipment?.equipped?.weapons || [];
  const parsedSkillLevels = parseSkillLevels(character.skill_levels);

  const equippedBodyArmorName = character.equipment?.equipped?.armor;
  const equippedHelmetName = character.equipment?.equipped?.helmet;

  const bodyArmorDetails = equippedBodyArmorName ? findItemDetails(equippedBodyArmorName) : undefined;
  const helmetDetails = equippedHelmetName ? findItemDetails(equippedHelmetName) : undefined;

  const bodyArmorFeaturesDisplay = bodyArmorDetails ? formatItemFeatures(bodyArmorDetails.features) : '-';
  const helmetFeaturesDisplay = helmetDetails ? formatItemFeatures(helmetDetails.features) : '-';

  return (
    <div className="space-y-4">
      {/* Armor Section */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700"> {/* Increased mb */}
          <Shield className="w-5 h-5 text-blue-600" /> Armor
        </h3>
        {isLoadingItems ? (
          <LoadingSpinner size="sm" />
        ) : errorItems ? (
          <ErrorMessage message="Could not load item details for armor." />
        ) : (
          <div className="space-y-3"> {/* Main container for armor info */}
            <div className="text-sm space-y-2">
              <div>
                <p>
                  <strong>Body:</strong> {bodyArmorDetails?.name || <span className="italic text-gray-500">None</span>}
                  {bodyArmorDetails?.armor_rating !== undefined && (
                    <span className="text-xs text-gray-500 ml-2">(AR: {bodyArmorDetails.armor_rating})</span>
                  )}
                </p>
                {bodyArmorDetails && bodyArmorDetails.features && (
                  <p className="text-xs text-gray-600 pl-4 flex items-center gap-1 mt-0.5">
                    <ListChecks className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span>{bodyArmorFeaturesDisplay}</span>
                  </p>
                )}
              </div>
              <div>
                <p>
                  <strong>Helmet:</strong> {helmetDetails?.name || <span className="italic text-gray-500">None</span>}
                  {helmetDetails?.armor_rating !== undefined && (
                     <span className="text-xs text-gray-500 ml-2">(AR: {helmetDetails.armor_rating})</span>
                  )}
                </p>
                {helmetDetails && helmetDetails.features && (
                  <p className="text-xs text-gray-600 pl-4 flex items-center gap-1 mt-0.5">
                    <ListChecks className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span>{helmetFeaturesDisplay}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-md text-sm font-medium mt-2">
              <Shield className="w-4 h-4" />
              <span>Total Armor Rating: {totalArmorRating}</span>
            </div>
          </div>
        )}
      </div>

      {/* Weapons Section */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700">
          <Sword className="w-5 h-5 text-red-600" /> Weapons
        </h3>
        {isLoadingItems ? (
          <LoadingSpinner size="sm" />
        ) : errorItems ? (
          <ErrorMessage message="Could not load item details for weapons." />
        ) : equippedWeapons.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No weapons equipped.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                  <th scope="col" className="px-4 py-2">Weapon / Shield</th>
                  <th scope="col" className="px-4 py-2">Grip</th>
                  <th scope="col" className="px-4 py-2">Range</th>
                  <th scope="col" className="px-4 py-2">Damage</th>
                  <th scope="col" className="px-4 py-2">Features</th>
                  <th scope="col" className="px-4 py-2">Actions</th> 
                </tr>
              </thead>
              <tbody>
                {equippedWeapons.map((weapon, index) => {
                  const weaponDetails = findItemDetails(weapon.name);
                  
                  const skillNameFromDb = weaponDetails?.skill; 
                  const baseSkillName = parseBaseSkillName(skillNameFromDb); 

                  let skillValue: number | null = null;
                  let isAffected = false;
                  let attribute: AttributeName | null = null;

                  if (baseSkillName && skillAttributeMap[baseSkillName]) {
                    attribute = skillAttributeMap[baseSkillName];
                    skillValue = parsedSkillLevels?.[baseSkillName] ?? calculateFallbackLevel(character, baseSkillName, attribute);
                    const condition = getConditionForAttribute(attribute);
                    isAffected = character.conditions?.[condition] ?? false;
                  }

                  const featuresDisplay = formatItemFeatures(weapon.features);

                  return (
                    <tr key={`${weapon.name}-${index}`} className="bg-white border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{weapon.name}</td>
                      <td className="px-4 py-2">{weapon.grip || '-'}</td>
                      <td className="px-4 py-2">{weapon.range || '-'}</td>
                      <td className="px-4 py-2">{weapon.damage || '-'}</td>
                      <td className="px-4 py-2">{featuresDisplay}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {weapon.damage ? (
                            <Button
                              variant="link"
                              size="xs"
                              onClick={() => handleDamageRoll(weapon.name, weapon.damage!)}
                              className="text-red-600 hover:text-red-800 font-medium p-0 flex items-center gap-1"
                              title={`Roll damage for ${weapon.name} (${weapon.damage})`}
                            >
                              <Dices className="w-3 h-3" />
                              Damage
                            </Button>
                          ) : null}

                          {baseSkillName && skillValue !== null ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="link"
                                size="xs"
                                onClick={() => handleSkillRoll(baseSkillName, skillValue!, isAffected)}
                                className={`${
                                  isAffected ? 'text-red-600 hover:text-red-800' : 'text-indigo-600 hover:text-indigo-800'
                                } font-medium p-0 flex items-center gap-1`}
                                title={`Roll ${baseSkillName} check (Target ≤ ${skillValue}${isAffected ? ', Bane' : ''})`}
                              >
                                <Dices className="w-3 h-3" />
                                {baseSkillName}: {skillValue}
                              </Button>
                              {isAffected && <span className="text-xs text-red-500 font-semibold">(Bane)</span>}
                            </div>
                          ) : skillNameFromDb ? ( 
                             <span className="text-xs text-gray-400 italic" title={`Skill '${skillNameFromDb}' not found or level unavailable.`}>({baseSkillName || skillNameFromDb} N/A)</span>
                          ) : (
                            null 
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
