import React, { useEffect } from 'react';
    import { useParams } from 'react-router-dom';
    import { useAuth } from '../contexts/AuthContext';
    import { LoadingSpinner } from '../components/shared/LoadingSpinner';
    import { ErrorMessage } from '../components/shared/ErrorMessage';
    import { useCharacterSheetStore } from '../stores/characterSheetStore';
    import { CharacterSheet } from '../components/character/CharacterSheet';
    import { EncounterChatView } from '../components/party/EncounterChatView';

    export function CharacterPage() {
      const { id } = useParams<{ id: string }>();
      const { user } = useAuth();
      const { character, isLoading, error, fetchCharacter, setCharacter } = useCharacterSheetStore();

      useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
          if (id && user?.id) {
            try {
              await fetchCharacter(id, user.id);
            } catch (err) {
              console.error("Error loading character in CharacterPage:", err);
            }
          } else if (!id) {
             console.warn("CharacterPage: ID is missing, cannot load character.");
             if (isMounted) {
                setCharacter(null);
             }
          } else if (!user?.id) {
             console.warn("CharacterPage: User ID is missing, cannot load character.");
             if (isMounted) {
                setCharacter(null);
             }
          }
        };

        loadData();

        return () => {
          isMounted = false;
          setCharacter(null);
        };
      }, [id, user?.id, fetchCharacter, setCharacter]);

      if (isLoading) {
        return (
          <div className="flex items-center justify-center min-h-screen">
            <LoadingSpinner size="lg" />
          </div>
        );
      }

      if (error) {
        return (
          <div className="p-8">
            <ErrorMessage message={error} />
          </div>
        );
      }

      if (!character) {
        return (
          <div className="p-8">
            <ErrorMessage message={'Character not found, does not exist, or you may not have permission to view it.'} />
          </div>
        );
      }

      return (
        <>
          <CharacterSheet />
          <EncounterChatView />
        </>
      );
    }
