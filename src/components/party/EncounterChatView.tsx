import React, { useState, useEffect } from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { MessageSquare, Dices, Loader2, X, Heart, ShieldAlert, RotateCcw, Skull } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';
import type { EncounterCombatant } from '../../types/encounter';

// --- SUB-COMPONENT: PLAYER COMBATANT CARD ---
const CombatantCard = ({ combatant }: { combatant: EncounterCombatant }) => {
  const { setInitiativeForCombatant, updateCombatant, isSaving, character } = useCharacterSheetStore();
  const [initiativeValue, setInitiativeValue] = useState<string>(combatant.initiative_roll?.toString() ?? '');

  // SYNC LOCAL STATE
  useEffect(() => {
    setInitiativeValue(combatant.initiative_roll?.toString() ?? '');
  }, [combatant.initiative_roll]);

  const handleSetInitiative = () => {
    const initiative = parseInt(initiativeValue, 10);
    if (!isNaN(initiative) && initiative >= 1 && initiative <= 10) {
      setInitiativeForCombatant(combatant.id, initiative);
    }
  };

  const handleFlipCard = () => {
    // Toggle the 'has_acted' status for reactions (Parry/Dodge) or end of turn
    updateCombatant(combatant.id, { has_acted: !combatant.has_acted });
  };

  // STATUS CHECKS
  const isMyCharacter = combatant.character_id === character?.id;
  const isPlayer = !!combatant.character_id;
  const hasActed = combatant.has_acted || false;
  
  // Dragonbane Death: Monsters get "Defeated" status, Players get "Dying"
  const isMonster = !isPlayer;
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = isPlayer && combatant.current_hp === 0;

  // STYLES
  let borderClass = isPlayer ? 'border-teal-600 bg-teal-50' : 'border-orange-700 bg-orange-50';
  if (isDefeated) borderClass = 'border-stone-400 bg-stone-200 opacity-70';
  else if (hasActed) borderClass = 'border-stone-300 bg-stone-100 opacity-70 grayscale';
  
  return (
    <div className={`relative p-3 rounded-lg border-l-4 shadow-sm transition-all ${borderClass}`}>
      {/* DEFEATED OVERLAY */}
      {isDefeated && (
        <div className="absolute inset-0 flex items-center justify-center z-0 opacity-20">
          <span className="text-3xl font-black uppercase -rotate-12 text-black">Defeated</span>
        </div>
      )}

      <div className="relative z-10 flex justify-between items-start">
        <div>
          <p className={`font-bold ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
            {combatant.display_name}
          </p>
          {isDying && <span className="text-xs font-bold text-red-600 flex items-center gap-1"><Skull size={12}/> DYING</span>}
        </div>
        
        {/* HP Display */}
        <div className="flex items-center gap-1 text-sm font-mono bg-white/50 px-2 py-1 rounded">
           <Heart className={`w-3 h-3 ${combatant.current_hp === 0 ? 'text-stone-400' : 'text-red-600'}`} />
           <span>{combatant.current_hp} / {combatant.max_hp}</span>
        </div>
      </div>

      {/* ACTIONS ROW */}
      <div className="relative z-10 mt-3 flex items-center justify-between">
        {/* Initiative Input (Only editable if not set or by owner) */}
        <div className="flex items-center gap-2">
          {(!combatant.initiative_roll || isMyCharacter) && !isDefeated ? (
             <>
               <input 
                 type="number" 
                 value={initiativeValue} 
                 onChange={(e) => setInitiativeValue(e.target.value)} 
                 placeholder="#" 
                 className="w-12 px-1 py-0.5 text-center border rounded text-sm font-bold" 
                 min="1" max="10" 
                 disabled={isSaving} 
               />
               {!combatant.initiative_roll && (
                 <Button onClick={handleSetInitiative} size="xs" variant="secondary" disabled={isSaving}>Set</Button>
               )}
             </>
          ) : (
             <div className="w-8 h-8 bg-white border-2 border-stone-800 rounded flex items-center justify-center font-serif font-bold text-lg shadow-sm">
               {combatant.initiative_roll}
             </div>
          )}
        </div>

        {/* Flip Card Button (Only for my character or if I'm GM) */}
        {(isMyCharacter || !isPlayer) && !isDefeated && (
          <Button 
            onClick={handleFlipCard} 
            size="xs" 
            variant={hasActed ? "ghost" : "outline"}
            className={hasActed ? "text-stone-500" : "text-stone-800 border-stone-400 bg-white"}
          >
            {hasActed ? <RotateCcw size={14} className="mr-1"/> : <ShieldAlert size={14} className="mr-1"/>}
            {hasActed ? "Recover" : "Flip / Reaction"}
          </Button>
        )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export function EncounterChatView() {
  const {
    character,
    activeEncounter,
    encounterCombatants,
    isLoadingEncounter,
    fetchActiveEncounter,
  } = useCharacterSheetStore();

  const [isOpen, setIsOpen] = useState(false);

  // REAL-TIME LISTENER
  useEffect(() => {
    if (!character?.party_id || !character?.id) return;

    const partyId = character.party_id;
    const characterId = character.id;
    const channel = supabase.channel(`party-encounter-updates-${partyId}`);

    // Listen for ANY change in the encounter tables
    const refresh = () => {
       console.log('Syncing encounter data...');
       fetchActiveEncounter(partyId, characterId);
    };

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters', filter: `party_id=eq.${partyId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounter_combatants' }, refresh)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [character, fetchActiveEncounter]);

  if (!character) return null;

  const isInActiveEncounter = activeEncounter?.status === 'active';
  
  // DRAGONBANE SORTING: Ascending (1 -> 10), Nulls last
  const sortedCombatants = [...encounterCombatants].sort((a, b) => {
    const ia = a.initiative_roll ?? 1000;
    const ib = b.initiative_roll ?? 1000;
    if (ia !== ib) return ia - ib;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });

  return (
    <>
      <button 
        className={`fixed bottom-4 right-4 p-4 rounded-full shadow-lg text-white transition-all duration-200 z-40 hover:scale-105 ${isInActiveEncounter ? 'bg-red-700 hover:bg-red-800 ring-2 ring-red-400 animate-pulse-slow' : 'bg-blue-600 hover:bg-blue-700'}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        {isInActiveEncounter ? <Dices size={24} /> : <MessageSquare size={24} />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-30 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div className="bg-stone-100 w-full max-w-sm h-full shadow-2xl flex flex-col border-l border-stone-300" onClick={(e) => e.stopPropagation()}>
            
            {/* HEADER */}
            <div className="flex justify-between items-center p-4 bg-stone-800 text-white shadow-md">
              <div>
                <h2 className="text-lg font-bold font-serif tracking-wide">{isInActiveEncounter ? 'Combat' : 'Party Chat'}</h2>
                {isInActiveEncounter && <span className="text-xs text-green-400 uppercase font-bold">Round {activeEncounter.current_round}</span>}
              </div>
              <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-white"><X size={24} /></button>
            </div>

            {/* CONTENT */}
            <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-[url('/parchment-bg.png')] bg-repeat">
              {isLoadingEncounter && !activeEncounter ? (
                <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-stone-500" /></div>
              ) : activeEncounter ? (
                <div className="space-y-4">
                  <div className="bg-white p-3 rounded shadow-sm border border-stone-200">
                     <h3 className="font-bold text-lg text-stone-800">{activeEncounter.name}</h3>
                     <p className="text-xs text-stone-500">{activeEncounter.description || "No description"}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-end border-b border-stone-300 pb-1">
                      <h4 className="font-bold text-stone-600 uppercase text-xs tracking-wider">Initiative Track</h4>
                    </div>
                    
                    {sortedCombatants.length > 0 ? (
                      sortedCombatants.map(combatant => <CombatantCard key={combatant.id} combatant={combatant} />)
                    ) : (
                      <p className="text-sm text-stone-500 italic text-center py-4">The battlefield is empty.</p>
                    )}
                  </div>
                </div>
              ) : (
                 <div className="text-stone-500 text-center mt-10 italic">The party is resting.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
