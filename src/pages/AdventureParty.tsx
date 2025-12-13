import React, { useState } from 'react';
import { Plus, Users, Sword, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shared/Button';
import { useNavigate } from 'react-router-dom';
import { Character } from '../types/character';
import { Party, fetchParties, fetchAvailableCharacters } from '../lib/api/parties';
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

  const { data: parties = [], isLoading: isLoadingParties, error: errorParties } = useQuery<Party[], Error>({
    queryKey: ['parties', user?.id, isDM()],
    queryFn: () => fetchParties(user?.id, isDM()),
    enabled: !!user,
  });

  const { data: availableCharacters = [], isLoading: isLoadingChars, error: errorChars } = useQuery<Character[], Error>({
    queryKey: ['availableCharacters', user?.id],
    queryFn: () => fetchAvailableCharacters(user?.id),
    enabled: !!user && isCreating,
  });

  const loading = isLoadingParties || (isCreating && isLoadingChars);
  const error = errorParties?.message || errorChars?.message || null;

  const createPartyMutation = useMutation({
    mutationFn: async ({ name, characterIds }: { name: string; characterIds: string[] }) => {
      if (!name.trim()) throw new Error('Party name is required');
      if (!user) throw new Error('User not authenticated');

      const { data: party, error: partyError } = await supabase
        .from('parties')
        .insert([{ name: name, created_by: user.id }])
        .select()
        .single();

      if (partyError) throw partyError;
      if (!party) throw new Error('Party creation failed');

      if (characterIds.length > 0) {
        const membersToAdd = characterIds.map((characterId) => ({
          party_id: party.id,
          character_id: characterId,
        }));
        const { error: membersError } = await supabase.from('party_members').insert(membersToAdd);
        if (membersError) {
          await supabase.from('parties').delete().eq('id', party.id);
          throw membersError;
        }
      }
      return party;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties', user?.id, isDM()] });
      queryClient.invalidateQueries({ queryKey: ['availableCharacters', user?.id] });
      setNewPartyName('');
      setSelectedCharacters([]);
      setIsCreating(false);
    },
  });

  const handleCreateParty = () => {
    createPartyMutation.mutate({ name: newPartyName, characterIds: selectedCharacters });
  };

  if (loading && !isCreating) {
    return <div className="p-8 flex justify-center h-96 items-center"><LoadingSpinner size="lg" /></div>;
  }

  if (error && !isCreating) {
    return <div className="p-8"><ErrorMessage message={error} /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Adventure Parties</h1>
        </div>
        {isDM() && !isCreating && (
          // Responsive Button: Icon only on mobile, text on desktop
          <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>
            <span className="hidden md:inline">Create Party</span>
          </Button>
        )}
      </div>

      {error && !createPartyMutation.error && !isCreating && (
        <div className="mb-6"><ErrorMessage message={error} /></div>
      )}

      {/* CREATE MODE */}
      {isCreating && (
        <div className="mb-8 bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-blue-50/50">
            <h2 className="text-lg font-bold text-gray-800">Create New Party</h2>
            <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-4 md:p-6 space-y-6">
            {createPartyMutation.error && (
              <ErrorMessage message={createPartyMutation.error.message} />
            )}
            
            <div>
              <label htmlFor="partyName" className="block text-sm font-bold text-gray-700 mb-1">Party Name</label>
              <input
                type="text"
                id="partyName"
                value={newPartyName}
                onChange={(e) => setNewPartyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="e.g. The Fellowship of the Ring"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Select Initial Characters (Optional)</label>
              {isLoadingChars ? <div className="py-8 flex justify-center"><LoadingSpinner /></div> : 
               errorChars ? <ErrorMessage message={errorChars.message} /> : 
               availableCharacters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                  {availableCharacters.map((character) => {
                    const isSelected = selectedCharacters.includes(character.id || '');
                    return (
                      <div
                        key={character.id}
                        className={`
                          p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3
                          ${isSelected 
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                            : 'border-gray-200 hover:border-blue-300 hover:shadow-sm bg-white'
                          }
                        `}
                        onClick={() => {
                          if (character.id) {
                            setSelectedCharacters((prev) => 
                              prev.includes(character.id!) ? prev.filter((id) => id !== character.id) : [...prev, character.id!]
                            );
                          }
                        }}
                      >
                        <div className={`p-2 rounded-full ${isSelected ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          <Sword className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className={`font-bold text-sm ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>{character.name}</h3>
                          <p className="text-xs text-gray-500">{character.kin} {character.profession}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <p className="text-sm text-gray-500 italic">No available characters found to add.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="ghost" onClick={() => setIsCreating(false)} disabled={createPartyMutation.isPending} className="w-full md:w-auto">Cancel</Button>
              <Button variant="primary" onClick={handleCreateParty} loading={createPartyMutation.isPending} disabled={!newPartyName.trim() || createPartyMutation.isPending} className="w-full md:w-auto">Create Party</Button>
            </div>
          </div>
        </div>
      )}

      {/* LIST MODE */}
      {!isCreating && (
        parties.length > 0 ? (
          <div className="grid gap-6">
            {parties.map((party) => (
              <div
                key={party.id}
                onClick={() => navigate(`/party/${party.id}`)}
                className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer overflow-hidden group"
              >
                <div className="p-4 md:p-6 border-b border-gray-100 bg-gray-50/50 group-hover:bg-blue-50/30 transition-colors">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    {party.name}
                  </h2>
                </div>
                
                <div className="p-4 md:p-6">
                  {party.members.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {party.members.map((member) => (
                        <div key={member.id} className="p-3 border border-gray-100 rounded-lg bg-white flex items-center gap-3 shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Sword className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-gray-800 truncate">{member.name}</h3>
                            <p className="text-xs text-gray-500 truncate">{member.kin} {member.profession}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      <p className="text-sm text-gray-400 italic">No members in this party yet.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 md:mt-20">
            <EmptyState
              icon={Users}
              title="No Adventure Parties"
              description={isDM() ? "You haven't created any parties yet." : "You're not currently in any adventure parties."}
              action={isDM() ? (
                <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>Create Your First Party</Button>
              ) : undefined}
            />
          </div>
        )
      )}
    </div>
  );
}
