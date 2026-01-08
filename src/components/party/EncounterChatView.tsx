import React, { useState, useEffect } from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore'; 
import { MessageSquare, Dices, Loader2, X, Heart, ShieldAlert, RotateCcw, Skull, Zap } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';
import type { EncounterCombatant } from '../../types/encounter';

// --- SUB-COMPONENT: EDITABLE STAT BOX ---
const StatInput = ({ 
  value, 
  max, 
  icon: Icon, 
  colorClass, 
  onChange,
  disabled 
}: { 
  value: number, 
  max: number, 
  icon: any, 
  colorClass: string, 
  onChange: (val: number) => void,
  disabled: boolean
}) => {
  const [localVal, setLocalVal] = useState(String(value));

  useEffect(() => {
    setLocalVal(String(value));
  }, [value]);

  const handleBlur = () => {
    const num = parseInt(localVal);
    if (!isNaN(num) && num !== value) {
      onChange(num);
    } else {
      setLocalVal(String(value)); // Reset on invalid
    }
  };

  return (
    <div className="flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm h-7">
      <div className={`px-1.5 h-full flex items-center justify-center bg-stone-50 border-r border-stone-200`}>
        <Icon className={`w-3 h-3 ${value === 0 ? 'text-stone-400' : colorClass}`} />
      </div>
      <input 
        type="number" 
        className="w-10 px-1 text-center font-bold text-sm outline-none focus:bg-blue-50"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={disabled}
      />
      <div className="px-1.5 h-full flex items-center justify-center text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">
        /{max}
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: PLAYER COMBATANT CARD ---
const CombatantCard = ({ combatant }: { combatant: EncounterCombatant }) => {
  const { setInitiativeForCombatant, updateCombatant, isSaving, character } = useCharacterSheetStore();
  
  // Local state for initiative input
  const [initiativeValue, setInitiativeValue] = useState<string>(combatant.initiative_roll?.toString() ?? '');

  useEffect(() => {
    setInitiativeValue(combatant.initiative_roll?.toString() ?? '');
  }, [combatant.initiative_roll]);

  const handleSetInitiative = () => {
    const initiative = parseInt(initiativeValue, 10);
    if (!isNaN(initiative) && initiative >= 1 && initiative <= 10) {
      setInitiativeForCombatant(combatant.id, initiative);
    }
  };

  const isMyCharacter = combatant.character_id === character?.id;
  const isPlayer = !!combatant.character_id;
  const hasActed = combatant.has_acted || false;
  const isMonster = !isPlayer;
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = isPlayer && combatant.current_hp === 0;

  // Permissions: I can edit myself, or I can edit monsters (if table rules allow players to track monster dmg)
  // For safety, let's say I can only fully edit myself, but initiative/flip is open.
  const canEditStats = isMyCharacter; 

  let borderClass = isPlayer ? 'border-teal-600 bg-teal-50' : 'border-orange-700 bg-orange-50';
  if (isDefeated) borderClass = 'border-stone-400 bg-stone-200 opacity-70';
  else if (hasActed) borderClass = 'border-stone-300 bg-stone-100 opacity-70 grayscale';
  
  return (
    <div className={`relative p-3 rounded-lg border-l-4 shadow-sm transition-all ${borderClass}`}>
      {isDefeated && (
        <div className="absolute inset-0 flex items-center justify-center z-0 opacity-20">
          <span className="text-3xl font-black uppercase -rotate-12 text-black">Defeated</span>
        </div>
      )}

      {/* HEADER: Name & Initiative */}
      <div className="relative z-10 flex justify-between items-start mb-2">
        <div className="flex-grow">
          <p className={`font-bold leading-tight ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
            {combatant.display_name}
          </p>
          {isDying && <span className="text-xs font-bold text-red-600 flex items-center gap-1"><Skull size={12}/> DYING</span>}
        </div>

        {/* INITIATIVE BOX */}
        <div className="flex items-center gap-2 ml-2">
          {(!combatant.initiative_roll || isMyCharacter) && !isDefeated ? (
             <div className="flex items-center gap-1">
               <input 
                 type="number" 
                 value={initiativeValue} 
                 onChange={(e) => setInitiativeValue(e.target.value)} 
                 placeholder="#" 
                 className="w-8 px-1 py-0.5 text-center border rounded text-sm font-bold" 
                 min="1" max="10" 
                 disabled={isSaving} 
               />
               {!combatant.initiative_roll && (
                 <Button onClick={handleSetInitiative} size="xs" variant="secondary" disabled={isSaving}>Set</Button>
               )}
             </div>
          ) : (
             <div className="w-8 h-8 bg-white border-2 border-stone-800 rounded flex items-center justify-center font-serif font-bold text-lg shadow-sm">
               {combatant.initiative_roll}
             </div>
          )}
        </div>
      </div>

      {/* STATS ROW (HP & WP) */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* HP INPUT */}
          <StatInput 
            value={combatant.current_hp || 0} 
            max={combatant.max_hp || 10} 
            icon={Heart} 
            colorClass="text-red-600"
            disabled={!canEditStats || isSaving}
            onChange={(val) => updateCombatant(combatant.id, { current_hp: val })}
          />

          {/* WP INPUT (Only for players/NPCs with WP) */}
          {(isPlayer || (combatant.max_wp || 0) > 0) && (
            <StatInput 
              value={combatant.current_wp || 0} 
              max={combatant.max_wp || 10} 
              icon={Zap} 
              colorClass="text-blue-600"
              disabled={!canEditStats || isSaving}
              onChange={(val) => updateCombatant(combatant.id, { current_wp: val })}
            />
          )}
        </div>

        {/* ACTION BUTTON */}
        {(isMyCharacter || !isPlayer) && !isDefeated && (
          <Button 
            onClick={() => updateCombatant(combatant.id, { has_acted: !combatant.has_acted })} 
            size="xs" 
            variant={hasActed ? "ghost" : "outline"}
            className={hasActed ? "text-stone-500" : "text-stone-800 border-stone-400 bg-white"}
            title="End Turn"
          >
            {hasActed ? <RotateCcw size={14} /> : <ShieldAlert size={14} />}
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

  // 1. LISTEN FOR PARTY EVENTS (Status Changes)
  useEffect(() => {
    if (!character?.party_id || !character?.id) return;
    
    // Initial fetch
    fetchActiveEncounter(character.party_id, character.id);

    const channel = supabase.channel(`party-monitor-${character.party_id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'encounters', 
          filter: `party_id=eq.${character.party_id}` 
        },
        () => {
          if (character.party_id && character.id) {
             fetchActiveEncounter(character.party_id, character.id);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [character?.party_id, character?.id, fetchActiveEncounter]);

  // 2. LISTEN FOR COMBATANT CHANGES
  useEffect(() => {
    if (!activeEncounter?.id || !character?.party_id || !character?.id) return;

    const channel = supabase.channel(`combat-monitor-${activeEncounter.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'encounter_combatants', 
          filter: `encounter_id=eq.${activeEncounter.id}` 
        },
        () => {
           fetchActiveEncounter(character.party_id!, character.id!);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeEncounter?.id, character?.party_id, character?.id, fetchActiveEncounter]);

  if (!character) return null;

  const isInActiveEncounter = activeEncounter?.status === 'active';
  
  const sortedCombatants = [...(encounterCombatants || [])].sort((a, b) => {
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
            
            <div className="flex justify-between items-center p-4 bg-stone-800 text-white shadow-md">
              <div>
                <h2 className="text-lg font-bold font-serif tracking-wide">{isInActiveEncounter ? 'Combat' : 'Party Chat'}</h2>
                {isInActiveEncounter && <span className="text-xs text-green-400 uppercase font-bold">Round {activeEncounter.current_round}</span>}
              </div>
              <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-white"><X size={24} /></button>
            </div>

            <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-[url('/parchment-bg.png')] bg-repeat">
              {isLoadingEncounter && !activeEncounter ? (
                <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-stone-500" /></div>
              ) : activeEncounter ? (
                <div className="space-y-4">
                  <div className="bg-white p-3 rounded shadow-sm border border-stone-200">
                     <h3 className="font-bold text-lg text-stone-800">{activeEncounter.name}</h3>
                     <p className="text-xs text-stone-500">{activeEncounter.description}</p>
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