import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { GraduationCap, AlertCircle, Check } from 'lucide-react';

interface ExperienceModalProps {
  character: Character;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function ExperienceModal({ character, onClose, onUpdate }: ExperienceModalProps) {
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    character.experience?.markedSkills || []
  );
  const [error, setError] = useState<string | null>(null);

  const handleSkillToggle = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const handleAdvance = async () => {
    try {
      const newExperience = {
        ...character.experience,
        markedSkills: selectedSkills
      };

      const { error } = await supabase
        .from('characters')
        .update({ experience: newExperience })
        .eq('id', character.id);

      if (error) throw error;

      onUpdate({
        ...character,
        experience: newExperience
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update experience');
    }
  };

  // Group skills by attribute
  const skillGroups = {
    STR: ['Axes', 'Brawling', 'Crafting', 'Hammers', 'Spears', 'Swords'],
    AGL: ['Acrobatics', 'Bows', 'Crossbows', 'Evade', 'Hunting & Fishing', 'Knives', 'Riding', 'Sleight of Hand', 'Sneaking', 'Swimming'],
    INT: ['Awareness', 'Beast Lore', 'Bushcraft', 'Healing', 'Languages', 'Myths & Legends', 'Seamanship', 'Spot Hidden'],
    WIL: character.magicSchool ? [character.magicSchool] : [],
    CHA: ['Bartering', 'Bluffing', 'Performance', 'Persuasion']
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold">Experience</h2>
              <p className="text-gray-600">
                Mark skills that rolled a Dragon (1) or Bane (20) during play
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
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
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAdvance}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <GraduationCap className="w-5 h-5" />
              Save Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
