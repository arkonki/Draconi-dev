import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saveStoryIdea, getStoryIdeasForParty, deleteStoryIdea, updateStoryIdea } from '../../lib/api/storyIdeas';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { Save, Trash2, Sparkles, BookOpen, Search, Edit, X, KeyRound, Pencil } from 'lucide-react';

import MDEditor from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery';

type Tab = 'generate' | 'saved';

// --- Component for items in the saved list ---
function SavedIdeaListItem({ idea, onClick, isActive }) {
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-md cursor-pointer border transition-colors ${isActive ? 'bg-blue-50 border-blue-300' : 'bg-white hover:bg-gray-50 border-transparent'}`}
    >
      <h4 className="font-semibold text-sm text-gray-800 truncate">{idea.prompt || "Untitled Idea"}</h4>
      <p className="text-xs text-gray-500 mt-1 truncate">{idea.response.substring(0, 70)}...</p>
    </div>
  );
}

// --- Initial API Key Entry Component ---
function ApiKeyPrompt({ onKeySubmit }) {
  const [localApiKey, setLocalApiKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (localApiKey.trim()) {
      onKeySubmit(localApiKey);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] bg-gray-50 rounded-lg p-8 text-center">
      <KeyRound className="w-12 h-12 text-blue-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-800">OpenRouter API Key Required</h2>
      <p className="text-gray-600 mt-2 mb-6 max-w-md">
        To generate story ideas, please enter your OpenRouter API key. Your key will be saved securely in your browser's local storage for future use.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex items-center gap-2">
        <Input
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          placeholder="Enter your OpenRouter API key"
          className="flex-grow"
        />
        <Button type="submit">Save & Continue</Button>
      </form>
    </div>
  );
}


// --- Main Component ---
export function StoryHelperApp({ partyId, initialPartyData = '' }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [searchTerm, setSearchTerm] = useState('');

  // Generator State
  const [prompt, setPrompt] = useState('');
  const [partyData, setPartyData] = useState(initialPartyData);
  const [locationData, setLocationData] = useState('');
  const [npcData, setNpcData] = useState('');
  const [response, setResponse] = useState('');
  const [editedResponse, setEditedResponse] = useState('');
  
  // API State
  const [apiKey, setApiKey] = useState('');
  const [isKeySubmitted, setIsKeySubmitted] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Saved Ideas Tab State
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySubmitted(true);
    }
  }, []);

  useEffect(() => { setEditedResponse(response); }, [response]);
  useEffect(() => { setPartyData(initialPartyData); }, [initialPartyData]);

  const handleApiKeySubmit = (key) => {
    localStorage.setItem('openrouter_api_key', key);
    setApiKey(key);
    setIsKeySubmitted(true);
    setIsEditingKey(false);
  };


  // --- Data Fetching and Mutations ---
  const { data: savedIdeas, isLoading: isLoadingIdeas } = useQuery({ 
    queryKey: ['storyIdeas', partyId], 
    queryFn: () => getStoryIdeasForParty(partyId),
    enabled: isKeySubmitted, // Only fetch ideas if the user has submitted a key
  });
  
  const saveMutation = useMutation({
    mutationFn: (newIdea) => saveStoryIdea(newIdea),
    onSuccess: (savedData) => {
        queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
        setResponse('');
        setPrompt('');
        setActiveTab('saved');
        if (savedData && savedData.length > 0) {
            setSelectedIdea(savedData[0]);
        }
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: (ideaId) => deleteStoryIdea(ideaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      setSelectedIdea(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ ideaId, updates }) => updateStoryIdea(ideaId, updates),
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      if (updatedData && updatedData.length > 0) {
        setSelectedIdea(updatedData[0]);
      }
      setIsEditing(false);
    },
  });

  // --- Handler Functions ---
  const handleSaveIdea = () => {
    if (!editedResponse || !user) return;
    const ideaData = {
      party_id: partyId,
      user_id: user.id,
      prompt,
      response: editedResponse,
      context: { party: partyData, location: locationData, npc: npcData },
    };
    saveMutation.mutate(ideaData);
  };
  
  const handleSelectIdea = (idea) => {
    setSelectedIdea(idea);
    setIsEditing(false);
  };
  
  const handleStartEdit = () => {
    if (!selectedIdea) return;
    setEditedContent(selectedIdea.response);
    setIsEditing(true);
  };

  const handleSaveChanges = () => {
    if (!selectedIdea) return;
    updateMutation.mutate({ ideaId: selectedIdea.id, updates: { response: editedContent } });
  };

  // --- FULL AI GENERATION LOGIC ---
  const generateStory = async () => {
    if (!prompt.trim()) { setError('Please enter a primary prompt.'); return; }
    if (!apiKey.trim()) { setError('API Key is missing. Please add it via the edit icon.'); return; }
    setLoading(true); setError(''); setResponse('');
    try {
      let fullPrompt = `You are a helpful GM assistant for a Dragonbane TTRPG game. Generate creative content based on the following information. CRITICALLY: Format your entire response using D&D 5e-style markdown blocks (like \`\`\`monster or \`\`\`note or \`\`\`spell), suitable for a tool like Homebrewery.\n\n--- Main Prompt ---\n${prompt}`;
      if (partyData.trim()) fullPrompt += `\n\n--- Party Members ---\n${partyData}`;
      if (locationData.trim()) fullPrompt += `\n\n--- Current Location ---\n${locationData}`;
      if (npcData.trim()) fullPrompt += `\n\n--- Key NPCs ---\n${npcData}`;

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: fullPrompt }], max_tokens: 2048, temperature: 0.75 }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
      const data = await res.json();
      setResponse(data.choices[0]?.message?.content || 'No response generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const filteredIdeas = savedIdeas?.filter(idea => (idea.prompt?.toLowerCase() || '').includes(searchTerm.toLowerCase()));
  
  const commonTextAreaClass = "w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y";

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm" style={{ minHeight: '70vh' }}>
      {isKeySubmitted ? (
        <>
          <div className="border-b mb-6 flex justify-between items-center">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button onClick={() => setActiveTab('generate')} className={`shrink-0 flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'generate' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Sparkles className="w-5 h-5" /> Generate Idea
              </button>
              <button onClick={() => setActiveTab('saved')} className={`shrink-0 flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'saved' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <BookOpen className="w-5 h-5" /> Saved Ideas
              </button>
            </nav>
            <div className="flex items-center gap-2">
              {isEditingKey ? (
                  <div className="flex items-center gap-2">
                    <Input type="password" placeholder="New API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-9"/>
                    <Button onClick={() => handleApiKeySubmit(apiKey)} size="sm">Save</Button>
                    <Button onClick={() => setIsEditingKey(false)} variant="ghost" size="icon"><X className="w-4 h-4"/></Button>
                  </div>
              ) : (
                <Button onClick={() => setIsEditingKey(true)} variant="ghost" size="icon" aria-label="Edit API Key">
                  <Pencil className="w-4 h-4 text-gray-500" />
                </Button>
              )}
            </div>
          </div>

          <div>
            {activeTab === 'generate' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-gray-800">1. Provide Context</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Main Prompt</label>
                    <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., 'A mysterious one-eyed sailor with a quest...'" className={commonTextAreaClass} rows={3} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Party Members</label>
                      <textarea value={partyData} onChange={(e) => setPartyData(e.target.value)} className={commonTextAreaClass} rows={5} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location Details</label>
                      <textarea value={locationData} onChange={(e) => setLocationData(e.target.value)} placeholder="e.g., 'The Salty Barnacle, a rickety ship...'" className={commonTextAreaClass} rows={5} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Key NPCs</label>
                      <textarea value={npcData} onChange={(e) => setNpcData(e.target.value)} placeholder="e.g., 'The party's current patron...'" className={commonTextAreaClass} rows={5} />
                    </div>
                  </div>
                  <Button onClick={generateStory} disabled={loading} icon={Sparkles}>
                    {loading ? 'Generating...' : 'Generate Story Idea'}
                  </Button>
                </div>
                
                <div>
                  <h3 className="font-bold text-lg text-gray-800 mb-4">2. Review, Edit, and Save</h3>
                  {loading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
                  {error && <ErrorMessage message={error} />}
                  {response && (
                    <div>
                      <div className="border rounded-md overflow-hidden" data-color-mode="light">
                        <MDEditor
                          height={450}
                          value={editedResponse}
                          onChange={(value) => setEditedResponse(value || '')}
                          previewOptions={{
                            style: { backgroundColor: 'transparent', padding: 0 },
                            wrapper: ({ children }) => <div className="phb p-4">{children}</div>,
                            components: {
                              markdown: (props) => (
                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]} {...props} />
                              ),
                            },
                          }}
                        />
                      </div>
                      <Button onClick={handleSaveIdea} variant="outline" size="sm" className="mt-4" disabled={saveMutation.isPending || !editedResponse} icon={Save}>
                        {saveMutation.isPending ? 'Saving...' : 'Save Idea'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'saved' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 border-r pr-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input type="text" placeholder="Search prompts..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {isLoadingIdeas ? <div className="flex justify-center py-8"><LoadingSpinner /></div> : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {filteredIdeas && filteredIdeas.length > 0 ? (
                        filteredIdeas.map((idea) => (
                            <SavedIdeaListItem key={idea.id} idea={idea} onClick={() => handleSelectIdea(idea)} isActive={selectedIdea?.id === idea.id} />
                          ))
                      ) : <p className="text-center text-sm text-gray-500 py-4">No ideas found.</p>}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  {!selectedIdea ? (
                    <div className="flex items-center justify-center h-full text-gray-500 rounded-lg bg-gray-50/50">
                      <p>Select an idea from the list to view or edit it.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800 truncate">{selectedIdea.prompt}</h3>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setIsEditing(false)} icon={X}>Cancel</Button>
                            <Button onClick={handleSaveChanges} loading={updateMutation.isPending} icon={Save}>Save Changes</Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={handleStartEdit} icon={Edit}>Edit</Button>
                            <Button variant="danger-outline" onClick={() => deleteMutation.mutate(selectedIdea.id)} loading={deleteMutation.isPending && deleteMutation.variables === selectedIdea.id} icon={Trash2}>Delete</Button>
                          </div>
                        )}
                      </div>

                      <div className="border rounded-md overflow-hidden" data-color-mode="light">
                        {isEditing ? (
                          <MDEditor height={500} value={editedContent} onChange={(val) => setEditedContent(val || '')} previewOptions={{ wrapper: ({ children }) => <div className="phb p-4">{children}</div>, components: { markdown: (props) => ( <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]} {...props} /> ), }, }}/>
                        ) : (
                          <div className="p-4 phb min-h-[500px]">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]}>
                              {selectedIdea.response}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ApiKeyPrompt onKeySubmit={handleApiKeySubmit} />
      )}
    </div>
  );
}