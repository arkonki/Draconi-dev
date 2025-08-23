import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase'; // Ensure this path is correct
import { useAuth } from '../contexts/AuthContext';
import { Users, Check } from 'lucide-react';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { fetchAvailableCharacters } from '../lib/api/parties'; // Assuming this API is still valid

// This component no longer fetches party data directly
export function PartyJoinPage() {
  // 1. Get inviteCode from URL params. Make sure your Route is `/party/join/:inviteCode`
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');

  // 2. We ONLY fetch the user's available characters.
  const { 
    data: characters = [], 
    isLoading: isLoadingChars, 
    error: errorChars 
  } = useQuery({
    queryKey: ['availableCharacters', user?.id],
    queryFn: () => fetchAvailableCharacters(user?.id),
    enabled: !!user,
  });

  // 3. The mutation is now completely different. It calls the RPC.
  const joinPartyMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!characterId) throw new Error('Please select a character');
      if (!inviteCode) throw new Error('Invite code is missing');

      // Call the secure RPC function with both parameters
      const { data, error } = await supabase.rpc('join_party_with_character', {
        p_invite_code: inviteCode,
        p_character_id: characterId,
      });

      if (error) {
        // Translate database errors into user-friendly messages
        if (error.message.includes('invalid_invite_code')) {
          throw new Error('This invite link is invalid or has expired.');
        }
        if (error.message.includes('character_already_in_a_party')) {
          throw new Error('This character is already in a party.');
        }
        if (error.message.includes('user_already_in_party')) {
            throw new Error('You are already a member of this party.');
        }
        throw error; // Throw original error for other cases
      }
      return data; // Return the success data
    },
    onSuccess: (data) => {
      // On success, the RPC returns the party_id for redirection
      const partyId = data?.party_id;
      if (partyId) {
        // Invalidate queries to make sure everything is fresh
        queryClient.invalidateQueries({ queryKey: ['parties'] }); // A general key for party lists
        queryClient.invalidateQueries({ queryKey: ['party', partyId] }); // The specific party we just joined
        queryClient.invalidateQueries({ queryKey: ['availableCharacters', user?.id] });
        navigate(`/party/${partyId}`);
      } else {
        // Fallback if something goes wrong
        navigate('/adventure-party');
      }
    },
  });

  const handleJoin = () => {
    if (selectedCharacter) {
      joinPartyMutation.mutate(selectedCharacter);
    }
  };
  
  // 4. Simplified loading and error states
  const isLoading = isLoadingChars;
  const error = errorChars?.message || joinPartyMutation.error?.message;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // 5. Custom error page for invalid invite links
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center mb-8">
          <Users className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Join an Adventure</h1>
          {/* We can't display party name anymore, so we use a generic title */}
          <p className="text-gray-600 text-lg">
            You've been invited to join a new party!
          </p>
        </div>

        {characters.length > 0 ? (
          <div className="space-y-6">
            <p className="text-center text-gray-700">Select one of your available characters to join with.</p>
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
                Join with Selected Character
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
              onClick={() => navigate('/')} // Redirect to character creation or dashboard
            >
              Create a Character
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}