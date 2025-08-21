import React, { useState, useMemo } from 'react';
import { Ability, Character, isSkillNameRequirement } from '../../types/character'; // Import type guard
import { useCharacterAbilities } from '../../hooks/useCharacterAbilities';
import { Swords, AlertCircle, Info, Star, Zap, ShieldAlert } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useCharacterSheetStore } from '../../stores/characterSheetStore'; // Import the store

interface HeroicAbilitiesViewProps {
  onClose: () => void;
}

// Helper function to format requirement object into a string
const formatRequirementObject = (req: { [skillName: string]: number | null }): string => {
  return Object.entries(req)
    .map(([skillName, level]) => {
      return level !== null ? `${skillName} (Level ${level})` : skillName;
    })
    .join(', ');
};

// Helper function to safely render the requirement
const renderRequirement = (requirement: Ability['requirement']): string | null => {
  if (!requirement) {
    return null; // No requirement
  }
  if (typeof requirement === 'string') {
    // Simple string requirement (legacy or specific text)
    return requirement;
  }
  if (isSkillNameRequirement(requirement)) {
    // New object format { skillName: level }
    return formatRequirementObject(requirement);
  }
  // Fallback for unexpected object types - log and display minimally
  if (typeof requirement === 'object') {
    console.warn('Unexpected requirement object format:', requirement);
    // Attempt to display keys if it's the problematic object
    return `Requires: ${Object.keys(requirement).join(', ')}`;
  }

  // Fallback for other unexpected types
  console.warn('Unexpected requirement type:', typeof requirement, requirement);
  return 'Unknown requirement format';
};


