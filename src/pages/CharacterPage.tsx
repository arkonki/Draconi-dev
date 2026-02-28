import React, { useEffect } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/useAuth';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { useCharacterSheetStore } from '../stores/characterSheetStore';
import { CharacterSheet } from '../components/character/CharacterSheet';
import { EncounterChatView } from '../components/party/EncounterChatView';
import { Breadcrumbs } from '../components/shared/Breadcrumbs';
import { Home, User, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CharacterPageLocationState {
  fromPartyId?: string;
  fromPartyName?: string;
}

export function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigationState = (location.state as CharacterPageLocationState | null) ?? null;
  const partyIdFromQuery = searchParams.get('fromPartyId')?.trim() || null;
  const partyNameFromQuery = searchParams.get('fromPartyName')?.trim();
  const partyIdFromState = navigationState?.fromPartyId?.trim() || null;
  const partyNameFromState = navigationState?.fromPartyName?.trim();

  // Destructure all needed functions and state from the store
  const {
    character,
    isLoading,
    error,
    fetchCharacter,
    setCharacter
  } = useCharacterSheetStore();

  const partyIdForBreadcrumb = partyIdFromQuery || partyIdFromState || character?.party_id || null;
  const partyNameFromContext = partyNameFromQuery || partyNameFromState;

  const { data: partyNameForBreadcrumb } = useQuery<string | null, Error>({
    queryKey: ['party-breadcrumb-name', partyIdForBreadcrumb],
    queryFn: async () => {
      if (!partyIdForBreadcrumb) return null;
      const { data, error } = await supabase
        .from('parties')
        .select('name')
        .eq('id', partyIdForBreadcrumb)
        .single();

      if (error) throw error;
      return data?.name || null;
    },
    enabled: !!partyIdForBreadcrumb && !partyNameFromContext,
    staleTime: 60_000,
  });

  useEffect(() => {
    const loadData = async () => {
      // Only attempt to fetch if we have the necessary IDs
      if (id && user?.id) {
        // The fetchCharacter function in your store should handle all state changes
        // (isLoading, setting character data, and setting errors).
        await fetchCharacter(id, user.id);
      } else {
        // If there's no ID or user, it's correct to clear the store's state
        // to prevent showing data from a previously viewed character.
        setCharacter(null);
        console.warn("CharacterPage: Character ID or User ID is missing. Cannot load character.");
      }
    };

    loadData();

    // The problematic cleanup function has been REMOVED.
    // The component should not be responsible for clearing global state on unmount,
    // as this creates issues with React 18's Strict Mode. The store will now
    // correctly hold the character data until a new character is loaded or the
    // state is explicitly cleared elsewhere.

  }, [id, user?.id, fetchCharacter, setCharacter]);

  // --- The rendering logic below remains the same as it was correct ---

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

  // This check correctly handles the case where the character is not found
  // or the user doesn't have permission to view it.
  if (!character) {
    return (
      <div className="p-8">
        <ErrorMessage message={'Character not found, does not exist, or you may not have permission to view it.'} />
      </div>
    );
  }

  const resolvedPartyName = partyNameFromContext || partyNameForBreadcrumb || 'Party';

  // Render the character sheet once all checks pass
  const breadcrumbs = [
    { label: 'Home', path: '/', icon: Home },
    ...(partyIdForBreadcrumb
      ? [
          { label: 'Adventure Party', path: '/adventure-party', icon: Users },
          { label: resolvedPartyName, path: `/party/${partyIdForBreadcrumb}` },
        ]
      : []),
    { label: character.name, icon: User }
  ];

  return (
    <>
      <Breadcrumbs items={breadcrumbs} />
      <CharacterSheet />
      <EncounterChatView />
    </>
  );
}
