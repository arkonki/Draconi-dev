import React, { useState, useMemo } from 'react';
import { useCharacterSheetStore, HeroicAbility } from '../../stores/characterSheetStore';
import { isSkillNameRequirement } from '../../types/character';
import { Star, Zap, X, ShieldCheck, Info, Sparkles } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

// --- HELPER FUNCTIONS ---
const formatRequirementObject = (req: { [skillName: string]: number | null }): string => { return Object.entries(req).map(([skillName, level]) => level !== null ? `${skillName} (Lvl ${level})` : skillName).join(', '); };
const renderRequirement = (requirement: HeroicAbility['requirement']): string | null => { if (!requirement) return null; if (typeof requirement === 'string') return requirement; if (isSkillNameRequirement(requirement)) return formatRequirementObject(requirement); return 'Complex requirement'; };

// --- COMPONENT: DETAIL PANE ---
const AbilityDetailPane = ({ ability, onClose }: { ability: HeroicAbility | null; onClose: () => void; }) => {
  if (!ability) return null;
  const requirementText = renderRequirement(ability.requirement);
  
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto transition-opacity" onClick={onClose} />
      
      {/* Pane */}
      <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col pointer-events-auto border-l border-stone-200 animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b bg-stone-50 flex justify-between items-start">
            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Heroic Ability</div>
                <h3 className="text-2xl font-serif font-bold text-stone-900 leading-none">{ability.name}</h3>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-6 bg-white text-stone-800">
            <div className="prose prose-stone prose-sm max-w-none leading-relaxed italic border-l-4 border-orange-300 pl-4 text-stone-600">
                {ability.description}
            </div>
            
            <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-lg border border-stone-100">
               <div className="flex items-center gap-2">
                  <div className="p-2 bg-white rounded shadow-sm border border-stone-200 text-orange-600"><Zap size={16}/></div>
                  <div>
                     <span className="block text-xs font-bold text-stone-400 uppercase">Cost</span>
                     <span className="font-bold">{ability.willpower_cost ? `${ability.willpower_cost} WP` : 'Free / Passive'}</span>
                  </div>
               </div>
            </div>

            {requirementText && (
               <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-900">
                  <span className="font-bold uppercase text-xs text-amber-700 block mb-1">Prerequisite</span>
                  {requirementText}
               </div>
            )}
        </div>
        
        <div className="p-4 border-t bg-stone-50 flex justify-end">
           <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
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
    const currentWP = character.current_wp ?? character.attributes.WIL;
    
    if (cost === null || cost <= 0) { 
        setActiveStatusMessage(`Activated: ${ability.name}`); 
        return; 
    }
    
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

  // Render Helper
  const renderContent = () => {
    if (isLoading) return <div className="flex justify-center p-8"><LoadingSpinner size="sm" /></div>;
    if (error) return <ErrorMessage message={error} />;
    
    if (character?.profession === 'Mage') { 
      return (
        <div className="text-center py-12 px-4 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50/50">
           <Sparkles className="w-10 h-10 mx-auto text-purple-300 mb-2"/>
           <p className="text-stone-500 font-medium">Mages rely on Spells.</p>
           <p className="text-xs text-stone-400">Visit the Spells tab to manage your magic.</p>
        </div>
      );
    }
    
    if (availableAbilities.length === 0) {
       return (
         <div className="text-center py-12 px-4 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50/50">
            <ShieldCheck className="w-10 h-10 mx-auto text-stone-300 mb-2"/>
            <p className="text-stone-500 font-medium">No heroic abilities learned yet.</p>
         </div>
       );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {availableAbilities.map((ability) => {
          const cost = ability.willpower_cost;
          const currentWP = character?.current_wp ?? 0;
          const canAfford = cost === null || cost <= 0 || currentWP >= cost;
          
          return (
            <div 
              key={ability.id} 
              onClick={() => setInfoPaneAbility(ability)}
              className="relative flex flex-col justify-between p-4 bg-white rounded-xl border border-stone-200 shadow-sm hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group overflow-hidden"
            >
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-serif font-bold text-stone-800 group-hover:text-orange-700 transition-colors line-clamp-1">{ability.name}</h4>
                <div className={`text-xs font-bold px-2 py-0.5 rounded ${cost ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                   {cost ? `${cost} WP` : 'Passive'}
                </div>
              </div>
              
              <p className="text-xs text-stone-500 line-clamp-2 mb-4 flex-grow leading-relaxed">
                {ability.description}
              </p>
              
              <div className="mt-auto pt-3 border-t border-stone-100 flex justify-end" onClick={e => e.stopPropagation()}>
                 <Button 
                    onClick={() => handleActivate(ability)} 
                    disabled={!canAfford || isSaving} 
                    loading={isSaving} 
                    size="xs"
                    className={`w-full ${canAfford ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
                 >
                    <Zap className="w-3 h-3 mr-1.5 fill-current" /> Activate
                 </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="space-y-4 relative">
      
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-orange-50 border border-orange-200 rounded-lg">
         <h3 className="font-serif font-bold text-orange-900 flex items-center gap-2 text-lg">
           <ShieldCheck className="w-5 h-5" /> Heroic Abilities
         </h3>
         <div className="text-xs font-bold text-orange-800 bg-white/60 px-2 py-1 rounded border border-orange-200">
            {character?.current_wp} WP Available
         </div>
      </div>

      {/* Error Banner */}
      {activationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
           <Info size={14} /> {activationError}
        </div>
      )}

      {/* Content Grid */}
      {renderContent()}

      {/* Slide-out Pane */}
      <AbilityDetailPane ability={infoPaneAbility} onClose={() => setInfoPaneAbility(null)} />
    </div>
  );
}
