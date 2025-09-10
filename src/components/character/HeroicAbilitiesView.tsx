import React, { useState, useMemo } from 'react';
import { useCharacterSheetStore, HeroicAbility } from '../../stores/characterSheetStore';
import { isSkillNameRequirement } from '../../types/character';
import { Swords, Star, Zap, ShieldAlert, Info, X, ShieldCheck } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

// --- (AbilityDetailPane and helper functions are unchanged) ---
const AbilityDetailPane = ({ ability, onClose }: { ability: HeroicAbility | null; onClose: () => void; }) => {
  if (!ability) return null;
  const requirementText = renderRequirement(ability.requirement);
  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-25 z-50" onClick={onClose} aria-hidden="true" />
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${ability ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center border-b pb-4"><h3 className="text-2xl font-bold text-gray-800">{ability.name}</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button></div>
          <div className="overflow-y-auto mt-4 flex-grow space-y-4 text-gray-700">
            <p className="text-sm italic border-l-4 border-gray-200 pl-4 py-1">{ability.description}</p>
            {requirementText && (<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg"><h4 className="font-semibold text-amber-800 text-sm">Requirement</h4><p className="text-sm text-amber-700">{requirementText}</p></div>)}
          </div>
        </div>
      </div>
    </>
  );
};
const formatRequirementObject = (req: { [skillName: string]: number | null }): string => { return Object.entries(req).map(([skillName, level]) => level !== null ? `${skillName} (Lvl ${level})` : skillName).join(', '); };
const renderRequirement = (requirement: HeroicAbility['requirement']): string | null => { if (!requirement) return null; if (typeof requirement === 'string') return requirement; if (isSkillNameRequirement(requirement)) return formatRequirementObject(requirement); return 'Complex requirement'; };

export function HeroicAbilitiesView() {
  const { character, allHeroicAbilities, isLoading, error, updateCharacterData, isSaving, setActiveStatusMessage } = useCharacterSheetStore();
  const [activationError, setActivationError] = useState<string | null>(null);
  const [infoPaneAbility, setInfoPaneAbility] = useState<HeroicAbility | null>(null);

  const availableAbilities = useMemo(() => {
    if (!allHeroicAbilities || !character?.heroic_abilities) return [];
    const characterAbilityNames = new Set(Array.isArray(character.heroic_abilities) ? character.heroic_abilities : []);
    return allHeroicAbilities.filter(ability => characterAbilityNames.has(ability.name));
  }, [allHeroicAbilities, character?.heroic_abilities]);

  const handleActivate = async (ability: HeroicAbility) => {
    if (!character) return;
    setActivationError(null);
    const cost = ability.willpower_cost;
    const currentWP = character.current_wp;
    if (cost === null || cost <= 0) { setActiveStatusMessage(`Used: ${ability.name}`); return; }
    if (typeof currentWP !== 'number') { setActivationError(`Invalid WP.`); return; }
    if (currentWP >= cost) {
      try {
        await updateCharacterData({ current_wp: currentWP - cost });
        setActiveStatusMessage(`Used ${ability.name} for ${cost} WP.`);
      } catch (updateError: any) {
        setActivationError(`Failed to update WP: ${updateError.message}`);
      }
    } else {
      setActivationError(`Not enough WP. Need ${cost}, have ${currentWP}`);
    }
  };

  const AbilityRow = ({ ability }: { ability: HeroicAbility }) => {
    const cost = ability.willpower_cost;
    const currentWP = character?.current_wp; 
    const canAfford = cost === null || cost <= 0 || (typeof currentWP === 'number' && currentWP >= cost);
    return (
      <div className="flex items-center justify-between p-3 border-b bg-white hover:bg-gray-50/50 last:border-b-0">
        {/* --- THIS IS THE FIX --- */}
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Stop the click from bubbling to the parent container
            setInfoPaneAbility(ability);
          }} 
          className="text-left"
        >
          <h4 className="font-semibold text-gray-800 hover:text-blue-600 transition-colors">{ability.name}</h4>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 w-20 justify-end">
            {cost !== null && cost > 0 ? (<><Star className="w-4 h-4 text-amber-500" /><span>{cost} WP</span></>) : (<span className="text-green-600">Free</span>)}
          </div>
          <Button onClick={(e) => { e.stopPropagation(); handleActivate(ability); }} disabled={!canAfford || isSaving} loading={isSaving} variant="secondary" size="xs" className="w-28">
            <Zap className="w-4 h-4 mr-1" /> Activate
          </Button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) return <LoadingSpinner size="sm" />;
    if (error) return <ErrorMessage message={error} />;
    if (character?.profession === 'Mage') { 
      return <p className="text-sm text-gray-500 italic p-4">Mages use spells instead of heroic abilities.</p>;
    }
    if (availableAbilities.length === 0) {
       return <p className="text-sm text-gray-500 italic p-4">No heroic abilities learned.</p>;
    }
    return (
      <div className="space-y-2">
        {activationError && (
          <div className="p-2 mx-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{activationError}</div>
        )}
        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
          {availableAbilities.map((ability) => <AbilityRow key={ability.id} ability={ability} />)}
        </div>
      </div>
    );
  };
  
  return (
    // The parent container that closes the pane
    <div className="relative" onClick={() => setInfoPaneAbility(null)}>
      {/* The main content area where clicks should NOT close the pane */}
      <div className="bg-white p-4 rounded-lg border" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700">
          <ShieldCheck className="w-5 h-5 text-orange-600" /> Heroic Abilities
        </h3>
        {renderContent()}
      </div>
      {/* The pane itself */}
      <AbilityDetailPane ability={infoPaneAbility} onClose={() => setInfoPaneAbility(null)} />
    </div>
  );
}