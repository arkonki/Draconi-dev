import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Edit2 } from 'lucide-react';
import { Character } from '../../types/character';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';

type HeroicAbility = GameItem;

interface HeroicAbilitiesTableProps {
  character: Character;
  onUpdate: (updatedCharacterData: Partial<Character>) => Promise<void>; // Function to save changes
}

// Function to fetch and filter abilities from the main items list
async function fetchHeroicAbilitiesData(): Promise<HeroicAbility[]> {
  const allItems = await fetchItems(); // Fetch all items
  return allItems
    .filter(item => {
      // Defensive check: Ensure category is a string before calling toLowerCase
      const categoryLower = typeof item.category === 'string' ? item.category.toLowerCase() : null;
      return categoryLower === 'heroic ability' || categoryLower === 'talent';
    })
    // Ensure the filtered items conform to HeroicAbility (which extends GameItem)
    .map(item => item as HeroicAbility); // Simple type assertion is okay here after filtering
}


export function HeroicAbilitiesTable({ character, onUpdate }: HeroicAbilitiesTableProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Store the names of the abilities being edited
  const [editingAbilityNames, setEditingAbilityNames] = useState<string[]>([]);

  // Fetch all available heroic abilities/talents using the refined function
  const { data: allAbilities = [], isLoading: isLoadingAbilities, error: errorAbilities } = useQuery<HeroicAbility[], Error>({
    queryKey: ['heroicAbilitiesData'], // Use a distinct query key
    queryFn: fetchHeroicAbilitiesData,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes, adjust as needed
  });

  // Effect to initialize editing state when character data changes or edit mode starts
  useEffect(() => {
    if (character.trainedSkills) {
      // Filter trainedSkills to find those that match the names of fetched abilities
      const currentCharacterAbilityNames = character.trainedSkills.filter(skillName =>
        allAbilities.some(ability => ability.name.toLowerCase() === skillName.toLowerCase())
      );
      setEditingAbilityNames(currentCharacterAbilityNames);
    } else {
      setEditingAbilityNames([]);
    }
  }, [character.trainedSkills, allAbilities, isEditing]); // Re-run if character skills change, abilities load, or edit mode toggles


  // Get the full ability objects for the character based on their trainedSkills
  const characterAbilities = React.useMemo(() => {
    if (!character.trainedSkills || !allAbilities) return [];
    return character.trainedSkills
      .map(skillName => allAbilities.find(ab => ab.name.toLowerCase() === skillName.toLowerCase()))
      .filter((ab): ab is HeroicAbility => ab !== undefined); // Type guard
  }, [character.trainedSkills, allAbilities]);


  // Handle toggling abilities during edit mode
  const handleToggleAbility = (abilityName: string) => {
    setEditingAbilityNames(prev =>
      prev.includes(abilityName)
        ? prev.filter(name => name !== abilityName)
        : [...prev, abilityName]
    );
  };

  const handleSaveChanges = async () => {
     // Get the skills that are *not* abilities/talents
     const currentNonAbilitySkills = character.trainedSkills?.filter(skillName =>
         !allAbilities.some(ab => ab.name.toLowerCase() === skillName.toLowerCase())
     ) || [];

     // Combine non-ability skills with the newly selected ability names
     const updatedSkills = [...currentNonAbilitySkills, ...editingAbilityNames];

     try {
         await onUpdate({ trainedSkills: updatedSkills });
         // Optionally invalidate character query to refetch if needed elsewhere
         // queryClient.invalidateQueries({ queryKey: ['character', character.id] });
         setIsEditing(false);
     } catch (error) {
         console.error("Failed to save heroic abilities:", error);
         // Consider showing an error message to the user
     }
  };

  const handleCancelEdit = () => {
    // Resetting is handled by the useEffect when isEditing becomes false
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    // Initialization is handled by the useEffect
    setIsEditing(true);
  };


  if (isLoadingAbilities) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Use the specific error object for abilities
  if (errorAbilities) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 h-full">
        <ErrorMessage message={`Failed to load abilities: ${errorAbilities.message}`} />
      </div>
    );
  }

  // Determine which list to display based on edit mode
  const displayedAbilitiesSource = isEditing ? allAbilities : characterAbilities;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          Heroic Abilities & Talents
        </h3>
        {!isEditing ? (
          <Button variant="outline" size="sm" icon={Edit2} onClick={handleStartEdit}>
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveChanges}>
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <div className="flex-grow space-y-3 overflow-y-auto pr-2">
        {displayedAbilitiesSource.length === 0 && !isEditing && (
          <p className="text-gray-500 italic text-center py-4">No heroic abilities or talents learned.</p>
        )}
        {displayedAbilitiesSource.map((ability) => {
          // Check if the current ability name is in the list being edited
          const isSelected = editingAbilityNames.includes(ability.name);
          return (
            <div
              key={ability.id || ability.name} // Use id preferably
              className={`p-3 border rounded-lg transition-colors duration-150 ${isEditing ? 'cursor-pointer hover:bg-gray-50' : ''} ${isSelected && isEditing ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'border-gray-200'}`}
              onClick={isEditing ? () => handleToggleAbility(ability.name) : undefined}
              onKeyDown={isEditing ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleToggleAbility(ability.name);
                }
              } : undefined}
              role={isEditing ? 'button' : undefined}
              tabIndex={isEditing ? 0 : undefined}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-1.5">
                  {isEditing && (
                     <input
                       type="checkbox"
                       checked={isSelected}
                       readOnly // Clicking the div handles the toggle
                       className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none" // Prevent direct interaction
                     />
                  )}
                  {ability.name}
                </h4>
                {/* Safely access category - already checked in fetch, but good practice here too */}
                {ability.category && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                    {/* Defensive check remains useful */}
                    {typeof ability.category === 'string' ? ability.category.toUpperCase() : ability.category}
                  </span>
                )}
              </div>
              {/* Use effect for description if available, otherwise provide fallback */}
              <p className="text-sm text-gray-600 mt-1">{ability.effect || ability.description || 'No description available.'}</p>
            </div>
          );
        })}
         {isEditing && allAbilities.length === 0 && (
             <p className="text-gray-500 italic text-center py-4">No abilities found in the compendium.</p>
         )}
      </div>
    </div>
  );
}
