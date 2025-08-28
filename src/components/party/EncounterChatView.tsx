import React, { useState, useEffect } from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { MessageSquare, Dices, Loader2, X, Heart } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';
import type { EncounterCombatant } from '../../types/encounter';

// CombatantCard Sub-Component
// This component is well-structured and does not need changes.
// Its local state will automatically update when its props change from the store.
const CombatantCard = ({ combatant }: { combatant: EncounterCombatant }) => {
  const { setInitiativeForCombatant, isSaving } = useCharacterSheetStore();
  const [initiativeValue, setInitiativeValue] = useState<string>(combatant.initiative_roll?.toString() ?? '');

  const handleSetInitiative = () => {
    const initiative = parseInt(initiativeValue, 10);
    if (!isNaN(initiative) && initiative >= 1 && initiative <= 10) {
      setInitiativeForCombatant(combatant.id, initiative);
    } else {
      alert("Please enter a number between 1 and 10.");
    }
  };

  // This effect correctly syncs the input field if the data changes from the server
  useEffect(() => {
    setInitiativeValue(combatant.initiative_roll?.toString() ?? '');
  }, [combatant.initiative_roll]);

  const isPlayer = !!combatant.character_id;

  return (
    <div className={`p-3 rounded-lg border-l-4 ${isPlayer ? 'border-blue-500 bg-blue-50' : 'border-red-500 bg-red-50'}`}>
      <div className="flex justify-between items-start">
        <p className="font-bold">{combatant.display_name}</p>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Heart className="w-4 h-4 text-red-600" />
            <span>{combatant.current_hp} / {combatant.max_hp}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" value={initiativeValue} onChange={(e) => setInitiativeValue(e.target.value)} placeholder="1-10" className="w-20 px-2 py-1 border rounded-md" min="1" max="10" disabled={isSaving} />
        <Button onClick={handleSetInitiative} size="sm" disabled={isSaving}>Set</Button>
      </div>
      {combatant.conditions && Object.entries(combatant.conditions).filter(([, isActive]) => isActive).length > 0 && (
        <div className="mt-2 text-xs text-red-700">Conditions: {Object.entries(combatant.conditions).filter(([, isActive]) => isActive).map(([key]) => key).join(', ')}</div>
      )}
    </div>
  );
};

// Main View Component
export function EncounterChatView() {
  const {
    character,
    activeEncounter,
    encounterCombatants,
    isLoadingEncounter,
    fetchActiveEncounter,
  } = useCharacterSheetStore();

  const [isOpen, setIsOpen] = useState(false);

  // --- ⭐️ FIX: REAL-TIME LISTENER EFFECT ---
  // This hook is now updated to listen to changes on BOTH the encounter
  // itself and the individual combatants within it.
  useEffect(() => {
    if (!character?.party_id || !character?.id) {
      return;
    }

    const partyId = character.party_id;
    const characterId = character.id;

    console.log(`Attempting to subscribe to real-time updates for Party ID: ${partyId}`);
    const channel = supabase.channel(`party-encounter-updates-${partyId}`);

    // LISTENER 1: For changes to the encounter itself (e.g., round change, status change)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'encounters', filter: `party_id=eq.${partyId}` },
      (payload) => {
        console.log('%cREAL-TIME UPDATE (Encounters): Refetching encounter.', 'color: cyan;', payload);
        fetchActiveEncounter(partyId, characterId);
      }
    );

    // LISTENER 2: For changes to the combatants (HP, initiative, conditions, etc.)
    // This is the key fix for your issue.
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'encounter_combatants',
        // This advanced filter listens for changes to combatants
        // whose encounter_id belongs to an encounter for the current party.
        filter: `encounter_id=in.(select id from encounters where party_id=eq.${partyId})`
      },
      (payload) => {
        console.log('%cREAL-TIME UPDATE (Combatants): Refetching encounter.', 'color: lightgreen;', payload);
        // We call the same function, as it correctly re-fetches all encounter data.
        fetchActiveEncounter(partyId, characterId);
      }
    );

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('%cSuccessfully subscribed to real-time channel!', 'color: green; font-weight: bold;');
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('%cCHANNEL_ERROR: Failed to subscribe.', 'color: red; font-weight: bold;', err);
      }
    });

    return () => {
      console.log(`Unsubscribing from party updates: ${partyId}`);
      supabase.removeChannel(channel);
    };
  }, [character, fetchActiveEncounter]);


  // --- Render Logic (No changes needed here) ---

  if (!character) {
    return null;
  }

  const isInActiveEncounter = activeEncounter?.status === 'active';
  const buttonColorClass = isInActiveEncounter ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  const buttonText = isInActiveEncounter ? 'Encounter Active' : 'Party Chat';
  // Sort combatants by initiative for display
  const sortedCombatants = [...encounterCombatants].sort((a, b) => (b.initiative_roll ?? 0) - (a.initiative_roll ?? 0));
  const allInitiativesSet = isInActiveEncounter && sortedCombatants.every(c => c.initiative_roll !== null);

  return (
    <>
      <button className={`fixed bottom-4 right-4 p-4 rounded-full shadow-lg text-white transition-colors duration-200 z-40 ${buttonColorClass}`} onClick={() => setIsOpen(!isOpen)} aria-label={buttonText}>
        {isInActiveEncounter ? <Dices size={24} /> : <MessageSquare size={24} />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-30" onClick={() => setIsOpen(false)}>
          <div className="bg-white w-full max-w-sm h-full shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">{isInActiveEncounter ? 'Active Encounter' : 'Party Chat'}</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={24} /></button>
            </div>
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
              {isLoadingEncounter && !activeEncounter ? (
                <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
              ) : activeEncounter ? (
                <div className="space-y-4">
                  <div>
                     <h3 className="text-xl font-semibold">{activeEncounter.name}</h3>
                     <p className="text-sm">Round: <span className="font-medium">{activeEncounter.current_round}</span></p>
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-2">{allInitiativesSet ? 'Turn Order' : 'Set Initiative'}</h4>
                    <div className="space-y-3">
                      {sortedCombatants.length > 0 ? (
                        sortedCombatants.map(combatant => <CombatantCard key={combatant.id} combatant={combatant} />)
                      ) : (
                        <p className="text-sm text-gray-500">No combatants in this encounter yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                 <div className="text-gray-600 text-center">No active encounter for your party.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}