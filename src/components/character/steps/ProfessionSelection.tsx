import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { fetchProfessionList, fetchHeroicAbilitiesByProfession, Profession } from '../../../lib/api/professions';
import { fetchMagicSchools, MagicSchool } from '../../../lib/api/magic'; // Import magic school types and fetch function
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { CharacterCreationData } from '../../../types/character'; // Import CharacterCreationData

// Keep HeroicAbility type definition here or move to a shared types file
type HeroicAbility = {
  id: number;
  name: string;
  description: string;
  willpower_cost: number;
  profession: string;
  created_at: string;
  requirement: string;
};

export function ProfessionSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedProfession, setSelectedProfession] = useState<Profession | null>(null);
  const [heroicAbilities, setHeroicAbilities] = useState<HeroicAbility[]>([]);
  const [selectedHeroicAbility, setSelectedHeroicAbility] = useState<HeroicAbility | null>(null);
  const [haLoading, setHaLoading] = useState<boolean>(false);
  const [haError, setHaError] = useState<string | null>(null);

  // Fetch Professions
  const { data: professionList = [], isLoading: loadingProfessions, error: errorProfessions } = useQuery<Profession[], Error>({
    queryKey: ['professions'],
    queryFn: fetchProfessionList,
  });

  // Fetch Magic Schools
  const { data: magicSchools = [], isLoading: loadingSchools, error: errorSchools } = useQuery<MagicSchool[], Error>({
    queryKey: ['magicSchools'],
    queryFn: fetchMagicSchools,
  });

  // Effect to set the initially selected profession and ability if present in character state
  useEffect(() => {
    if (character.profession && professionList.length > 0) {
      const currentProfession = professionList.find(p => p.name === character.profession);
      if (currentProfession) {
        setSelectedProfession(currentProfession);
        // Fetch abilities if needed for pre-selection (only for non-mages)
        if (currentProfession.magic_school_id === null && character.professionHeroicAbilityName) {
          fetchHeroicAbilities(currentProfession.name, character.professionHeroicAbilityName);
        }
        // Pre-select heroic ability if already stored
        if (character.professionHeroicAbilityName && heroicAbilities.length > 0) {
           const preSelectedHA = heroicAbilities.find(ha => ha.name === character.professionHeroicAbilityName);
           if (preSelectedHA) setSelectedHeroicAbility(preSelectedHA);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.profession, professionList, character.professionHeroicAbilityName]); // Rerun when profession name or list changes

  // Fetch heroic abilities when a non-mage profession is selected
  const fetchHeroicAbilities = async (professionName: string, preselectAbilityName?: string | null) => {
     setHaLoading(true);
     setHaError(null);
     try {
       const data = await fetchHeroicAbilitiesByProfession(professionName);
       const abilities = data as HeroicAbility[];
       setHeroicAbilities(abilities);
       // Pre-select if character state has one or if passed directly
       const abilityToSelect = preselectAbilityName ?? character.professionHeroicAbilityName;
       if (abilityToSelect) {
           const preSelected = abilities.find(ha => ha.name === abilityToSelect);
           if (preSelected) setSelectedHeroicAbility(preSelected);
           else setSelectedHeroicAbility(null); // Clear if stored ability not found in fetched list
       } else {
           setSelectedHeroicAbility(null); // Clear if no ability name provided/stored
       }
     } catch (err) {
       setHaError(err instanceof Error ? err.message : 'Failed to load heroic abilities');
       setHeroicAbilities([]);
       setSelectedHeroicAbility(null);
     } finally {
       setHaLoading(false);
     }
  };

  // Re-fetch abilities when selected profession changes (and is not a mage)
  useEffect(() => {
    if (selectedProfession && selectedProfession.magic_school_id === null) {
      // Fetch abilities, potentially pre-selecting based on store
      fetchHeroicAbilities(selectedProfession.name);
    } else {
      setHeroicAbilities([]); // Clear abilities if mage or no profession selected
      setSelectedHeroicAbility(null); // Clear selected ability
      // Also clear from store if switching to mage or deselecting
      if (character.professionHeroicAbilityName) {
        updateCharacter({ professionHeroicAbilityName: null });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfession]); // Re-run when selectedProfession changes


  const handleProfessionSelect = (profession: Profession) => {
    setSelectedProfession(profession);
    // Find magic school name if it's a mage profession
    const magicSchoolName = profession.magic_school_id !== null
      ? magicSchools.find(ms => ms.id === profession.magic_school_id)?.name ?? null
      : null;

    const updates: Partial<CharacterCreationData> = {
        profession: profession.name,
        key_attribute: profession.key_attribute,
        // Store the ID in the character data
        magicSchool: profession.magic_school_id ?? null,
        // Store the name separately if needed, or rely on lookup (let's store it for simplicity here)
        // magicSchoolName: magicSchoolName, // Optional: Add to CharacterCreationData if needed elsewhere
        professionHeroicAbilityName: null // Reset profession ability on profession change
    };
    // If it's a mage, clear local heroic ability selection immediately
    if (profession.magic_school_id !== null) {
        setSelectedHeroicAbility(null);
    }
    updateCharacter(updates);
  };

  const handleHeroicAbilitySelect = (ability: HeroicAbility) => {
      setSelectedHeroicAbility(ability);
      updateCharacter({ professionHeroicAbilityName: ability.name }); // Store ability name in store
  };

  // Helper to get magic school name
  const getMagicSchoolName = (schoolId: number | null): string | null => {
    if (schoolId === null || magicSchools.length === 0) return null;
    return magicSchools.find(ms => ms.id === schoolId)?.name ?? `ID: ${schoolId}`; // Fallback to ID if not found
  };

  // Helper function to render lists of strings safely
  const renderStringList = (items: string[] | null | undefined, title: string): React.ReactNode => {
    if (!Array.isArray(items) || items.length === 0) {
      return <p className="text-sm text-gray-500">No {title.toLowerCase()} listed.</p>;
    }
    const validItems = items.filter(item => typeof item === 'string');
    if (validItems.length === 0) {
      return <p className="text-sm text-gray-500">No valid {title.toLowerCase()} listed.</p>;
    }
    return (
      <ul className="list-disc list-inside text-sm text-gray-600">
        {validItems.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  };


  if (loadingProfessions || loadingSchools) {
     return (
      <div className="flex justify-center items-center h-[80vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (errorProfessions || errorSchools) {
    return <ErrorMessage message={errorProfessions?.message || errorSchools?.message || 'Failed to load required data.'} />;
  }

  // *** ADD CONSOLE LOG HERE ***
  if (selectedProfession) {
    console.log('Selected Profession Data:', selectedProfession);
  }

  return (
    <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6 h-[80vh]">
      {/* Left Column: List of Profession Names */}
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r pb-4 md:pb-0 md:pr-4 overflow-y-auto max-h-[30vh] md:max-h-full">
        <h3 className="text-xl font-bold mb-4 sticky top-0 bg-white pb-2 z-10">Profession List</h3>
        <ul className="space-y-2">
          {professionList.map((profession) => (
            <li
              key={profession.id} // Use database ID
              className={`cursor-pointer p-2 rounded-md border ${
                selectedProfession?.id === profession.id
                  ? 'bg-blue-100 border-blue-300 font-semibold'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
              onClick={() => handleProfessionSelect(profession)}
            >
              {profession.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Right Column: Profession Details (Scrollable) */}
      <div className="w-full md:w-2/3 md:pl-4 overflow-y-auto max-h-[calc(80vh-30vh-2rem)] md:max-h-full">
        {selectedProfession ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">{selectedProfession.name}</h2>
              <p className="text-gray-600 mb-4">{selectedProfession.description}</p>
            </div>
            <div>
              <h4 className="font-semibold text-lg">Key Attribute</h4>
              <p className="text-gray-700">{selectedProfession.key_attribute}</p>
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-1">Skills</h4>
              {/* Use the generic list renderer */}
              {renderStringList(selectedProfession.skills, 'Skills')}
            </div>

            {/* *** ADDED: Render Starting Equipment *** */}
            {selectedProfession.starting_equipment && (
              <div>
                <h4 className="font-semibold text-lg mb-1">Starting Equipment</h4>
                {renderStringList(selectedProfession.starting_equipment, 'Starting Equipment')}
              </div>
            )}

            {/* *** ADDED: Render Equipment Description (if exists) *** */}
            {selectedProfession.equipment_description && (
               <div>
                 <h4 className="font-semibold text-lg mb-1">Equipment Notes</h4>
                 {renderStringList(selectedProfession.equipment_description, 'Equipment Notes')}
               </div>
            )}

            {/* *** ADDED: Placeholder for potential Weapon Proficiencies (if object found in log) *** */}
            {/*
            {selectedProfession.weapon_proficiencies && typeof selectedProfession.weapon_proficiencies === 'object' && (
              <div>
                <h4 className="font-semibold text-lg mb-1">Weapon Proficiencies</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded">
                  {JSON.stringify(selectedProfession.weapon_proficiencies, null, 2)}
                </pre>
                 // Or render Object.keys(selectedProfession.weapon_proficiencies).join(', ')
              </div>
            )}
            */}


            <div>
              <h4 className="font-semibold text-lg mb-1">Heroic Ability / Magic</h4>
              {selectedProfession.magic_school_id !== null ? (
                <p className="text-gray-600">
                  As a mage of the <strong>{getMagicSchoolName(selectedProfession.magic_school_id) ?? 'Unknown School'}</strong> school,
                  you don't get a starting heroic ability. Instead, you get your magic.
                </p>
              ) : (
                <>
                  {haLoading && <LoadingSpinner size="sm"/>}
                  {haError && <ErrorMessage message={haError} />}
                  {!haLoading && !haError && heroicAbilities.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {heroicAbilities.map((ability) => (
                        <div
                          key={ability.id} // Use database ID
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedHeroicAbility?.id === ability.id // Use local state for UI highlight
                              ? 'border-green-500 bg-green-50 ring-2 ring-green-300'
                              : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
                          }`}
                          onClick={() => handleHeroicAbilitySelect(ability)}
                        >
                          <h5 className="font-semibold text-lg mb-2">{ability.name}</h5>
                          <p className="text-sm text-gray-600 mb-2">{ability.description}</p>
                          <p className="text-sm text-blue-600">
                            Willpower Cost: {ability.willpower_cost ?? 'N/A'} WP
                          </p>
                          {ability.requirement && typeof ability.requirement === 'string' && ( // Only render if string for now
                            <p className="text-xs text-gray-500 mt-1">
                              Requirement: {ability.requirement}
                            </p>
                          )}
                           {/* Add rendering for object requirements later if needed */}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !haLoading && !haError && <p className="text-gray-600">No specific heroic abilities listed for this profession, or none available.</p>
                  )}
                </>
              )}
            </div>

            {/* Confirmation Panel */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg sticky bottom-0">
              <p className="text-blue-800 font-medium">
                Selected: <strong>{selectedProfession.name}</strong>
                {selectedProfession.magic_school_id !== null && (
                  <> (Magic School: <strong>{getMagicSchoolName(selectedProfession.magic_school_id) ?? 'N/A'}</strong>)</>
                )}
                {selectedProfession.magic_school_id === null && character.professionHeroicAbilityName && (
                  <> with Heroic Ability: <strong>{character.professionHeroicAbilityName}</strong></>
                )}
              </p>
              {selectedProfession.magic_school_id === null && !character.professionHeroicAbilityName && heroicAbilities.length > 0 && !haLoading && (
                <p className="text-amber-700 mt-2 text-sm">Please select a heroic ability above to continue.</p>
              )}
               {selectedProfession.magic_school_id === null && heroicAbilities.length === 0 && !haLoading && !haError && (
                 <p className="text-gray-600 mt-2 text-sm">No heroic ability selection required for this profession.</p>
               )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center items-center h-full">
             <p className="text-gray-500 text-lg">Select a profession from the list to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
