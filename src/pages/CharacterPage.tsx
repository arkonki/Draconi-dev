import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { useCharacterSheetStore } from '../stores/characterSheetStore'; // Import the Zustand store
import { CharacterSheet } from '../components/character/CharacterSheet'; // Import CharacterSheet

export function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Use the Zustand store for state and actions
  // Correctly destructure fetchCharacter instead of loadCharacter
  const { character, isLoading, error, fetchCharacter, setCharacter } = useCharacterSheetStore(); // Use setCharacter for cleanup

  // Fetch character data when component mounts or id/user changes
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    const loadData = async () => {
      if (id && user?.id) {
        try {
          await fetchCharacter(id, user.id);
        } catch (err) {
          // Error is already handled and set in the store by fetchCharacter
          console.error("Error loading character in CharacterPage:", err);
        }
      } else if (!id) {
         // Handle case where id is missing (e.g., navigating away before id is set)
         console.warn("CharacterPage: ID is missing, cannot load character.");
         if (isMounted) {
            setCharacter(null); // Clear character if ID becomes invalid
         }
      } else if (!user?.id) {
         // Handle case where user is not logged in or user data is not yet available
         console.warn("CharacterPage: User ID is missing, cannot load character.");
         if (isMounted) {
            setCharacter(null); // Clear character if user becomes invalid
         }
      }
    };

    loadData();

    // Cleanup function to clear the character state when the component unmounts
    // or when the dependencies (id, user?.id) change before the next effect runs.
    return () => {
      isMounted = false;
      // console.log("CharacterPage cleanup: Clearing character state.");
      // Use setCharacter(null) for explicit clearing instead of a separate clearCharacter action
      // This avoids needing another function in the store just for this.
      setCharacter(null);
    };
    // Ensure user.id is included correctly in the dependency array
  }, [id, user?.id, fetchCharacter, setCharacter]); // Add user.id, fetchCharacter, setCharacter

  // Handle loading state from the store
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Handle error state from the store
  if (error) {
    return (
      <div className="p-8">
        <ErrorMessage message={error} /> {/* Use error message from the store */}
      </div>
    );
  }

  // Handle case where character is not found (data is null) or user is not logged in
  // Check *after* loading and error states
  if (!character) {
    // Avoid showing "not found" during the initial loading phase (handled above)
    // This message now shows if loading finished, there was no specific fetch error, but character is still null.
    return (
      <div className="p-8">
        <ErrorMessage message={'Character not found, does not exist, or you may not have permission to view it.'} />
      </div>
    );
  }

  // Render the CharacterSheet component.
  // CharacterSheet now gets its data directly from the Zustand store.
  return <CharacterSheet />;
}
