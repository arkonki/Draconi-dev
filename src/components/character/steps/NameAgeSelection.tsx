import React from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { User, Calendar } from 'lucide-react';

interface AgeModifiers {
  attributes: {
    STR: number;
    CON: number;
    AGL: number;
    INT: number;
    WIL: number;
    CHA: number;
  };
  skillPoints: number;
}

const ageModifiers: Record<'Young' | 'Adult' | 'Old', AgeModifiers> = {
  Young: {
    attributes: {
      STR: 0,
      CON: +1,
      AGL: +1,
      INT: 0,
      WIL: 0,
      CHA: 0
    },
    skillPoints: 8
  },
  Adult: {
    attributes: {
      STR: 0,
      CON: 0,
      AGL: 0,
      INT: 0,
      WIL: 0,
      CHA: 0
    },
    skillPoints: 10
  },
  Old: {
    attributes: {
      STR: -2,
      CON: -2,
      AGL: -2,
      INT: +1,
      WIL: +1,
      CHA: 0
    },
    skillPoints: 12
  }
};

export function NameAgeSelection() {
  const { character, updateCharacter } = useCharacterCreation();

  const renderModifier = (value: number) => {
    if (value === 0) return 'No change';
    return value > 0 ? `+${value}` : value;
  };

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Character Details</h3>
        <p className="text-gray-600">
          Choose a name that fits your character's background and select their age category.
          Age affects your starting attributes and the number of skill points available during character creation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Name Input */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Character Name</label>
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={character.name || ''}
              onChange={(e) => updateCharacter({ name: e.target.value })}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter character name"
            />
          </div>
        </div>

        {/* Age Selection */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Age Category</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['Young', 'Adult', 'Old'] as const).map((age) => (
              <div
                key={age}
                className={`relative rounded-lg border p-6 cursor-pointer transition-all ${
                  character.age === age
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
                onClick={() => updateCharacter({ age })}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className={`h-5 w-5 ${
                    character.age === age ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                  <h4 className="text-lg font-medium">{age}</h4>
                </div>

                <div className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">Attribute Modifiers</h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {Object.entries(ageModifiers[age].attributes).map(([attr, mod]) => (
                        mod !== 0 && (
                          <div key={attr} className="flex justify-between">
                            <span className="text-gray-600">{attr}:</span>
                            <span className={mod > 0 ? 'text-green-600' : 'text-red-600'}>
                              {renderModifier(mod)}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">Skill Points</h5>
                    <p className="text-sm text-blue-600 font-medium">
                      {ageModifiers[age].skillPoints} points
                    </p>
                  </div>

                  <div className="text-xs text-gray-500">
                    {age === 'Young' && 'Quick to learn, physically developing'}
                    {age === 'Adult' && 'Balanced attributes and experience'}
                    {age === 'Old' && 'Wise and knowledgeable, physically declining'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selection Summary */}
      {(character.name || character.age) && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="space-y-2">
            {character.name && (
              <p className="text-green-800">
                Name: <strong>{character.name}</strong>
              </p>
            )}
            {character.age && (
              <div className="space-y-1">
                <p className="text-green-800">
                  Age Category: <strong>{character.age}</strong>
                </p>
                <p className="text-sm text-green-700">
                  Starting Skill Points: <strong>{ageModifiers[character.age].skillPoints}</strong>
                </p>
                {Object.entries(ageModifiers[character.age].attributes)
                  .filter(([_, mod]) => mod !== 0)
                  .map(([attr, mod]) => (
                    <p key={attr} className="text-sm text-green-700">
                      {attr} Modifier: <strong>{renderModifier(mod)}</strong>
                    </p>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
