import React from 'react';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { AlertCircle } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';

interface ConditionsModalProps {
  character: Character;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function ConditionsModal({ character, onClose, onUpdate }: ConditionsModalProps) {
  const handleConditionToggle = async (condition: keyof typeof character.conditions) => {
    try {
      const newConditions = {
        ...character.conditions,
        [condition]: !character.conditions[condition]
      };

      const { error } = await supabase
        .from('characters')
        .update({ conditions: newConditions })
        .eq('id', character.id);

      if (error) throw error;

      onUpdate({
        ...character,
        conditions: newConditions
      });
    } catch (err) {
      console.error('Error updating condition:', err);
    }
  };

  const conditionDescriptions = {
    exhausted: {
      attribute: 'STR',
      description: 'Bane on all Strength-based skill rolls'
    },
    sickly: {
      attribute: 'CON',
      description: 'Bane on all Constitution-based skill rolls'
    },
    dazed: {
      attribute: 'AGL',
      description: 'Bane on all Agility-based skill rolls'
    },
    angry: {
      attribute: 'INT',
      description: 'Bane on all Intelligence-based skill rolls'
    },
    scared: {
      attribute: 'WIL',
      description: 'Bane on all Willpower-based skill rolls'
    },
    disheartened: {
      attribute: 'CHA',
      description: 'Bane on all Charisma-based skill rolls'
    }
  };

  return (
    <AccessibleDialog
      onClose={onClose}
      title="Conditions"
      description="Conditions apply a bane to rolls using their associated attribute."
      size="md"
      layer="nested"
      fullScreenMobile
      bodyClassName="p-4 sm:p-6"
    >
          <div className="space-y-4">
            {Object.entries(conditionDescriptions).map(([condition, info]) => (
              <button
                type="button"
                key={condition}
                className="w-full min-h-11 rounded-lg border p-4 text-left hover:bg-gray-50"
                onClick={() => handleConditionToggle(condition as keyof typeof character.conditions)}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={character.conditions[condition as keyof typeof character.conditions]}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={() => {}}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <h3 className="font-medium capitalize">
                      {condition} ({info.attribute})
                    </h3>
                    <p className="text-sm text-gray-600">{info.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800">About Conditions</h4>
                <p className="text-sm text-amber-700">
                  Conditions are typically gained when pushing rolls. They affect all skill rolls
                  associated with their attribute until removed through rest or other means.
                </p>
              </div>
            </div>
          </div>
    </AccessibleDialog>
  );
}
