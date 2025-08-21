import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Character } from '../../../types/character';
import { Book, AlertCircle, Check, X, Search } from 'lucide-react';

interface SkillAdvancementModalProps {
  character: Character;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function SkillAdvancementModal({ character, onClose, onUpdate }: SkillAdvancementModalProps) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Group skills by attribute
  const skillGroups = {
    STR: ['Axes', 'Brawling', 'Crafting', 'Hammers', 'Spears', 'Swords'],
    AGL: ['Acrobatics', 'Bows', 'Crossbows', 'Evade', 'Hunting & Fishing', 'Knives', 'Riding', 'Sleight of Hand', 'Sneaking', 'Swimming'],
    INT: ['Awareness', 'Beast Lore', 'Bushcraft', 'Healing', 'Languages', 'Myths & Legends', 'Seamanship', 'Spot Hidden'],
    WIL: character.magicSchool ? [character.magicSchool] : [],
    CHA: ['Bartering', 'Bluffing', 'Performance', 'Persuasion']
  };

  // Get all available skills that aren't already trained
  const availableSkills = Object.values(skillGroups)
    .flat()
    .filter(skill => !character.trainedSkills.includes(skill))
    .filter(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleConfirm = async () => {
    try {
      if (!selectedSkill) {
        setError('Please select a skill to learn');
        return;
      }

      const newTrainedSkills = [...character.trainedSkills, selectedSkill];

      const { error: updateError } = await supabase
        .from('characters')
        .update({
          trained_skills: newTrainedSkills
        })
        .eq('id', character.id);

      if (updateError) throw updateError;

      onUpdate({
        ...character,
        trainedSkills: newTrainedSkills
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to learn new skill');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Book className="w-6 h-6 text-blue-600" />
                Learn New Skill
              </h2>
              <p className="text-gray-600">
                Select a skill to learn. Once learned, a skill's base chance is doubled.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Error</h4>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Skills Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto mb-6">
            {availableSkills.map((skill) => {
              const attribute = Object.entries(skillGroups)
                .find(([_, skills]) => skills.includes(skill))?.[0];

              return (
                <div
                  key={skill}
                  onClick={() => setSelectedSkill(skill)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedSkill === skill
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{skill}</h4>
                      <p className="text-sm text-gray-600">
                        {attribute} Attribute
                      </p>
                    </div>
                    {selectedSkill === skill && (
                      <Check className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedSkill}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-5 h-5" />
              Learn Skill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
