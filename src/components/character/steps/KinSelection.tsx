import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Ability } from '../../../types/character';
import { fetchKinList, fetchAbilityDetailsByNames, Kin } from '../../../lib/api/kin';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';

// Helper function to parse the heroic_ability string
const parseAbilityNames = (abilityString: string | null | undefined): string[] => {
  if (!abilityString) return [];
  return abilityString
    .split(',')
    .map(name => name.trim())
    .filter(name => name); // Remove empty strings
};

export function KinSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedKinId, setSelectedKinId] = useState<string | null>(null);

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
        // Also update the stored ability names if re-entering the step
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
    // Update both kin name and the parsed ability names in the store
    updateCharacter({ kin: kin.name, kinAbilityNames: abilityNames });
  };

  // Find the full selected Kin object from the list
  const selectedKin = useMemo(() => {
    return kinList.find(k => k.id === selectedKinId);
  }, [kinList, selectedKinId]);

  // Get ability names directly from the store (updated on selection)
  const abilityNamesFromStore = useMemo(() => character.kinAbilityNames || [], [character.kinAbilityNames]);

  // Fetch full details for the parsed ability names
  const {
    data: abilityDetails = [],
    isLoading: detailsLoading,
    error: detailsError,
  } = useQuery<Ability[], Error>({
    queryKey: ['abilityDetails', abilityNamesFromStore.sort().join(',')], // Use names from store
    queryFn: () => fetchAbilityDetailsByNames(abilityNamesFromStore),
    enabled: abilityNamesFromStore.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Render a single ability with details
  const renderAbilityDetails = (ability: Ability) => (
    <div key={ability.id} className="mb-4 p-3 border rounded bg-gray-50 shadow-sm">
      <h4 className="font-semibold text-md text-gray-800">{ability.name}</h4>
      {ability.willpower_cost != null && (
        <p className="text-xs text-purple-700 font-medium mt-1">Willpower Cost: {ability.willpower_cost}</p>
      )}
      {ability.requirement && (
         <p className="text-xs text-gray-600 mt-1">Requirement: {ability.requirement}</p>
      )}
      <p className="text-sm text-gray-700 mt-2">{ability.description}</p>
    </div>
  );

  if (kinLoading) {
     return (
      <div className="flex justify-center items-center h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (kinError) {
    const errorMessage = kinError instanceof Error ? kinError.message : 'Failed to load Kin options.';
    console.error("Error loading Kin:", kinError);
    return <ErrorMessage title="Error Loading Kin" message={errorMessage} />;
  }


  return (
    <div className="flex space-x-6 h-[60vh]">
      {/* Left Column: Kin Names */}
      <div className="w-1/3 border-r pr-4 overflow-y-auto">
        <h3 className="text-xl font-bold mb-4 sticky top-0 bg-white pb-2 z-10">Kin List</h3>
        <ul className="space-y-1">
          {kinList.map((kin) => (
            <li
              key={kin.id}
              className={`cursor-pointer p-2 rounded-md text-sm ${
                selectedKinId === kin.id ? 'bg-blue-100 font-semibold text-blue-800' : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => handleKinSelect(kin)}
            >
              {kin.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Right Column: Kin Details (Scrollable) */}
      <div className="w-2/3 pl-4 overflow-y-auto">
        {selectedKin ? (
          <div>
            <h2 className="text-2xl font-bold mb-1">{selectedKin.name}</h2>
            <p className="text-gray-700 mb-4 text-sm">{selectedKin.description}</p>
            <hr className="my-4 border-gray-300"/>
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Kin Abilities</h3>
            {detailsLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : detailsError ? (
               <ErrorMessage title="Error Loading Abilities" message={detailsError.message || 'Failed to load ability details.'} />
            ) : abilityDetails.length > 0 ? (
               abilityDetails.map(renderAbilityDetails)
            ) : abilityNamesFromStore.length > 0 && !detailsLoading ? ( // Check names from store
               <>
                 <p className="text-sm text-orange-600 italic mb-2">Could not fetch full details for the following abilities (check names in database):</p>
                 <ul className="list-disc list-inside text-sm text-gray-600">
                   {abilityNamesFromStore.map(name => <li key={name}>{name}</li>)}
                 </ul>
               </>
            ) : (
              <p className="text-sm text-gray-500 italic">No specific heroic abilities listed for this Kin.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
             <p className="text-gray-500">Select a kin from the list to view details and abilities.</p>
          </div>
        )}
      </div>
    </div>
  );
}
