import React from 'react';
import { Wand2 } from 'lucide-react';
import { useSpells } from '../../hooks/useMagic'; // Corrected: Ensure this imports from useMagic.ts
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Card } from '../shared/Card';
import { Spell } from '../../types/magic';
import { Character } from '../../types/character'; // Import Character type

interface SpellsViewProps {
  // Accept the full character object instead of just the ID
  character: Character;
}

export function SpellsView({ character }: SpellsViewProps) {
  // Fetch general spells (schoolId = null)
  const { data: generalSpellsData, isLoading: isLoadingGeneral, error: errorGeneral } = useSpells(null);

  // Determine character's magic school ID (assuming 'magic_school_id' field exists)
  // Use undefined if the character has no school, disabling the school query
  const characterMagicSchoolId = character.magic_school_id ?? undefined;

  // Fetch school-specific spells only if the character has a school ID
  // The useSpells hook handles the logic based on the schoolId argument (enabled: schoolId !== undefined)
  const { data: schoolSpellsData, isLoading: isLoadingSchool, error: errorSchool } = useSpells(characterMagicSchoolId);

  // Combine loading and error states
  const loading = isLoadingGeneral || isLoadingSchool; // Loading if either query is running
  const error = errorGeneral || errorSchool; // Show first error encountered

  // Ensure data arrays are always defined, even if loading/error occurs or no data is returned
  const generalSpells = generalSpellsData ?? [];
  // Only include school spells if the character has a school and the query succeeded
  const schoolSpells = characterMagicSchoolId !== undefined && schoolSpellsData ? schoolSpellsData : [];


  if (loading) {
    return <LoadingSpinner text="Loading spells..." />;
  }

  if (error) {
    // Provide a more specific error message if possible
    const errorMessage = errorGeneral ? `Failed to load general spells: ${errorGeneral.message}` : `Failed to load school spells: ${errorSchool?.message}`;
    return <ErrorMessage message={errorMessage} />;
  }

  const renderSpellList = (title: string, spells: Spell[]) => (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3 flex items-center">
        <Wand2 className="w-5 h-5 mr-2 text-purple-600" />
        {title}
      </h3>
      {spells.length === 0 ? (
        <p className="text-gray-500 italic">No {title.toLowerCase()} known.</p>
      ) : (
        <div className="space-y-4">
          {spells.map((spell) => (
            <Card key={spell.id} className="p-4">
              <h4 className="font-bold text-md mb-1">{spell.name} {spell.rank === 0 ? '(Trick)' : `(Rank ${spell.rank})`}</h4>
              {/* Display school name if available (fetched via relation) */}
              {spell.magic_schools && typeof spell.magic_schools === 'object' && 'name' in spell.magic_schools && spell.magic_schools.name &&
                <p className="text-sm text-purple-700 mb-1">School: {spell.magic_schools.name}</p>
              }
              <p className="text-sm text-gray-600 mb-2">
                <span className="font-medium">Casting:</span> {spell.casting_time} |{' '}
                <span className="font-medium">Range:</span> {spell.range} |{' '}
                <span className="font-medium">Duration:</span> {spell.duration} |{' '}
                <span className="font-medium">WP Cost:</span> {spell.willpower_cost ?? 'N/A'}
              </p>
              {spell.requirement && <p className="text-sm text-gray-600 mb-2"><span className="font-medium">Requirement:</span> {spell.requirement}</p>}
              <p className="text-sm text-gray-700">{spell.description}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Determine the character's school name for the title (if they have one)
  // This assumes the school name might be directly on the character object or fetched separately
  // For now, let's try to get it from the first school spell if available
  const schoolName = schoolSpells.length > 0 && schoolSpells[0].magic_schools && typeof schoolSpells[0].magic_schools === 'object' && 'name' in schoolSpells[0].magic_schools
    ? schoolSpells[0].magic_schools.name
    : character.magic_school; // Fallback to a potential direct field

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Magic & Spells</h2>
      {renderSpellList('General Magic', generalSpells)}
      {/* Only render school magic section if the character has a school ID */}
      {characterMagicSchoolId !== undefined && renderSpellList(`${schoolName || 'School'} Magic`, schoolSpells)}

      {/* Show message if character knows no spells at all and not loading */}
      {generalSpells.length === 0 && schoolSpells.length === 0 && !loading && (
         <p className="text-gray-500 italic mt-4">This character knows no spells yet.</p>
      )}
    </div>
  );
}
