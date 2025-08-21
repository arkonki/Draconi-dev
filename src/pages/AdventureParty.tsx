import React, { useState, useEffect } from 'react';
import { Plus, Users, Sword, Shield, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shared/Button';
import { useNavigate } from 'react-router-dom';
import { Character } from '../types/character';
import { Party, fetchParties, fetchAvailableCharacters } from '../lib/api/parties'; // Import types and fetch functions
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { EmptyState } from '../components/shared/EmptyState';

export function AdventureParty() {
  const { user, isDM } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  // Removed local error state

  // Fetch Parties using useQuery
  const { data: parties = [], isLoading: isLoadingParties, error: errorParties } = useQuery<Party[], Error>({
    queryKey: ['parties', user?.id, isDM()], // Key depends on user and role
    queryFn: () => fetchParties(user?.id, isDM()),
    enabled: !!user, // Only run if user is logged in
  });

  // Fetch Available Characters using useQuery
  const { data: availableCharacters = [], isLoading: isLoadingChars, error: errorChars } = useQuery<Character[], Error>({
    queryKey: ['availableCharacters', user?.id],
    queryFn: () => fetchAvailableCharacters(user?.id),
    enabled: !!user && isCreating, // Only fetch when creating a party
  });

  // Combine loading and error states
  const loading = isLoadingParties || (isCreating && isLoadingChars);
  const error = errorParties?.message || errorChars?.message || null;

  // Mutation for creating a party
  const createPartyMutation = useMutation({
    mutationFn: async ({ name, characterIds }: { name: string; characterIds: string[] }) => {
      if (!name.trim()) {
        throw new Error('Party name is required');
      }
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 1. Create the party
      const { data: party, error: partyError } = await supabase
        .from('parties')
        .insert([{ name: name, created_by: user.id }])
        .select()
        .single();

      if (partyError) throw partyError;
      if (!party) throw new Error('Party creation failed');

      // 2. Add selected members (if any)
      if (characterIds.length > 0) {
        const membersToAdd = characterIds.map((characterId) => ({
          party_id: party.id,
          character_id: characterId,
        }));
        const { error: membersError } = await supabase
          .from('party_members')
          .insert(membersToAdd);

        if (membersError) {
          // Optional: Attempt to delete the created party if adding members fails
          await supabase.from('parties').delete().eq('id', party.id);
          throw membersError;
        }
      }
      return party;
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['parties', user?.id, isDM()] });
      queryClient.invalidateQueries({ queryKey: ['availableCharacters', user?.id] });
      setNewPartyName('');
      setSelectedCharacters([]);
      setIsCreating(false);
    },
    onError: (err) => {
      console.error("Failed to create party:", err);
      // Set local error state if needed for UI feedback in the modal
    }
  });

  const handleCreateParty = () => {
    createPartyMutation.mutate({ name: newPartyName, characterIds: selectedCharacters });
  };

  if (loading && !isCreating) { // Show main loading only when not in creation mode
    return (
      <div className="p-8 flex justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error && !isCreating) { // Show main error only when not in creation mode
    return (
      <div className="p-8">
        <ErrorMessage message={error} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Adventure Parties</h1>
        </div>
        {isDM() && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setIsCreating(true)}
            disabled={isCreating} // Disable if already creating
          >
            Create Party
          </Button>
        )}
      </div>

      {/* Display general error if not specific to creation modal */}
      {error && !createPartyMutation.error && !isCreating && (
         <div className="mb-6"> <ErrorMessage message={error} /> </div>
      )}

      {/* Creation Form */}
      {isCreating && (
        <div className="mb-6 bg-white rounded-lg shadow-md p-6 border border-blue-200">
          <h2 className="text-xl font-semibold mb-4">Create New Party</h2>
          {/* Display mutation-specific error here */}
          {createPartyMutation.error && (
             <div className="mb-4"> <ErrorMessage message={createPartyMutation.error.message} /> </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="partyName" className="block text-sm font-medium text-gray-700 mb-1">
                Party Name
              </label>
              <input
                type="text"
                id="partyName"
                value={newPartyName}
                onChange={(e) => setNewPartyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter party name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Initial Characters (Optional)
              </label>
              {isLoadingChars ? (
                 <LoadingSpinner />
              ) : errorChars ? (
                 <ErrorMessage message={errorChars.message} />
              ) : availableCharacters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-60 overflow-y-auto p-2 border rounded-md">
                  {availableCharacters.map((character) => (
                    <div
                      key={character.id}
                      className={`p-3 border rounded-lg cursor-pointer ${
                        selectedCharacters.includes(character.id || '')
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => {
                        if (character.id) {
                          setSelectedCharacters((prev) =>
                            prev.includes(character.id!)
                              ? prev.filter((id) => id !== character.id)
                              : [...prev, character.id]
                          );
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Sword className="w-4 h-4 text-gray-600" />
                        <div>
                          <h3 className="font-medium text-sm">{character.name}</h3>
                          <p className="text-xs text-gray-500">
                            {character.kin} {character.profession}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No available characters to add.</p>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <Button
                variant="secondary"
                onClick={() => setIsCreating(false)}
                disabled={createPartyMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateParty}
                loading={createPartyMutation.isPending}
                disabled={!newPartyName.trim() || createPartyMutation.isPending}
              >
                Create Party
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Party List */}
      {!isCreating && (
        parties.length > 0 ? (
          <div className="grid gap-6">
            {parties.map((party) => (
              <div
                key={party.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{party.name}</h2>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/party/${party.id}`)}
                  >
                    View Party
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {party.members.map((member) => (
                    <div key={member.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Sword className="w-5 h-5 text-gray-600" />
                        <div>
                          <h3 className="font-medium">{member.name}</h3>
                          <p className="text-sm text-gray-500">
                            {member.kin} {member.profession}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                   {party.members.length === 0 && (
                     <p className="text-sm text-gray-500 italic col-span-full">No members yet.</p>
                   )}
                </div>
              </div>
            ))}
          </div>
        ) : (
           <EmptyState
             icon={Users}
             title="No Adventure Parties"
             description={isDM() ? "You haven't created any parties yet." : "You're not currently in any adventure parties."}
             action={isDM() ? (
               <Button
                 variant="primary"
                 icon={Plus}
                 onClick={() => setIsCreating(true)}
               >
                 Create Your First Party
               </Button>
             ) : undefined}
           />
        )
      )}
    </div>
  );
}
