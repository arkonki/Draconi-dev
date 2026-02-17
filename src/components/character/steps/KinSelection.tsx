import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Ability } from '../../../types/character';
import { fetchKinList, fetchAbilityDetailsByNames, Kin } from '../../../lib/api/kin';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { ChevronRight, ArrowLeft, CheckCircle2, User, Sparkles, Footprints } from 'lucide-react';

// Helper function to parse the heroic_ability string
const parseAbilityNames = (abilityString: string | null | undefined): string[] => {
  if (!abilityString) return [];
  return abilityString
    .split(',')
    .map(name => name.trim())
    .filter(name => name);
};

// Helper to determine movement speed based on Dragonbane Rules
const getMovementSpeed = (kinName: string) => {
  const name = kinName.toLowerCase();
  if (name === 'wolfkin') return 12;
  if (name === 'human' || name === 'elf') return 10;
  return 8; // Dwarf, Halfling, Mallard
};

export function KinSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedKinId, setSelectedKinId] = useState<string | null>(null);
  
  // Mobile View State
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);

  // Fetch Kin list
  const { data: kinList = [], isLoading: kinLoading, error: kinError } = useQuery<Kin[], Error>({
    queryKey: ['kinListWithHeroicAbility'],
    queryFn: fetchKinList,
    retry: false,
  });

  // Effect to set the initially selected kin ID if already present in character state
  useEffect(() => {
    if (character.kin && kinList.length > 0 && !selectedKinId) {
      const currentKin = kinList.find(k => k.name === character.kin);
      if (currentKin) {
        setSelectedKinId(currentKin.id);
        // Ensure store is synced
        const abilityNames = parseAbilityNames(currentKin.heroic_ability);
        if (JSON.stringify(character.kinAbilityNames) !== JSON.stringify(abilityNames)) {
           updateCharacter({ kinAbilityNames: abilityNames });
        }
      }
    }
  }, [character.kin, kinList, selectedKinId, character.kinAbilityNames, updateCharacter]);

  const handleKinSelect = (kin: Kin) => {
    setSelectedKinId(kin.id);
    const abilityNames = parseAbilityNames(kin.heroic_ability);
    updateCharacter({ kin: kin.name, kinAbilityNames: abilityNames });
    setIsMobileDetailView(true); // Switch to detail view on mobile
  };

  const handleBack = () => {
    setIsMobileDetailView(false); // Go back to list on mobile
  };

  // Find the full selected Kin object from the list
  const selectedKin = useMemo(() => {
    return kinList.find(k => k.id === selectedKinId);
  }, [kinList, selectedKinId]);

  // Get ability names directly from the store
  const abilityNamesFromStore = useMemo(() => character.kinAbilityNames || [], [character.kinAbilityNames]);

  // Fetch full details for the parsed ability names
  const {
    data: abilityDetails = [],
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery<Ability[], Error>({
    queryKey: ['abilityDetails', abilityNamesFromStore.sort().join(',')],
    queryFn: () => fetchAbilityDetailsByNames(abilityNamesFromStore),
    enabled: abilityNamesFromStore.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (kinLoading) return <LoadingSpinner size="lg" />;
  if (kinError) return <ErrorMessage title="Error Loading Kin" message={kinError.message} />;

  return (
    <div className="flex flex-col md:flex-row h-[75vh] md:h-[600px] gap-6">
      
      {/* LEFT COLUMN: LIST */}
      <div className={`w-full md:w-1/3 flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden h-full ${isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
        <div className="bg-gray-50 p-3 border-b font-bold text-gray-700 sticky top-0 flex justify-between items-center">
            <span>Kins</span>
            <span className="text-xs font-normal text-gray-400">{kinList.length} available</span>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {kinList.map((kin) => (
            <button
              key={kin.id}
              onClick={() => handleKinSelect(kin)}
              className={`w-full text-left px-3 py-3 md:py-2 rounded-md text-sm transition-colors flex justify-between items-center border border-transparent ${
                selectedKinId === kin.id
                  ? 'bg-green-50 text-green-800 font-semibold border-green-200'
                  : 'hover:bg-gray-50 text-gray-700 border-b-gray-50'
              }`}
            >
              <span>{kin.name}</span>
              <ChevronRight size={16} className={`text-gray-300 ${selectedKinId === kin.id ? 'text-green-500' : ''}`} />
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN: DETAILS */}
      <div className={`w-full md:w-2/3 flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm relative ${!isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Mobile Back Header */}
        <div className="md:hidden bg-gray-50 p-2 border-b flex items-center gap-2 sticky top-0 z-10">
            <button onClick={handleBack} className="p-2 hover:bg-gray-200 rounded-full text-gray-600">
                <ArrowLeft size={20} />
            </button>
            <span className="font-bold text-gray-700">Back to List</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            {selectedKin ? (
            <div className="space-y-6">
                
                {/* Header Info */}
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 mb-1">{selectedKin.name}</h2>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                           <Footprints size={14} />
                           <span>Base Movement: <strong>{getMovementSpeed(selectedKin.name)} meters</strong></span>
                        </div>
                    </div>
                    <CheckCircle2 className="text-green-500 w-8 h-8 opacity-20" />
                </div>

                {/* Description */}
                <div className="prose prose-sm text-gray-600 leading-relaxed border-b border-gray-100 pb-4">
                    {selectedKin.description}
                </div>

                {/* Innate Abilities Section */}
                <div>
                    <h4 className="font-bold text-gray-400 text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Sparkles size={14} /> Innate Abilities
                    </h4>
                    
                    {detailsLoading ? (
                      <div className="flex justify-center py-8"><LoadingSpinner size="sm" /></div>
                    ) : detailsError ? (
                       <ErrorMessage message="Failed to load ability details." />
                    ) : (
                      <div className="space-y-3">
                        {abilityDetails.length > 0 ? (
                           abilityDetails.map(ability => (
                             <div key={ability.id} className="p-4 bg-green-50 border border-green-200 rounded-xl relative overflow-hidden shadow-sm">
                                <div className="absolute top-0 right-0 -mt-2 -mr-2 w-16 h-16 bg-green-100 rounded-full opacity-50 blur-xl"></div>
                                <h5 className="font-bold text-lg text-green-900 mb-1 relative z-10">{ability.name}</h5>
                                
                                {ability.willpower_cost != null && (
                                    <span className="inline-block px-2 py-0.5 bg-white/60 rounded text-[10px] font-bold text-green-700 mb-2 border border-green-100">
                                        WP Cost: {ability.willpower_cost}
                                    </span>
                                )}

                                <p className="text-sm text-green-800 leading-relaxed relative z-10">
                                    {ability.description}
                                </p>
                             </div>
                           ))
                        ) : (
                           // Fallback if details not found but names exist
                           abilityNamesFromStore.length > 0 && (
                             <div className="p-4 bg-gray-50 border rounded-xl text-sm text-gray-600">
                                <p className="font-semibold mb-2">Abilities:</p>
                                <ul className="list-disc list-inside">
                                   {abilityNamesFromStore.map(name => <li key={name}>{name}</li>)}
                                </ul>
                                <p className="text-xs text-gray-400 mt-2 italic">Detailed descriptions unavailable.</p>
                             </div>
                           )
                        )}
                      </div>
                    )}
                </div>

            </div>
            ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                <User size={48} className="opacity-20 mb-4"/>
                <p className="text-lg font-medium">Select a Kin</p>
                <p className="text-sm mt-1">Choose a kin to view their description, movement speed, and innate abilities.</p>
            </div>
            )}
        </div>
      </div>
    </div>
  );
}
