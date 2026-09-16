import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { GraduationCap, AlertCircle, Check } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';

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
    <AccessibleDialog
      onClose={onClose}
      title="Experience"
      description="Mark skills that rolled a Dragon (1) or Demon (20) during play."
      size="xl"
      layer="nested"
      fullScreenMobile
      bodyClassName="p-4 sm:p-6"
      footer={(
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={GraduationCap} onClick={handleAdvance}>Save Progress</Button>
        </div>
      )}
    >
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {Object.entries(skillGroups).map(([attribute, skills]) => (
              <fieldset key={attribute} className="space-y-2">
                <h3 className="font-medium">{attribute} Skills</h3>
                {skills.map(skill => (
                  <button
                    type="button"
                    key={skill}
                    onClick={() => handleSkillToggle(skill)}
                    aria-pressed={selectedSkills.includes(skill)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded p-2 text-left ${
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
                  </button>
                ))}
              </fieldset>
            ))}
          </div>
    </AccessibleDialog>
  );
}
