import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, Star, CheckSquare, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { fetchWeaknesses } from '../../lib/api/bioData';
import { updateCharacter } from '../../lib/api/characters';
import { CharacterStub } from '../../types/character';

interface SessionEndCheatsheetProps {
  members: CharacterStub[];
  partyId: string;
}

const advancementQuestions = [
  "Did the adventurers explore a new and dangerous location?",
  "Did they overcome a demanding challenge (a monster, trap, or riddle)?",
  "Did they complete an important part of the adventure?",
  "Did they make a discovery that is vital to the story?",
  "Did the player roleplay their character in an exemplary way?",
  "Did the player actively engage with the world and its inhabitants?",
  "Did the player have a good time and contribute to the fun?"
];

const gmPrinciples = [
  { title: "Be Generous", description: "It’s better to award one too many than one too few. Keep the momentum going!" },
  { title: "Don't Punish", description: "Never withhold marks for character mistakes or failed rolls. Failure is part of the story." },
];

export function SessionEndCheatsheet({ members, partyId }: SessionEndCheatsheetProps) {
  const queryClient = useQueryClient();
  const [interactionType, setInteractionType] = useState<'gaveIn' | 'overcame' | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedNewFlaw, setSelectedNewFlaw] = useState('');

  const selectedCharacter = useMemo(() => {
    return members.find(m => m.id === selectedCharacterId);
  }, [selectedCharacterId, members]);

  const { data: weaknessesData, isLoading: isLoadingWeaknesses } = useQuery({
    queryKey: ['weaknesses'],
    queryFn: fetchWeaknesses,
    enabled: interactionType === 'gaveIn',
  });
  
  const updateFlawMutation = useMutation({
    // Your API's mapCharacterData correctly maps `flaw` from the app to `weak_spot` for the DB
    mutationFn: ({ characterId, flaw }: { characterId: string, flaw: string | null }) => 
      updateCharacter(characterId, { flaw: flaw }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party', partyId] });
      setInteractionType(null);
      setSelectedCharacterId('');
      setSelectedNewFlaw('');
    }
  });

  const handleAssignFlaw = () => {
    if (selectedCharacterId && selectedNewFlaw) {
      updateFlawMutation.mutate({ characterId: selectedCharacterId, flaw: selectedNewFlaw });
    }
  };

  const handleRemoveFlaw = () => {
    if (selectedCharacterId) {
      updateFlawMutation.mutate({ characterId: selectedCharacterId, flaw: null });
    }
  };

  const flaws = weaknessesData?.flaws || [];

  return (
    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
      <div className="text-center mb-8">
        <Award className="w-12 h-12 mx-auto text-yellow-500" />
        <h2 className="text-2xl font-bold text-gray-800 mt-2">Session End Cheatsheet</h2>
        <p className="text-gray-600 mt-1">
          Award one Advancement Mark for each "yes" to the questions below.
        </p>
      </div>

      <div className="mb-10">
        <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600"/>
            Advancement Questions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {advancementQuestions.map((question, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">{question}</p>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-gray-800 font-medium mb-3">Did a character interact with their weakness?</p>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-md flex-1 bg-white">
              <input type="radio" name="weaknessInteraction" className="h-5 w-5 text-blue-600 focus:ring-blue-500"
                checked={interactionType === 'gaveIn'} onChange={() => setInteractionType('gaveIn')} />
              <span>Gave In to Weakness (1 Mark)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-md flex-1 bg-white">
              <input type="radio" name="weaknessInteraction" className="h-5 w-5 text-green-600 focus:ring-green-500"
                checked={interactionType === 'overcame'} onChange={() => setInteractionType('overcame')} />
              <span>Overcame Weakness (2 Marks)</span>
            </label>
          </div>

          {interactionType === 'gaveIn' && (
            <div className="mt-4 p-4 bg-white rounded-md border border-blue-200">
              <p className="text-sm font-medium text-gray-700 mb-4">The character gains one advancement mark. You must assign them a new Flaw.</p>
              {isLoadingWeaknesses && <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin"/>Loading weaknesses...</div>}
              {!isLoadingWeaknesses && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select value={selectedCharacterId} onChange={(e) => setSelectedCharacterId(e.target.value)} className="w-full p-2 border rounded-md bg-white shadow-sm">
                      <option value="" disabled>Select Character...</option>
                      {/* --- THIS IS THE FIX --- */}
                      {/* This dropdown now correctly shows ALL members */}
                      {members.map(member => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                      {/* --- END OF FIX --- */}
                    </select>
                    <select value={selectedNewFlaw} onChange={(e) => setSelectedNewFlaw(e.target.value)} className="w-full p-2 border rounded-md bg-white shadow-sm md:col-span-2">
                      <option value="" disabled>Select New Flaw...</option>
                      {flaws.map(flaw => <option key={flaw} value={flaw}>{flaw}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAssignFlaw} disabled={!selectedCharacterId || !selectedNewFlaw || updateFlawMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {updateFlawMutation.isPending ? 'Assigning...' : 'Assign Flaw'}
                  </button>
                </div>
              )}
            </div>
          )}

          {interactionType === 'overcame' && (
            <div className="mt-4 p-4 bg-white rounded-md border border-green-300">
                <div className="text-sm text-gray-700 space-y-2 mb-4">
                    <p><strong>If you during the session acted in a way that clearly goes against your weakness, you get two advancement marks.</strong></p>
                    <p>You have now also overcome your weakness and must remove it. You must then play a full session without a weakness. After that, you may choose a new weakness, preferably based on something that has occurred in the game.</p>
                </div>
                <div className="space-y-4">
                  <select value={selectedCharacterId} onChange={(e) => setSelectedCharacterId(e.target.value)} className="w-full md:w-1/3 p-2 border rounded-md bg-white shadow-sm">
                    <option value="" disabled>Select Character...</option>
                    {/* This logic is correct: only show members who have a flaw to remove */}
                    {members.filter(m => m.flaw).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                  {selectedCharacter?.flaw && <p className="text-sm text-gray-600">Current Flaw to be removed: <em className="font-medium text-gray-800">{selectedCharacter.flaw}</em></p>}
                  <button onClick={handleRemoveFlaw} disabled={!selectedCharacterId || updateFlawMutation.isPending} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {updateFlawMutation.isPending ? 'Removing...' : 'Remove Flaw'}
                  </button>
                </div>
            </div>
          )}

          {updateFlawMutation.isSuccess && <div className="mt-2 flex items-center gap-2 text-sm text-green-600"><CheckCircle className="w-4 h-4"/>Character updated successfully!</div>}
          {updateFlawMutation.error && <div className="mt-2 flex items-center gap-2 text-sm text-red-600"><AlertCircle className="w-4 h-4"/>Error: {updateFlawMutation.error.message}</div>}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500"/>
            GM Principles
        </h3>
        <div className="space-y-4">
          {gmPrinciples.map((principle, index) => (
            <div key={index}><p className="text-gray-800"><span className="font-bold">{principle.title}:</span> {principle.description}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
