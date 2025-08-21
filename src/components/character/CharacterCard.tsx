import React from 'react';
import { Character } from '../../types/character';
import { Shield, Swords, Brain, Heart, Zap, Users } from 'lucide-react';

interface CharacterCardProps {
  character: Character;
}

export function CharacterCard({ character }: CharacterCardProps) {
  const getAttributeColor = (value: number) => {
    if (value >= 16) return 'text-purple-600';
    if (value >= 14) return 'text-blue-600';
    if (value >= 12) return 'text-green-600';
    if (value >= 10) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{character.name}</h3>
            <p className="text-sm text-gray-600">
              {character.kin} {character.profession}
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            {character.age}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-600" />
            <span className={getAttributeColor(character.attributes.STR)}>
              {character.attributes.STR}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-600" />
            <span className={getAttributeColor(character.attributes.CON)}>
              {character.attributes.CON}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-yellow-600" />
            <span className={getAttributeColor(character.attributes.AGL)}>
              {character.attributes.AGL}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-600" />
            <span className={getAttributeColor(character.attributes.INT)}>
              {character.attributes.INT}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600" />
            <span className={getAttributeColor(character.attributes.WIL)}>
              {character.attributes.WIL}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            <span className={getAttributeColor(character.attributes.CHA)}>
              {character.attributes.CHA}
            </span>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          <p className="line-clamp-2">{character.appearance || 'No appearance set'}</p>
        </div>
      </div>
    </div>
  );
}
