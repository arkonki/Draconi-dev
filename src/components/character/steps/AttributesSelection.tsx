import React, { useState } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Dices, RefreshCw, AlertCircle } from 'lucide-react';

interface AttributeScore {
  value: number;
  baseChance: number;
}

const calculateBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const calculateDamageBonus = (value: number): string => {
  if (value <= 12) return 'None';
  if (value <= 15) return '+D4';
  return '+D6';
};

const rollAttribute = (): number => {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a); // descending order
  return rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0);
};

const rollAllAttributes = () => {
  return {
    STR: rollAttribute(),
    CON: rollAttribute(),
    AGL: rollAttribute(),
    INT: rollAttribute(),
    WIL: rollAttribute(),
    CHA: rollAttribute(),
  };
};

const ageModifiers = {
  Young: {
    STR: 0,
    CON: +1,
    AGL: +1,
    INT: 0,
    WIL: 0,
    CHA: 0,
  },
  Adult: {
    STR: 0,
    CON: 0,
    AGL: 0,
    INT: 0,
    WIL: 0,
    CHA: 0,
  },
  Old: {
    STR: -2,
    CON: -2,
    AGL: -2,
    INT: +1,
    WIL: +1,
    CHA: 0,
  },
};

export function AttributesSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [attributes, setAttributes] = useState<Record<string, AttributeScore>>({
    STR: { value: character.attributes?.STR || 0, baseChance: 0 },
    CON: { value: character.attributes?.CON || 0, baseChance: 0 },
    AGL: { value: character.attributes?.AGL || 0, baseChance: 0 },
    INT: { value: character.attributes?.INT || 0, baseChance: 0 },
    WIL: { value: character.attributes?.WIL || 0, baseChance: 0 },
    CHA: { value: character.attributes?.CHA || 0, baseChance: 0 },
  });

  const [isRolling, setIsRolling] = useState(false);

  const getAgeModifier = (attr: string) => {
    if (!character.age) return 0;
    return ageModifiers[character.age][attr as keyof typeof ageModifiers.Adult];
  };

  const getFinalValue = (attr: string, baseValue: number) => {
    const modifier = getAgeModifier(attr);
    return baseValue + modifier;
  };

  const handleRollAll = () => {
    setIsRolling(true);
    const newAttributes = rollAllAttributes();

    // Calculate final attributes (base rolls + age modifiers)
    const finalAttributes = Object.entries(newAttributes).reduce(
      (acc, [attr, value]) => ({
        ...acc,
        [attr]: getFinalValue(attr, value),
      }),
      {}
    );

    // Update our local state (with base chances)
    const newAttributesWithChances = Object.entries(newAttributes).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: {
          value,
          baseChance: calculateBaseChance(getFinalValue(key, value)),
        },
      }),
      {}
    );

    setAttributes(newAttributesWithChances);
    // Update character attributes and also set current_hp and current_wp.
    updateCharacter({
      attributes: finalAttributes,
      current_hp: finalAttributes.CON,
      current_wp: finalAttributes.WIL,
      magic_school: character.magicSchool ?? null,
    });
    setIsRolling(false);
  };

  const handleManualEntry = (attr: string, value: string) => {
    const numValue = Math.max(3, Math.min(18, parseInt(value) || 0));
    const finalValue = getFinalValue(attr, numValue);

    const newAttributes = {
      ...attributes,
      [attr]: {
        value: numValue,
        baseChance: calculateBaseChance(finalValue),
      },
    };

    setAttributes(newAttributes);

    const finalAttributes = Object.entries(newAttributes).reduce(
      (acc, [key, { value }]) => ({
        ...acc,
        [key]: getFinalValue(key, value),
      }),
      {}
    );

    updateCharacter({
      attributes: finalAttributes,
      current_hp: finalAttributes.CON,
      current_wp: finalAttributes.WIL,
      magic_school: character.magicSchool ?? null,
    });
  };

  const calculateMovement = () => {
    if (!character.kin || !attributes.AGL.value) return 0;

    const baseMovement = {
      Human: 10,
      Halfling: 8,
      Dwarf: 8,
      Elf: 10,
      Mallard: 8,
      Wolfkin: 12,
    }[character.kin];

    const finalAGL = getFinalValue('AGL', attributes.AGL.value);
    let modifier = 0;
    if (finalAGL <= 6) modifier = -4;
    else if (finalAGL <= 9) modifier = -2;
    else if (finalAGL <= 12) modifier = 0;
    else if (finalAGL <= 15) modifier = 2;
    else modifier = 4;

    return baseMovement + modifier;
  };

  // Retrieve the key attribute from the selected profession (if provided in character)
  const keyAttribute = character.key_attribute; // assuming updateCharacter set it

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Assign Attributes</h3>
        <p className="text-gray-600">
          Roll or manually enter your character's attributes. Each attribute is determined by rolling 4D6 and removing the lowest die,
          giving you a score between 3 and 18. {character.age && "Age modifiers will be automatically applied."}
        </p>
        {character.profession && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800">
              Selected Profession: <strong>{character.profession}</strong>
              {character.key_attribute && (
                <> (Key Attribute: <strong>{character.key_attribute}</strong>)</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Roll All Button */}
      <div className="flex justify-between items-center">
        <button
          onClick={handleRollAll}
          disabled={isRolling}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isRolling ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Dices className="w-5 h-5" />
          )}
          Roll All Attributes
        </button>
      </div>

      {/* Attribute Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(attributes).map(([attr, { value, baseChance }]) => {
          const modifier = getAgeModifier(attr);
          const finalValue = getFinalValue(attr, value);

          // Highlight if this attribute is the key attribute
          const isKey = keyAttribute === attr;

          return (
            <div
              key={attr}
              className={`p-4 border rounded-lg shadow-sm bg-white ${
                isKey ? 'bg-yellow-100 border-yellow-500' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <label className="text-lg font-medium">{attr}</label>
                <span className="text-sm text-gray-500">
                  Base Chance: {calculateBaseChance(finalValue)}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="number"
                  min="3"
                  max="18"
                  value={value || ''}
                  onChange={(e) => handleManualEntry(attr, e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {modifier !== 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Age Modifier:</span>
                    <span className={modifier > 0 ? 'text-green-600' : 'text-red-600'}>
                      {modifier > 0 ? `+${modifier}` : modifier}
                    </span>
                  </div>
                )}
                {value > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Final Value:</span>
                    <span className="font-medium text-blue-600">{finalValue}</span>
                  </div>
                )}
              </div>
              {(attr === 'STR' || attr === 'AGL') && finalValue > 12 && (
                <p className="mt-2 text-sm text-blue-600">
                  Damage Bonus: {calculateDamageBonus(finalValue)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Movement and Damage Bonus Summary */}
      {character.kin && Object.values(attributes).every((attr) => attr.value > 0) && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-gray-700">Movement</h4>
              <p className="text-2xl font-bold text-green-700">{calculateMovement()}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700">STR Damage Bonus</h4>
              <p className="text-2xl font-bold text-blue-700">
                {calculateDamageBonus(getFinalValue('STR', attributes.STR.value))}
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-700">AGL Damage Bonus</h4>
              <p className="text-2xl font-bold text-blue-700">
                {calculateDamageBonus(getFinalValue('AGL', attributes.AGL.value))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Age Modifier Notice */}
      {character.age && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Age Modifiers Applied</h4>
            <p className="text-sm text-amber-700">
              {character.age === 'Young' && "Young: +1 CON, +1 AGL"}
              {character.age === 'Adult' && "Adult: No attribute modifiers"}
              {character.age === 'Old' && "Old: -2 STR, -2 CON, -2 AGL, +1 INT, +1 WIL"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
