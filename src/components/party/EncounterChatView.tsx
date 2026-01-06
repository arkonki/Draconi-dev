import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Loader2, X, Heart, ShieldAlert, RotateCcw, Skull, Sword } from 'lucide-react';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore'; // Restored Store Import
import { Character } from '../../types/character';
import { 
  fetchAllEncountersForParty, 
  fetchEncounterCombatants, 
  updateCombatant, 
  appendEncounterLog 
} from '../../lib/api/encounters';
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';

// --- SUB-COMPONENT: PLAYER CARD ---
const PlayerCombatantCard = ({ combatant, currentCharacterId, onFlip, onUpdateInitiative }: any) => {
  const [initValue, setInitValue] = useState(combatant.initiative_roll?.toString() ?? '');
  
  // Sync local state if server changes it
  useEffect(() => {
    setInitValue(combatant.initiative_roll?.toString() ?? '');
  }, [combatant.initiative_roll]);

  const isMyCharacter = combatant.character_id === currentCharacterId;
  const isMonster = !!combatant.monster_id;
  const hasActed = combatant.has_acted;
  const isDefeated = (isMonster || !isMonster) && combatant.current_hp === 0;
  const isDying = !isMonster && combatant.current_hp === 0;

  let borderClass = isMonster ? 'border-orange-200 bg-orange-50' : 'border-teal-200 bg-teal-50';
  if (isMyCharacter) borderClass = 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-md';
  if (isDefeated) borderClass = 'border-stone-300 bg-stone-200 opacity-60';
  else if (hasActed) borderClass = 'border-stone-200 bg-stone-100 opacity-60 grayscale';

  const handleInitBlur = () => {
    const val = parseInt(initValue);
    if (!isNaN(val) && val !== combatant.initiative_roll) {
      onUpdateInitiative(combatant.id, val);
    }
  };

  return (
    <div className={`relative p-3 rounded-lg border-l-4 transition-all ${borderClass}`}>
      {/* Turn Indicator Ping */}
      {!hasActed && !isDefeated && isMyCharacter && (
         <div className="absolute -right-1 -top-1 w-3 h-3 bg-blue-500 rounded-full animate-ping" />
      )}

      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
           {/* Initiative Card */}
           <div className={`w-8 h-8 flex items-center justify-center rounded font-serif font-bold text-lg border ${hasActed ? 'bg-stone-200 text-stone-500 border-stone-300' : 'bg-white text-stone-900 border-stone-400'}`}>
              {combatant.initiative_roll || '-'}
           </div>
           
           <div>
              <p className={`font-bold text-sm ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
                {combatant.display_name}
              </p>
              {isDying && <span className="text-[10px] font-bold text-red-600 flex items-center gap-1 uppercase tracking-wider"><Skull size={10}/> Dying</span>}
              {isMyCharacter && !isDefeated && <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">You</span>}
           </div>
        </div>
        
        {/* HP Status */}
        <div className="flex items-center gap-1 text-xs font-mono bg-white/60 px-2 py-1 rounded border border-black/5">
           <Heart className={`w-3 h-3 ${combatant.current_hp === 0 ? 'text-stone-400' : 'text-red-600'}`} />
           <span>{combatant.current_hp} / {combatant.max_hp}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 h-7">
        <div className="flex-1">
          {/* Initiative Input (Only if not set) */}
          {!combatant.initiative_roll && isMyCharacter && !isDefeated && (
             <input 
               type="number" 
               value={initValue} 
               onChange={(e) => setInitValue(e.target.value)} 
               onBlur={handleInitBlur}
               placeholder="#" 
               className="w-full max-w-[4rem] px-2 py-0.5 text-center border rounded text-xs font-bold focus:ring-2 focus:ring-blue-400 outline-none" 
             />
          )}
        </div>

        {/* Action Button */}
        {(isMyCharacter) && !isDefeated && (
          <Button 
            onClick={() => onFlip(combatant.id, hasActed)} 
            size="xs" 
            variant={hasActed ? "ghost" : "primary"}
            className={hasActed ? "text-stone-500 hover:text-stone-700" : "shadow-sm"}
            title={hasActed ? "Mark as Active" : "End Turn / Reaction"}
          >
            {hasActed ? <RotateCcw size={12} className="mr-1"/> : <ShieldAlert size={12} className="mr-1"/>}
            {hasActed ? "Undo" : "End Turn"}
          </Button>
        )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
export function EncounterChatView({ character: propCharacter }: { character?: Character | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  
  // FIX: Fallback to Store if prop is missing (Backward Compatibility)
  const storeCharacter = useCharacterSheetStore((state) => state.character);
  const character = propCharacter ?? storeCharacter;

  // SAFEGUARD: If still no character or no party, hide the widget
  if (!character || !character.party_id) {
    return null; 
  }

  // 1. Find Active Encounter
  const { data: encounters } = useQuery({
    queryKey: ['allEncounters', character.party_id],
    queryFn: () => fetchAllEncountersForParty(character.party_id!),
    enabled: !!character.party_id,
    refetchInterval: 5000 
  });

  const activeEncounter = useMemo(() => 
    encounters?.find(e => e.status === 'active'), 
  [encounters]);

  // 2. Fetch Combatants for Active Encounter
  const { data: combatants } = useQuery({
    queryKey: ['encounterCombatants', activeEncounter?.id],
    queryFn: () => activeEncounter ? fetchEncounterCombatants(activeEncounter.id) : Promise.resolve([]),
    enabled: !!activeEncounter?.id
  });

  // 3. Realtime Hook 
  useEncounterRealtime(activeEncounter?.id || null);

  // 4. Mutations
  const updateCombatantMu = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateCombatant(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] })
  });

  const logMu = useMutation({
    mutationFn: (entry: any) => appendEncounterLog(activeEncounter!.id, entry)
  });

  const handleFlip = (id: string, currentStatus: boolean) => {
    updateCombatantMu.mutate({ id, updates: { has_acted: !currentStatus } });
  };

  const handleInitiative = (id: string, val: number) => {
    updateCombatantMu.mutate({ id, updates: { initiative_roll: val } });
    logMu.mutate({ type: 'generic', ts: Date.now(), message: `${character.name} rolled initiative: ${val}` });
  };

  const isInCombat = !!activeEncounter;

  const sortedCombatants = useMemo(() => {
    return [...(combatants || [])].sort((a, b) => {
      const ia = a.initiative_roll ?? 1000;
      const ib = b.initiative_roll ?? 1000;
      if (ia !== ib) return ia - ib;
      return (a.display_name ?? '').localeCompare(b.display_name ?? '');
    });
  }, [combatants]);

  return (
    <>
      <button 
        className={`fixed bottom-4 right-4 p-3 md:p-4 rounded-full shadow-xl text-white transition-all duration-300 z-50 hover:scale-105 active:scale-95 
          ${isInCombat ? 'bg-gradient-to-br from-red-600 to-red-800 ring-4 ring-red-400/30 animate-pulse-slow' : 'bg-stone-700 hover:bg-stone-600'}
        `} 
        onClick={() => setIsOpen(!isOpen)}
        title={isInCombat ? "View Combat Tracker" : "Party Chat / Log"}
      >
        {isInCombat ? <Sword size={24} /> : <MessageSquare size={24} />}
        {isInCombat && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            
            {/* Drawer */}
            <div 
              className="absolute right-0 bottom-16 md:bottom-0 top-0 w-full max-w-sm bg-stone-100 shadow-2xl flex flex-col border-l border-stone-300 animate-in slide-in-from-right-5" 
              onClick={(e) => e.stopPropagation()}
            >
            
            {/* Header */}
            <div className={`p-4 text-white shadow-md flex justify-between items-center ${isInCombat ? 'bg-red-900' : 'bg-stone-800'}`}>
              <div>
                <h2 className="text-lg font-bold font-serif tracking-wide flex items-center gap-2">
                  {isInCombat ? <Sword size={18} /> : <MessageSquare size={18} />}
                  {isInCombat ? 'Combat Active' : 'Adventure Log'}
                </h2>
                {isInCombat && <span className="text-xs text-red-200 font-mono">Round {activeEncounter.current_round}</span>}
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-white"><X size={20} /></button>
            </div>

            {/* Content Area */}
            <div className="flex-grow overflow-y-auto p-4 bg-[url('https://www.transparenttextures.com/patterns/paper.png')] bg-stone-100">
              {isInCombat ? (
                <div className="space-y-4">
                  {/* Encounter Info */}
                  <div className="bg-white p-3 rounded shadow-sm border border-stone-200">
                     <h3 className="font-bold text-stone-800">{activeEncounter.name}</h3>
                     {activeEncounter.description && <p className="text-xs text-stone-500 mt-1">{activeEncounter.description}</p>}
                  </div>
                  
                  {/* Combatant List */}
                  <div className="space-y-2 pb-20">
                    <div className="flex justify-between items-end border-b border-stone-300 pb-1 mb-2">
                      <h4 className="font-bold text-stone-500 uppercase text-xs tracking-wider">Turn Order</h4>
                    </div>
                    
                    {sortedCombatants.length > 0 ? (
                      sortedCombatants.map(c => (
                        <PlayerCombatantCard 
                          key={c.id} 
                          combatant={c} 
                          currentCharacterId={character.id}
                          onFlip={handleFlip}
                          onUpdateInitiative={handleInitiative}
                        />
                      ))
                    ) : (
                      <div className="text-center py-6 text-stone-400">
                         <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                         <span className="text-xs">Waiting for DM setup...</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                 <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                    <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                    <p className="italic">The party is currently resting.</p>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}