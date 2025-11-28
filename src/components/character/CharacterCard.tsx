import React from 'react';
import { Character } from '../../types/character';
import { Dumbbell, Heart, Feather, Brain, Zap, UserCog, User } from 'lucide-react';

interface CharacterCardProps {
  character: Character;
}

export function CharacterCard({ character }: CharacterCardProps) {
  const getAttributeColor = (value: number) => {
    if (value >= 16) return 'text-purple-700 bg-purple-50 border-purple-200';
    if (value >= 14) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (value >= 12) return 'text-green-700 bg-green-50 border-green-200';
    if (value >= 10) return 'text-gray-700 bg-gray-50 border-gray-200';
    return 'text-gray-500 bg-gray-50 border-gray-100';
  };

  const StatBadge = ({ icon: Icon, value, label }: { icon: any, value: number, label: string }) => (
    <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg border ${getAttributeColor(value)} transition-colors`}>
      <Icon className="w-3.5 h-3.5 mb-0.5 opacity-70" />
      <span className="text-xs font-bold leading-none">{value}</span>
      <span className="text-[8px] uppercase font-bold tracking-wider opacity-60 mt-0.5">{label}</span>
    </div>
  );

  return (
    <div 
      className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full"
    >
      {/* Header / Image Area - Reduced height to h-32 */}
      <div className="relative h-32 bg-gray-100 overflow-hidden shrink-0">
        {character.portrait_url ? (
          <img 
            src={character.portrait_url} 
            alt={character.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gradient-to-br from-gray-50 to-gray-200">
            <User size={40} strokeWidth={1} />
          </div>
        )}
        
        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />

        {/* Floating Badges */}
        <div className="absolute top-2 right-2">
             <span className="px-2 py-0.5 text-[10px] font-bold text-white bg-black/40 backdrop-blur-md rounded-full border border-white/20">
                Age {character.age}
            </span>
        </div>
        
        <div className="absolute bottom-0 left-0 p-3 text-white w-full">
            <h3 className="text-lg font-bold leading-tight truncate text-shadow-sm">{character.name}</h3>
            <p className="text-xs text-gray-200 opacity-90 truncate font-medium">
              {character.kin} {character.profession}
            </p>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 flex flex-col flex-grow gap-3">
        
        {/* Attributes Grid */}
        <div className="grid grid-cols-6 gap-1.5">
          <StatBadge icon={Dumbbell} value={character.attributes.STR} label="STR" />
          <StatBadge icon={Heart} value={character.attributes.CON} label="CON" />
          <StatBadge icon={Feather} value={character.attributes.AGL} label="AGL" />
          <StatBadge icon={Brain} value={character.attributes.INT} label="INT" />
          <StatBadge icon={Zap} value={character.attributes.WIL} label="WIL" />
          <StatBadge icon={UserCog} value={character.attributes.CHA} label="CHA" />
        </div>

        {/* Footer Info */}
        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1" title="Hit Points">
                    <Heart className="w-3 h-3 text-red-500 fill-red-50" /> 
                    <span className="font-medium text-gray-700">
                        {character.current_hp ?? 0}/{character.max_hp}
                    </span>
                </span>
                <span className="flex items-center gap-1" title="Willpower">
                    <Zap className="w-3 h-3 text-blue-500 fill-blue-50" /> 
                    <span className="font-medium text-gray-700">
                        {character.current_wp ?? 0}/{character.max_wp}
                    </span>
                </span>
            </div>
            {character.appearance && (
                <span className="max-w-[100px] truncate opacity-60 italic text-[10px]">
                    {character.appearance}
                </span>
            )}
        </div>
      </div>
    </div>
  );
}