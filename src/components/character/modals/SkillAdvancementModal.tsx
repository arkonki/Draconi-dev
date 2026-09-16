import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Character } from '../../../types/character';
import { Book, AlertCircle, Check, Search } from 'lucide-react';
import { AccessibleDialog } from '../../shared/AccessibleDialog';
import { Button } from '../../shared/Button';

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
    <AccessibleDialog
      onClose={onClose}
      title="Learn New Skill"
      description="Select a skill to learn. Once learned, its base chance is doubled."
      icon={<Book className="h-6 w-6 text-blue-600" />}
      size="lg"
      layer="nested"
      fullScreenMobile
      bodyClassName="p-4 sm:p-6"
      footer={(
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={handleConfirm} disabled={!selectedSkill}>Learn Skill</Button>
        </div>
      )}
    >
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
                .find(([, skills]) => skills.includes(skill))?.[0];

              return (
                <button
                  type="button"
                  key={skill}
                  onClick={() => setSelectedSkill(skill)}
                  aria-pressed={selectedSkill === skill}
                  className={`min-h-11 rounded-lg border p-4 text-left transition-all ${
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
                </button>
              );
            })}
          </div>
    </AccessibleDialog>
  );
}
