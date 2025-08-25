import React, { useState, useMemo } from 'react';
// UPDATED: Import the HeroicAbility type from the store, not a generic Ability type
import { useCharacterSheetStore, HeroicAbility } from '../../stores/characterSheetStore';
import { isSkillNameRequirement } from '../../types/character';
import { Swords, Star, Zap, ShieldAlert, Info } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

interface HeroicAbilitiesViewProps {
  onClose: () => void;
}

// Helper function to format requirement object into a string
const formatRequirementObject = (req: { [skillName: string]: number | null }): string => {
  return Object.entries(req)
    .map(([skillName, level]) => level !== null ? `${skillName} (Level ${level})` : skillName)
    .join(', ');
};

// Helper function to safely render the requirement
const renderRequirement = (requirement: HeroicAbility['requirement']): string | null => {
  if (!requirement) return null;
  if (typeof requirement === 'string') return requirement;
  if (isSkillNameRequirement(requirement)) return formatRequirementObject(requirement);
  if (typeof requirement === 'object') {
    console.warn('Unexpected requirement object format:', requirement);
    return `Requires: ${Object.keys(requirement).join(', ')}`;
  }
  console.warn('Unexpected requirement type:', typeof requirement, requirement);
  return 'Unknown requirement format';
};

export function HeroicAbilitiesView({ onClose }: HeroicAbilitiesViewProps) {
  // UPDATED: Get ALL data from the single source of truth: the character sheet store.
  const { 
    character, 
    allHeroicAbilities, 
    isLoading, 
    error, 
    updateCharacterData, 
    isSaving, 
    setActiveStatusMessage 
  } = useCharacterSheetStore();
  
  // REMOVED: The redundant, separate data-fetching hook is no longer needed.
  // const { data: allAbilities, isLoading: loading, error: fetchError } = useCharacterAbilities();

  const [activationError, setActivationError] = useState<string | null>(null);

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
    // UPDATED: Use `allHeroicAbilities` from the store and check the correct property name.
    if (!allHeroicAbilities || !character || !character.heroic_abilities) {
      return [];
    }
    // FIX: The property on the Character type is `heroic_abilities` (plural).
    const characterAbilityNames = new Set(
        Array.isArray(character.heroic_abilities) ? character.heroic_abilities : []
    );
    
    return allHeroicAbilities.filter(ability => characterAbilityNames.has(ability.name));
  }, [allHeroicAbilities, character]);

  const handleActivate = async (ability: HeroicAbility) => {
    setActivationError(null);
    const cost = ability.willpower_cost;
    const currentWP = character.current_wp;

    if (cost === null || cost <= 0) { 
      setActiveStatusMessage(`Used Heroic Ability: ${ability.name}`);
      return; 
    }

    if (typeof currentWP !== 'number') {
        const errorMsg = `Cannot activate ${ability.name}: Current Willpower is invalid.`;
        setActivationError(errorMsg);
        return;
    }

    if (currentWP >= cost) {
      const newWP = currentWP - cost;
      try {
        await updateCharacterData({ current_wp: newWP });
        setActiveStatusMessage(`Used Heroic Ability: ${ability.name} for ${cost} WP.`);
      } catch (updateError: any) {
        setActivationError(`Failed to update Willpower: ${updateError.message}`);
      }
    } else {
      setActivationError(`Not enough Willpower. Required: ${cost}, Available: ${currentWP}`);
    }
  };

  const renderContent = () => {
    // UPDATED: Use the main `isLoading` flag from the store.
    if (isLoading) {
      return (
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="text-gray-600 mt-2">Loading character data...</p>
        </div>
      );
    }

    // UPDATED: Use the main `error` property from the store.
    if (error) {
      return (
        <div className="p-6">
          <ErrorMessage message={`Failed to load required data: ${error}`} />
        </div>
      );
    }
    
    if (character.profession === 'Mage') { 
      return (
        <div className="p-6">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">Magic Instead of Heroic Abilities</h4>
              <p className="text-sm text-blue-700">As a mage, you use magic instead of heroic abilities. Check the Spells tab to manage your capabilities.</p>
            </div>
          </div>
        </div>
      );
    }
    
    if (availableAbilities.length === 0) {
       return (
         <div className="p-6">
           <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
             <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
             <div>
               <h4 className="font-medium text-gray-800">No Heroic Abilities Assigned</h4>
               <p className="text-sm text-gray-700">This character does not currently have any heroic abilities assigned.</p>
             </div>
           </div>
         </div>
       );
     }

    return (
      <div className="space-y-6 p-4 md:p-6">
        {activationError && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
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
            const currentWP = character.current_wp; 
            const canAfford = cost === null || cost <= 0 || (typeof currentWP === 'number' && currentWP >= cost);
            const requirementText = renderRequirement(ability.requirement);

            return (
              <div key={ability.id} className="p-6 border rounded-lg bg-white shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">{ability.name}</h3>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                      {cost !== null && cost > 0 ? (<><Star className="w-4 h-4 text-amber-500" /><span>{cost} WP</span></>) : (<span className="text-green-600">Free</span>)}
                    </div>
                  </div>
                  <p className="text-gray-600 mb-4 text-sm">{ability.description}</p>
                  {requirementText && (<p className="text-xs text-gray-500 mb-4">Requirement: {requirementText}</p>)}
                </div>
                <Button onClick={() => handleActivate(ability)} disabled={!canAfford || isSaving} loading={isSaving} variant={canAfford ? 'default' : 'secondary'} size="sm" className="w-full mt-4">
                  <Zap className="w-4 h-4 mr-2" />
                  Activate {cost !== null && cost > 0 ? `(${cost} WP)` : ''}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const displayWP = typeof character.current_wp === 'number' ? character.current_wp : 'N/A';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2"><Swords className="w-6 h-6 text-blue-600" />Heroic Abilities</h2>
            <p className="text-gray-600">Available Willpower: {displayWP} WP</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl leading-none" aria-label="Close">×</button>
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
