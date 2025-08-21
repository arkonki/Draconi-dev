import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { GraduationCap, AlertCircle, Check, Star } from 'lucide-react';

interface ExperienceSystemProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export function ExperienceSystem({ character, onUpdate }: ExperienceSystemProps) {
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    character.experience?.markedSkills || []
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Group skills by attribute
  const skillGroups = {
    STR: ['Axes', 'Brawling', 'Crafting', 'Hammers', 'Spears', 'Swords'],
    AGL: ['Acrobatics', 'Bows', 'Crossbows', 'Evade', 'Hunting & Fishing', 'Knives', 'Riding', 'Sleight of Hand', 'Sneaking', 'Swimming'],
    INT: ['Awareness', 'Beast Lore', 'Bushcraft', 'Healing', 'Languages', 'Myths & Legends', 'Seamanship', 'Spot Hidden'],
    WIL: character.magicSchool ? [character.magicSchool] : [],
    CHA: ['Bartering', 'Bluffing', 'Performance', 'Persuasion']
  };

  const handleSkillToggle = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const handleAdvance = async () => {
    try {
      // Update experience in database
      const { error } = await supabase
        .from('characters')
        .update({
          experience: {
            ...character.experience,
            markedSkills: selectedSkills
          }
        })
        .eq('id', character.id);

      if (error) throw error;

      // Update local state
      onUpdate({
        ...character,
        experience: {
          ...character.experience,
          markedSkills: selectedSkills
        }
      });

      setSuccess('Experience updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update experience');
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600" />
            Experience Tracking
          </h2>
          <p className="text-sm text-gray-600">
            Mark skills where you rolled a Dragon (1) or Bane (20) during play
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(skillGroups).map(([attribute, skills]) => (
          <div key={attribute} className="space-y-2">
            <h3 className="font-medium">{attribute} Skills</h3>
            {skills.map(skill => (
              <div
                key={skill}
                onClick={() => handleSkillToggle(skill)}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                  selectedSkills.includes(skill)
                    ? 'bg-blue-50 border-blue-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedSkills.includes(skill)
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-300'
                }`}>
                  {selectedSkills.includes(skill) && <Check className="w-3 h-3" />}
                </div>
                <span>{skill}</span>
                {character.trainedSkills.includes(skill) && (
                  <span className="ml-auto text-xs text-blue-600 font-medium">
                    Trained
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-4">
        <button
          onClick={handleAdvance}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Star className="w-5 h-5" />
          Save Progress
        </button>
      </div>
    </div>
  );
}
