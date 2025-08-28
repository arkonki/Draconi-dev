import React from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
// ... other imports (keep them as they are)
import { MessageSquare, Dices, Loader2, X, Heart } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';
import type { EncounterCombatant } from '../../types/encounter';


// The CombatantCard component does not need any changes.
const CombatantCard = ({ combatant }: { combatant: EncounterCombatant }) => {
  // ... Paste the full CombatantCard code from the previous version here ...
  const { setInitiativeForCombatant, isSaving } = useCharacterSheetStore();
  const [initiativeValue, setInitiativeValue] = React.useState<string>(combatant.initiative_roll?.toString() ?? '');
  const handleSetInitiative = () => {
    const initiative = parseInt(initiativeValue, 10);
    if (!isNaN(initiative) && initiative >= 1 && initiative <= 10) {
      setInitiativeForCombatant(combatant.id, initiative);
    } else {
      alert("Please enter a number between 1 and 10.");
    }
  };
  React.useEffect(() => {
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


export function EncounterChatView() {
  const {
    character,
    activeEncounter,
    encounterCombatants,
    isLoadingEncounter,
    fetchActiveEncounter,
  } = useCharacterSheetStore();

  const [isOpen, setIsOpen] = React.useState(false);

  // --- NEW DIAGNOSTIC LOG ---
  // This log will run every time the component renders.
  console.log('EncounterChatView Render. Character from store:', character);

  // --- Real-Time Listener ---
  React.useEffect(() => {
    if (!character?.party_id || !character?.id) {
      // This is the gate that is likely stopping us.
      return;
    }

    // The rest of this hook is from the previous correct version.
    const partyId = character.party_id;
    const characterId = character.id;

    console.log(`Attempting to subscribe to real-time updates with Party ID: ${partyId}`);

    const channel = supabase.channel(`party-encounter-updates-${partyId}`);
    
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encounters', filter: `party_id=eq.${partyId}` },
        (payload) => {
          console.log('%cREAL-TIME UPDATE RECEIVED (Encounters)', 'color: lightgreen; font-weight: bold;', payload);
          fetchActiveEncounter(partyId, characterId);
        }
      )
      .subscribe((status, err) => {
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
  }, [character?.party_id, character?.id, fetchActiveEncounter]);


  // --- The rest of the component's JSX is unchanged ---
  if (!character?.party_id) {
    // This is a failsafe, but our useEffect already checks this.
    return null;
  }
  
  const isInActiveEncounter = activeEncounter?.status === 'active';
  const buttonColorClass = isInActiveEncounter ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  const buttonText = isInActiveEncounter ? 'Encounter Active' : 'Party Chat';
  
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
                    <h4 className="font-semibold mb-2">Turn Order</h4>
                    <div className="space-y-3">
                      {encounterCombatants.length > 0 ? (
                        encounterCombatants.map(combatant => <CombatantCard key={combatant.id} combatant={combatant} />)
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