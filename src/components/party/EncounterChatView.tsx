import React, { useState, useEffect } from 'react';
    import { useCharacterSheetStore } from '../../stores/characterSheetStore';
    import { MessageSquare, Dices, Loader2, X } from 'lucide-react';
    import { Button } from '../shared/Button';
    import { supabase } from '../../lib/supabase';

    export function EncounterChatView() {
      const {
        character,
        activeEncounter,
        currentCombatant,
        isLoadingEncounter,
        encounterError,
        drawInitiative,
        isSaving,
        fetchActiveEncounter,
      } = useCharacterSheetStore();

      const [isOpen, setIsOpen] = useState(false);

      // Fetch encounter when component first mounts with character data
      useEffect(() => {
        if (character?.party_id && character?.id) {
          fetchActiveEncounter(character.party_id, character.id);
        }
      }, [character?.party_id, character?.id, fetchActiveEncounter]);

      // Subscribe to real-time updates for the encounter and combatants
      useEffect(() => {
        if (!activeEncounter?.id || !character?.party_id || !character?.id) {
          return;
        }

        // This channel will listen for any changes to the current encounter or its combatants
        // and refetch the data to update the player's view.
        const channel = supabase
          .channel(`player-encounter-updates-${character.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'encounters',
              filter: `id=eq.${activeEncounter.id}`,
            },
            () => {
              fetchActiveEncounter(character.party_id!, character.id!);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'encounter_combatants',
              filter: `encounter_id=eq.${activeEncounter.id}`,
            },
            () => {
              fetchActiveEncounter(character.party_id!, character.id!);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }, [activeEncounter?.id, character?.party_id, character?.id, fetchActiveEncounter]);

      // Only show the button if the character is in a party
      if (!character?.party_id) {
        return null;
      }

      const isInActiveEncounter = activeEncounter?.status === 'active';
      const buttonColorClass = isInActiveEncounter ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
      const buttonText = isInActiveEncounter ? 'Encounter Active' : 'Party Chat';

      return (
        <>
          {/* Floating Button */}
          <button
            className={`fixed bottom-4 right-4 p-4 rounded-full shadow-lg text-white transition-colors duration-200 z-40 ${buttonColorClass}`}
            onClick={() => setIsOpen(!isOpen)}
            aria-label={buttonText}
          >
            {isInActiveEncounter ? <Dices size={24} /> : <MessageSquare size={24} />}
          </button>

          {/* Overlay Chat/Encounter Panel */}
          {isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-30" onClick={() => setIsOpen(false)}>
              <div className="bg-white w-full max-w-sm h-full shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                  <h2 className="text-lg font-semibold">
                    {isInActiveEncounter ? 'Active Encounter' : 'Party Chat'}
                  </h2>
                  <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">
                    <X size={24} />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-grow p-4 overflow-y-auto space-y-4">
                  {isLoadingEncounter && !activeEncounter ? (
                    <div className="flex justify-center items-center h-full">
                      <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
                    </div>
                  ) : encounterError ? (
                    <div className="text-red-600 text-center">{encounterError}</div>
                  ) : activeEncounter ? (
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold">{activeEncounter.name}</h3>
                      {activeEncounter.description && <p className="text-gray-600 text-sm">{activeEncounter.description}</p>}
                      <p className="text-sm">Status: <span className="font-medium">{activeEncounter.status}</span></p>
                      {activeEncounter.current_round != null && <p className="text-sm">Round: <span className="font-medium">{activeEncounter.current_round}</span></p>}

                      {currentCombatant ? (
                        <div className="border p-3 rounded-md bg-blue-50 space-y-2">
                          <p className="font-semibold">Your Combatant:</p>
                          <p className="text-sm">Name: {currentCombatant.display_name}</p>
                          <p className="text-sm">Initiative: <span className="font-medium">{currentCombatant.initiative_roll ?? 'Not Set'}</span></p>
                          {isInActiveEncounter && currentCombatant.initiative_roll === null && (
                             <Button
                                onClick={drawInitiative}
                                disabled={isSaving}
                                loading={isSaving}
                                Icon={Dices}
                                size="sm"
                             >
                                Draw Initiative (1-10)
                             </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-yellow-600 text-sm">You are in a party with an active encounter, but your character is not yet added as a combatant.</p>
                      )}

                      <div className="border-t pt-4 mt-4">
                        <h4 className="font-medium mb-2">Chat (Coming Soon)</h4>
                        <p className="text-gray-500 text-sm italic">Real-time chat functionality will be available here.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-600 text-center">
                      No active encounter for this party.
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50">
                  <input
                    type="text"
                    placeholder="Chat is coming soon..."
                    className="w-full px-3 py-2 border rounded-md bg-gray-200 cursor-not-allowed"
                    disabled
                  />
                </div>
              </div>
            </div>
          )}
        </>
      );
    }