export function HeroicAbilitiesView({ onClose }: HeroicAbilitiesViewProps) {
  const { character, updateCharacterData, isSaving, setActiveStatusMessage } = useCharacterSheetStore();
  const { data: allAbilities, isLoading: loading, error: fetchError } = useCharacterAbilities();
  const [activationError, setActivationError] = useState<string | null>(null);

  React.useEffect(() => {
    console.log("HeroicAbilitiesView - Character Data:", character);
  }, [character]);


  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6">
          <LoadingSpinner />
          <p className="text-gray-600 mt-2">Loading character data...</p>
        </div>
      </div>
    );
  }

  const availableAbilities = useMemo(() => {
    if (!allAbilities || !character || !character.heroic_ability) {
      console.log("Filtering abilities: Missing data", { allAbilities: !!allAbilities, character: !!character, heroic_ability: character?.heroic_ability });
      return [];
    }
    const characterAbilityNames = new Set(
        Array.isArray(character.heroic_ability) ? character.heroic_ability : []
    );
    console.log("Filtering abilities: Character abilities names:", characterAbilityNames);

    const filtered = allAbilities.filter(ability => characterAbilityNames.has(ability.name));
    console.log("Filtering abilities: Filtered result:", filtered);
    return filtered;

  }, [allAbilities, character]);


  const handleActivate = async (ability: Ability) => {
    setActivationError(null);
    console.log(`Attempting to activate ability: ${ability.name}`);

    const cost = ability.willpower_cost;
    // *** READ character.current_wp ***
    const currentWP = character.current_wp; 

    console.log(`Ability cost: ${cost}, Current WP: ${currentWP}`);

    if (cost === null || cost === undefined || cost <= 0) { 
      console.log(`Activated free ability: ${ability.name}`);
      setActiveStatusMessage(`Used Heroic Ability: ${ability.name}`);
      return; 
    }

    if (typeof currentWP !== 'number') {
        const errorMsg = `Cannot activate ${ability.name}: Current Willpower (current_wp) is not a valid number. Value: ${currentWP}`;
        setActivationError(errorMsg);
        console.error(errorMsg);
        return;
    }


    if (currentWP >= cost) {
      const newWP = currentWP - cost;
      console.log(`Sufficient WP. New WP will be: ${newWP}`);
      try {
        // *** UPDATE current_wp via Zustand ***
        console.log(`Calling updateCharacterData with: { current_wp: ${newWP} }`);
        await updateCharacterData({ current_wp: newWP });
        console.log(`Successfully activated ability: ${ability.name}. WP updated to: ${newWP}`);
        setActiveStatusMessage(`Used Heroic Ability: ${ability.name} for ${cost} WP.`);
      } catch (updateError: any) {
        const errorMsg = `Failed to update Willpower for ${ability.name}: ${updateError.message}`;
        setActivationError(errorMsg);
        console.error("Error updating WP via store:", updateError);
      }
    } else {
      const errorMsg = `Not enough Willpower Points to activate ${ability.name}. Required: ${cost}, Available: ${currentWP}`;
      setActivationError(errorMsg);
      console.warn(errorMsg);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="text-gray-600 mt-2">Loading heroic abilities...</p>
        </div>
      );
    }

    if (fetchError) {
      return (
        <div className="p-6">
          <ErrorMessage message={`Failed to load abilities: ${fetchError.message}`} />
        </div>
      );
    }

    if (character.profession === 'Mage') { 
      return (
        <div className="p-6">
          <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">Magic Instead of Heroic Abilities</h4>
              <p className="text-sm text-blue-700">
                As a mage, you use magic instead of heroic abilities. Check the Spells tab to manage your magical capabilities.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (!availableAbilities || availableAbilities.length === 0) {
       return (
         <div className="p-6">
           <div className="flex items-start gap-2 p-4 bg-gray-50 border border-gray-200 rounded-lg">
             <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
             <div>
               <h4 className="font-medium text-gray-800">No Heroic Abilities Assigned</h4>
               <p className="text-sm text-gray-700">
                 This character does not currently have any heroic abilities assigned in their profile (check `characters.heroic_ability`), or the abilities could not be loaded from the `heroic_abilities` table.
               </p>
             </div>
           </div>
         </div>
       );
     }

    return (
      <div className="space-y-6 p-4 md:p-6">
        {activationError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800">Activation Failed</h4>
              <p className="text-sm text-red-700">{activationError}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {availableAbilities.map((ability) => {
            const cost = ability.willpower_cost;
            // *** READ character.current_wp ***
            const currentWP = character.current_wp; 
            const canAfford = cost === null || cost === undefined || cost <= 0 || (typeof currentWP === 'number' && currentWP >= cost);
            const requirementText = renderRequirement(ability.requirement);

            return (
              <div key={ability.id} className="p-6 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">{ability.name}</h3>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                      {cost !== null && cost !== undefined && cost > 0 ? (
                        <>
                          <Star className="w-4 h-4 text-amber-500" />
                          <span>{cost} WP</span>
                        </>
                      ) : (
                        <span className="text-green-600">Free</span>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-600 mb-4 text-sm">{ability.description}</p>
                  {requirementText && (
                    <p className="text-xs text-gray-500 mb-4">Requirement: {requirementText}</p>
                  )}
                </div>
                <Button
                  onClick={() => handleActivate(ability)}
                  disabled={!canAfford || isSaving}
                  loading={isSaving}
                  variant={canAfford ? 'default' : 'secondary'}
                  size="sm"
                  className="w-full mt-4"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Activate {cost !== null && cost !== undefined && cost > 0 ? `(${cost} WP)` : ''}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // *** Determine current WP display value using character.current_wp ***
  const displayWP = typeof character.current_wp === 'number' ? character.current_wp : 'N/A';
  console.log("Displaying WP:", displayWP, "(raw value:", character.current_wp, ")");


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Swords className="w-6 h-6 text-blue-600" />
                Heroic Abilities
              </h2>
              <p className="text-gray-600">
                {/* *** Display the calculated displayWP *** */}
                Available Willpower: {displayWP} WP
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-3xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-grow">
          {renderContent()}
        </div>

        <div className="p-4 border-t flex justify-end">
           <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
