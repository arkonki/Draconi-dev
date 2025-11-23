import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, Star, CheckSquare, Loader2, AlertCircle, CheckCircle, Flag, ShieldCheck, XCircle } from 'lucide-react';
import { fetchWeaknesses } from '../../lib/api/bioData';
import { updateCharacter } from '../../lib/api/characters';
import { CharacterStub } from '../../types/character';
import { Button } from '../shared/Button';

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
    <div className="max-w-4xl mx-auto space-y-8 p-6">
      
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 text-yellow-600 mb-2">
          <Award size={32} />
        </div>
        <h2 className="text-3xl font-bold text-gray-900">Session End Cheatsheet</h2>
        <p className="text-gray-500 max-w-lg mx-auto">Review the session's progress and award advancement marks to your players.</p>
      </div>

      {/* 1. Advancement Questions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-blue-50/50 border-b border-gray-100 flex items-center gap-2">
           <CheckSquare className="text-blue-600 w-5 h-5"/>
           <h3 className="font-bold text-gray-800">Advancement Checklist</h3>
        </div>
        <div className="p-6">
           <p className="text-sm text-gray-600 mb-6">Ask the group these questions. For every "Yes", each player marks an advancement skill of their choice.</p>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
             {advancementQuestions.map((q, i) => (
               <div key={i} className="flex gap-3 items-start">
                 <div className="w-5 h-5 rounded bg-gray-100 border border-gray-300 flex-shrink-0 mt-0.5" />
                 <p className="text-gray-700 text-sm leading-relaxed">{q}</p>
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* 2. Weakness Mechanics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-purple-50/50 border-b border-gray-100 flex items-center gap-2">
           <Flag className="text-purple-600 w-5 h-5"/>
           <h3 className="font-bold text-gray-800">Weaknesses & Flaws</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-800 font-medium mb-4">Did a character interact significantly with their weakness?</p>
          
          {/* Toggle Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <button 
              onClick={() => { setInteractionType('gaveIn'); setSelectedCharacterId(''); }}
              className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${interactionType === 'gaveIn' ? 'border-red-500 bg-red-50 ring-1 ring-red-200' : 'border-gray-200 hover:border-red-200 hover:bg-gray-50'}`}
            >
              <div className="flex justify-between items-start">
                 <span className="font-bold text-red-900 block mb-1">Gave In to Weakness</span>
                 {interactionType === 'gaveIn' && <CheckCircle size={20} className="text-red-600" />}
              </div>
              <p className="text-xs text-red-700">Gain 1 Mark. Must take a new Flaw.</p>
            </button>

            <button 
              onClick={() => { setInteractionType('overcame'); setSelectedCharacterId(''); }}
              className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${interactionType === 'overcame' ? 'border-green-500 bg-green-50 ring-1 ring-green-200' : 'border-gray-200 hover:border-green-200 hover:bg-gray-50'}`}
            >
              <div className="flex justify-between items-start">
                 <span className="font-bold text-green-900 block mb-1">Overcame Weakness</span>
                 {interactionType === 'overcame' && <CheckCircle size={20} className="text-green-600" />}
              </div>
              <p className="text-xs text-green-700">Gain 2 Marks. Remove current Flaw/Weakness.</p>
            </button>
          </div>

          {/* Conditional Content Area */}
          <div className="transition-all duration-300 ease-in-out">
            
            {/* GAVE IN LOGIC */}
            {interactionType === 'gaveIn' && (
               <div className="animate-in fade-in slide-in-from-top-2 bg-gray-50 p-5 rounded-lg border border-gray-200">
                 <div className="flex items-start gap-3 mb-4 text-sm text-gray-600">
                   <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>
                   <p>The character succumbed to their weakness. They gain <strong>1 Advancement Mark</strong>, but suffer a setback. Select a new <strong>Flaw</strong> for them.</p>
                 </div>

                 {isLoadingWeaknesses ? (
                   <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400"/></div>
                 ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Character</label>
                        <select className="w-full p-2.5 bg-white border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-500 outline-none" value={selectedCharacterId} onChange={e => setSelectedCharacterId(e.target.value)}>
                          <option value="" disabled>Select character...</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Flaw</label>
                        <select className="w-full p-2.5 bg-white border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-500 outline-none" value={selectedNewFlaw} onChange={e => setSelectedNewFlaw(e.target.value)}>
                          <option value="" disabled>Choose flaw...</option>
                          {flaws.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2 flex justify-end mt-2">
                        <Button 
                           variant="danger" 
                           onClick={handleAssignFlaw} 
                           disabled={!selectedCharacterId || !selectedNewFlaw || updateFlawMutation.isPending}
                           isLoading={updateFlawMutation.isPending}
                        >
                           Assign Flaw & Close
                        </Button>
                      </div>
                   </div>
                 )}
               </div>
            )}

            {/* OVERCAME LOGIC */}
            {interactionType === 'overcame' && (
               <div className="animate-in fade-in slide-in-from-top-2 bg-green-50/50 p-5 rounded-lg border border-green-200">
                 <div className="flex items-start gap-3 mb-4 text-sm text-gray-700">
                   <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"/>
                   <div className="space-y-2">
                      <p><strong>Great Roleplaying!</strong> The character acted against their nature.</p>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600">
                        <li>Gain <strong>2 Advancement Marks</strong>.</li>
                        <li>They have overcome their weakness/flaw. <strong>Remove it now.</strong></li>
                        <li>They must play one full session without a weakness before choosing a new one.</li>
                      </ul>
                   </div>
                 </div>

                 <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-grow w-full">
                       <label className="block text-xs font-bold text-green-700 uppercase mb-1">Character to Redeem</label>
                       <select className="w-full p-2.5 bg-white border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-green-500 outline-none" value={selectedCharacterId} onChange={e => setSelectedCharacterId(e.target.value)}>
                          <option value="" disabled>Select character...</option>
                          {members.filter(m => m.flaw).map(m => <option key={m.id} value={m.id}>{m.name} (Has Flaw)</option>)}
                       </select>
                       {selectedCharacter?.flaw && <p className="text-xs text-green-600 mt-1">Removing: <strong>{selectedCharacter.flaw}</strong></p>}
                    </div>
                    <Button 
                       className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white" 
                       onClick={handleRemoveFlaw}
                       disabled={!selectedCharacterId || updateFlawMutation.isPending}
                       isLoading={updateFlawMutation.isPending}
                    >
                       Redeem & Remove Flaw
                    </Button>
                 </div>
                 {members.filter(m => m.flaw).length === 0 && <p className="text-xs text-gray-500 italic mt-3 text-center">No characters currently have a flaw to remove.</p>}
               </div>
            )}

            {/* Feedback Banners */}
            {updateFlawMutation.isSuccess && (
               <div className="mt-4 p-3 bg-green-100 text-green-800 text-sm rounded-lg flex items-center gap-2 animate-in fade-in">
                 <CheckCircle size={16}/> Update successful!
               </div>
            )}
            {updateFlawMutation.error && (
               <div className="mt-4 p-3 bg-red-100 text-red-800 text-sm rounded-lg flex items-center gap-2 animate-in fade-in">
                 <XCircle size={16}/> {updateFlawMutation.error.message}
               </div>
            )}

          </div>
        </div>
      </div>

      {/* 3. GM Principles */}
      <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-6">
         <h3 className="text-lg font-bold text-yellow-800 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5"/> GM Principles
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gmPrinciples.map((p, i) => (
               <div key={i}>
                  <h4 className="font-bold text-yellow-900 text-sm uppercase tracking-wide mb-1">{p.title}</h4>
                  <p className="text-yellow-800 text-sm">{p.description}</p>
               </div>
            ))}
         </div>
      </div>

    </div>
  );
}
