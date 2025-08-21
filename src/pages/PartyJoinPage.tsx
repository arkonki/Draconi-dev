import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Check } from 'lucide-react';
import { Button } from '../components/shared/Button';
import { Character } from '../types/character';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { fetchPartyById, fetchAvailableCharacters } from '../lib/api/parties';

export function PartyJoinPage() {
  const { id: partyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');

  // Fetch party details
  const { data: party, isLoading: isLoadingParty, error: errorParty } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => fetchPartyById(partyId),
    enabled: !!partyId,
  });

  // Fetch user's available characters
  const { data: characters = [], isLoading: isLoadingChars, error: errorChars } = useQuery({
    queryKey: ['availableCharacters', user?.id],
    queryFn: () => fetchAvailableCharacters(user?.id),
    enabled: !!user,
  });

  // Mutation to join the party
  const joinPartyMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!characterId) {
        throw new Error('Please select a character');
      }
      if (!partyId) {
        throw new Error('Party ID is missing');
      }

      const { error } = await supabase
        .from('party_members')
        .insert([{ party_id: partyId, character_id: characterId }]);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate queries to refetch party data and available characters
      queryClient.invalidateQueries({ queryKey: ['party', partyId] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['availableCharacters', user?.id] });
      navigate(`/party/${partyId}`);
    },
  });

  const handleJoin = () => {
    if (selectedCharacter) {
      joinPartyMutation.mutate(selectedCharacter);
    }
  };

  const isLoading = isLoadingParty || isLoadingChars;
  const error = errorParty?.message || errorChars?.message || joinPartyMutation.error?.message;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorMessage message={error} />
        <Button
          variant="secondary"
          onClick={() => navigate('/adventure-party')}
          className="mt-4"
        >
          Back to Parties
        </Button>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorMessage message="Party not found." />
        <Button
          variant="secondary"
          onClick={() => navigate('/adventure-party')}
          className="mt-4"
        >
          Back to Parties
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center mb-8">
          <Users className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Join Adventure Party</h1>
          <p className="text-gray-600 text-lg">
            You've been invited to join <b>{party.name}</b>.
          </p>
        </div>

        {characters.length > 0 ? (
          <div className="space-y-6">
            <p className="text-center text-gray-700">Select one of your available characters to join the party.</p>
            <div className="space-y-3">
              {characters.map((character) => (
                <div
                  key={character.id}
                  onClick={() => setSelectedCharacter(character.id!)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    selectedCharacter === character.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                      : 'border-gray-200 hover:border-blue-400'
                  }`}
                >
                  <div>
                    <h3 className="font-semibold text-gray-800">{character.name}</h3>
                    <p className="text-sm text-gray-500">
                      {character.kin} {character.profession}
                    </p>
                  </div>
                  {selectedCharacter === character.id && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button
                variant="secondary"
                onClick={() => navigate('/adventure-party')}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={joinPartyMutation.isPending}
                disabled={!selectedCharacter || joinPartyMutation.isPending}
                onClick={handleJoin}
              >
                Join Party
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border-t mt-8">
            <p className="text-gray-600 mb-4">
              You don't have any available characters to join with.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate('/')}
            >
              Create a Character
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
