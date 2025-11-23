import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saveStoryIdea, getStoryIdeasForParty, deleteStoryIdea, updateStoryIdea } from '../../lib/api/storyIdeas';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import { 
  Save, Trash2, Sparkles, BookOpen, Search, Edit, X, KeyRound, 
  Settings, Wand2, ChevronRight, ChevronDown, FileText, Bot,
  Shield, StickyNote 
} from 'lucide-react';

// --- MARKDOWN IMPORTS ---
import MDEditor, { commands, ICommand } from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery';

type Tab = 'generate' | 'saved';

// --- CUSTOM EDITOR TEMPLATES (Adapted for Dragonbane) ---
const monsterTemplate = `\`\`\`monster
## Monster Name
*Size type (tag)*
___
- **Ferocity:** 1
- **Movement:** 12
- **Armor:** 2
- **HP:** 24
___
|STR|CON|AGL|INT|WIL|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|16|14|12|10|14|8|
___
***Trait Name.*** Description of trait (e.g. Immunity to Fire).

### Monster Attacks
| d6 | Attack |
|:---|:---|
| 1 | **Slash:** 2D8 slashing damage. |
| 2 | **Bite:** 3D6 piercing damage. |
| 3 | **Roar:** Fear attack (WIL roll). |
\`\`\``;

const noteTemplate = `\`\`\`note
#### GM Note
Use this block for specific rules, descriptions, or secrets that should stand out on the page.
\`\`\``;

const spellTemplate = `\`\`\`spell
#### Spell Name
*Rank 1 School*
___
- **Requirement:** Word, Gesture
- **Casting Time:** Action
- **Range:** 10 meters
- **Duration:** Instant
___
Description of the spell effect goes here.
\`\`\``;

// --- CUSTOM COMMANDS DEFINITION ---
const monsterCommand: ICommand = { name: 'monsterBlock', keyCommand: 'monsterBlock', buttonProps: { 'aria-label': 'Insert Monster Block' }, icon: <Shield size={12} />, execute: (state, api) => { api.replaceSelection(monsterTemplate); } };
const noteCommand: ICommand = { name: 'noteBlock', keyCommand: 'noteBlock', buttonProps: { 'aria-label': 'Insert Note Block' }, icon: <StickyNote size={12} />, execute: (state, api) => { api.replaceSelection(noteTemplate); } };
const spellCommand: ICommand = { name: 'spellBlock', keyCommand: 'spellBlock', buttonProps: { 'aria-label': 'Insert Spell Block' }, icon: <BookOpen size={12} />, execute: (state, api) => { api.replaceSelection(spellTemplate); } };

const customCommands = [
  commands.bold, commands.italic, commands.strikethrough, commands.hr,
  commands.divider,
  commands.title, commands.quote, commands.code, commands.codeBlock,
  commands.divider,
  commands.link, commands.image,
  commands.divider,
  monsterCommand, noteCommand, spellCommand
];

// --- SUB-COMPONENT: SAVED ITEM ROW ---
function SavedIdeaListItem({ idea, onClick, isActive }: { idea: any, onClick: () => void, isActive: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`
        p-4 rounded-lg cursor-pointer border transition-all duration-200
        ${isActive 
          ? 'bg-indigo-50 border-indigo-500 shadow-sm ring-1 ring-indigo-200' 
          : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'
        }
      `}
    >
      <div className="flex justify-between items-start mb-1">
        <h4 className={`font-bold text-sm truncate pr-2 ${isActive ? 'text-indigo-800' : 'text-gray-800'}`}>
          {idea.prompt || "Untitled Idea"}
        </h4>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {new Date(idea.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
        {/* Strip markdown symbols for the preview text */}
        {idea.response.replace(/[#*`]/g, '').substring(0, 100)}...
      </p>
    </div>
  );
}

// --- SUB-COMPONENT: API KEY SETUP ---
function ApiKeyPrompt({ onKeySubmit }: { onKeySubmit: (key: string) => void }) {
  const [localApiKey, setLocalApiKey] = useState('');
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center max-w-lg mx-auto mt-10">
      <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
        <KeyRound size={32} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure AI Assistant</h2>
      <p className="text-gray-500 mb-8 leading-relaxed">
        To generate Dragonbane content, this tool uses OpenRouter. Please enter your API key below. It is stored locally in your browser.
      </p>
      <form 
        onSubmit={(e) => { e.preventDefault(); if(localApiKey.trim()) onKeySubmit(localApiKey); }} 
        className="w-full flex gap-2"
      >
        <input
          type="password"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          placeholder="sk-or-..."
          className="flex-grow px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <Button type="submit" variant="primary">Save Key</Button>
      </form>
      <p className="text-xs text-gray-400 mt-4">
        Don't have a key? Visit <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="underline hover:text-indigo-600">OpenRouter.ai</a>
      </p>
    </div>
  );
}

// --- MAIN COMPONENT ---
export function StoryHelperApp({ partyId, initialPartyData = '' }: { partyId: string, initialPartyData?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Generator State
  const [prompt, setPrompt] = useState('');
  const [partyData, setPartyData] = useState(initialPartyData);
  const [locationData, setLocationData] = useState('');
  const [npcData, setNpcData] = useState('');
  
  // UI Toggles
  const [showContext, setShowContext] = useState(true);
  const [response, setResponse] = useState('');
  const [editedResponse, setEditedResponse] = useState('');
  
  // API & Config State
  const [apiKey, setApiKey] = useState('');
  const [isKeySubmitted, setIsKeySubmitted] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Saved Ideas State
  const [selectedIdea, setSelectedIdea] = useState<any>(null);
  const [isEditingSaved, setIsEditingSaved] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // Initialization
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySubmitted(true);
    }
  }, []);

  useEffect(() => { setEditedResponse(response); }, [response]);
  useEffect(() => { if (!partyData) setPartyData(initialPartyData); }, [initialPartyData]);

  // --- ACTIONS ---

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('openrouter_api_key', key);
    setApiKey(key);
    setIsKeySubmitted(true);
    setShowConfig(false);
  };

  const { data: savedIdeas, isLoading: isLoadingIdeas } = useQuery({ 
    queryKey: ['storyIdeas', partyId], 
    queryFn: () => getStoryIdeasForParty(partyId),
    enabled: isKeySubmitted,
  });
  
  const saveMutation = useMutation({
    mutationFn: (newIdea: any) => saveStoryIdea(newIdea),
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
    mutationFn: (ideaId: string) => deleteStoryIdea(ideaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      setSelectedIdea(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ ideaId, updates }: {ideaId: string, updates: any}) => updateStoryIdea(ideaId, updates),
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      if (updatedData && updatedData.length > 0) setSelectedIdea(updatedData[0]);
      setIsEditingSaved(false);
    },
  });

  const handleSaveGenerated = () => {
    if (!editedResponse || !user) return;
    const ideaData = {
      party_id: partyId,
      user_id: user.id,
      prompt: prompt || "Generated Idea",
      response: editedResponse,
      context: { party: partyData, location: locationData, npc: npcData },
    };
    saveMutation.mutate(ideaData);
  };

  const generateStory = async () => {
    if (!prompt.trim()) { setError('Please enter a prompt.'); return; }
    if (!apiKey.trim()) { setError('API Key missing.'); setShowConfig(true); return; }
    
    setLoading(true); setError(''); setResponse('');
    
    try {
      let fullPrompt = `You are a helpful GM assistant for a Dragonbane TTRPG game. Generate creative content based on the following information. CRITICALLY: Format your entire response using markdown suitable for a tool like Homebrewery, but do not include the backticks or labels for the content blocks (like \`\`\`monster or \`\`\`note).\n\n--- Main Prompt ---\n${prompt}`;
      
      if (prompt.toLowerCase().includes('monster') || prompt.toLowerCase().includes('creature')) {
        fullPrompt += `\n\nSTRICT FORMATTING: Create a Dragonbane monster. Use the Markdown format: \n\`\`\`monster\n## Name\n*Size type*\n___\n- **Ferocity:** 1\n...\n\`\`\`\nInclude a Monster Attacks table with d6 rolls.`;
      }

      if (partyData.trim()) fullPrompt += `\n\n--- Context: Party ---\n${partyData}`;
      if (locationData.trim()) fullPrompt += `\n\n--- Context: Location ---\n${locationData}`;
      if (npcData.trim()) fullPrompt += `\n\n--- Context: NPCs ---\n${npcData}`;

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            model: 'google/gemini-2.5-flash', 
            messages: [{ role: 'user', content: fullPrompt }], 
            max_tokens: 2048, 
            temperature: 0.75 
        }),
      });
      
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const content = data.choices[0]?.message?.content || 'No response.';
      setResponse(content);
      setEditedResponse(content);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const filteredIdeas = savedIdeas?.filter((idea:any) => (idea.prompt?.toLowerCase() || '').includes(searchTerm.toLowerCase()));

  if (!isKeySubmitted) return <ApiKeyPrompt onKeySubmit={handleApiKeySubmit} />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-150px)]">
      
      {/* TOP BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex gap-6">
           <button onClick={() => setActiveTab('generate')} className={`flex items-center gap-2 pb-3 -mb-3 border-b-2 text-sm font-bold transition-colors ${activeTab === 'generate' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
             <Wand2 size={18}/> Generator
           </button>
           <button onClick={() => setActiveTab('saved')} className={`flex items-center gap-2 pb-3 -mb-3 border-b-2 text-sm font-bold transition-colors ${activeTab === 'saved' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
             <BookOpen size={18}/> Library
           </button>
        </div>
        <div className="flex items-center gap-2">
            {showConfig ? (
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg animate-in fade-in slide-in-from-right-2">
                   <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="bg-white border-none rounded px-2 py-1 text-xs w-32 focus:ring-0" placeholder="API Key" />
                   <Button size="xs" onClick={() => handleApiKeySubmit(apiKey)}>Save</Button>
                   <button onClick={() => setShowConfig(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={14}/></button>
                </div>
            ) : (
                <Button variant="ghost" size="icon_sm" onClick={() => setShowConfig(true)} title="Settings">
                   <Settings size={18} className="text-gray-400"/>
                </Button>
            )}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-grow overflow-hidden bg-gray-50">
        
        {/* === GENERATOR TAB === */}
        {activeTab === 'generate' && (
           <div className="h-full flex flex-col lg:flex-row">
              {/* Left: Inputs */}
              <div className="w-full lg:w-1/3 p-6 border-r border-gray-200 bg-white overflow-y-auto">
                 <div className="space-y-6">
                    <div>
                       <label className="block text-sm font-bold text-gray-700 mb-2">What do you need?</label>
                       <textarea 
                          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-h-[100px]"
                          placeholder="e.g. 'A trap involving mirrors', 'A stats block for a Giant Spider'"
                          value={prompt}
                          onChange={e => setPrompt(e.target.value)}
                       />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                       <button onClick={() => setShowContext(!showContext)} className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide hover:text-indigo-600 mb-3">
                          {showContext ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} Context Helpers
                       </button>
                       {showContext && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">Party</label><textarea rows={3} className="w-full p-2 border rounded text-xs" value={partyData} onChange={e => setPartyData(e.target.value)} placeholder="Characters..." /></div>
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">Location</label><textarea rows={2} className="w-full p-2 border rounded text-xs" value={locationData} onChange={e => setLocationData(e.target.value)} placeholder="Current place..." /></div>
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">NPCs</label><textarea rows={2} className="w-full p-2 border rounded text-xs" value={npcData} onChange={e => setNpcData(e.target.value)} placeholder="Nearby figures..." /></div>
                          </div>
                       )}
                    </div>

                    <Button onClick={generateStory} disabled={loading} className="w-full" icon={Sparkles} variant="primary">{loading ? 'Conjuring...' : 'Generate'}</Button>
                    {error && <div className="p-3 bg-red-50 text-red-600 text-xs rounded border border-red-100">{error}</div>}
                 </div>
              </div>

              {/* Right: Editor */}
              <div className="w-full lg:w-2/3 bg-gray-50 p-6 flex flex-col h-full overflow-hidden">
                 {editedResponse ? (
                    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                       <div className="flex-grow overflow-hidden" data-color-mode="light">
                          <MDEditor
                            value={editedResponse}
                            onChange={(val) => setEditedResponse(val || '')}
                            height="100%"
                            visibleDragbar={false}
                            preview="preview"
                            commands={customCommands}
                            previewOptions={{
                                style: { backgroundColor: 'transparent', padding: 0 },
                                wrapper: ({ children }) => <div className="phb p-6">{children}</div>, // Use .phb for Homebrewery styles
                                components: {
                                    markdown: (props) => <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]} {...props} />
                                }
                            }}
                            className="h-full border-none"
                          />
                       </div>
                       <div className="p-3 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                          <Button size="sm" variant="secondary" onClick={() => { setResponse(''); setEditedResponse(''); }}>Clear</Button>
                          <Button size="sm" variant="primary" icon={Save} onClick={handleSaveGenerated} loading={saveMutation.isPending}>Save to Library</Button>
                       </div>
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                       <Bot size={48} className="opacity-20 mb-4"/>
                       <p className="text-sm font-medium">AI output will appear here.</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {/* === SAVED TAB === */}
        {activeTab === 'saved' && (
           <div className="h-full flex flex-col lg:flex-row">
              <div className="w-full lg:w-1/3 border-r border-gray-200 bg-white flex flex-col h-full">
                 <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"/>
                       <input className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search library..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                 </div>
                 <div className="flex-grow overflow-y-auto p-3 space-y-2 bg-gray-50/50">
                    {isLoadingIdeas ? <div className="flex justify-center py-10"><LoadingSpinner/></div> : filteredIdeas?.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No saved ideas found.</div>
                    ) : (
                        filteredIdeas?.map((idea:any) => (
                            <SavedIdeaListItem key={idea.id} idea={idea} onClick={() => { setSelectedIdea(idea); setIsEditingSaved(false); }} isActive={selectedIdea?.id === idea.id} />
                        ))
                    )}
                 </div>
              </div>

              <div className="w-full lg:w-2/3 bg-gray-50 flex flex-col h-full overflow-hidden">
                 {selectedIdea ? (
                    <div className="flex-grow flex flex-col h-full">
                       <div className="bg-white border-b p-4 flex justify-between items-center shrink-0">
                          <div className="min-w-0 mr-4"><h3 className="font-bold text-gray-900 truncate">{selectedIdea.prompt}</h3><p className="text-xs text-gray-500">Created {new Date(selectedIdea.created_at).toLocaleString()}</p></div>
                          <div className="flex gap-2">
                             {isEditingSaved ? (
                                <><Button size="sm" variant="ghost" onClick={() => setIsEditingSaved(false)}>Cancel</Button><Button size="sm" variant="primary" icon={Save} onClick={() => { updateMutation.mutate({ ideaId: selectedIdea.id, updates: { response: editedContent } }); }} loading={updateMutation.isPending}>Save</Button></>
                             ) : (
                                <><Button size="sm" variant="secondary" icon={Edit} onClick={() => { setEditedContent(selectedIdea.response); setIsEditingSaved(true); }}>Edit</Button><Button size="sm" variant="danger_outline" icon={Trash2} onClick={() => deleteMutation.mutate(selectedIdea.id)} loading={deleteMutation.isPending}>Delete</Button></>
                             )}
                          </div>
                       </div>
                       <div className="flex-grow overflow-hidden bg-white p-0 h-full">
                          {isEditingSaved ? (
                             <MDEditor value={editedContent} onChange={(val) => setEditedContent(val || '')} height="100%" visibleDragbar={false} preview="edit" commands={customCommands} previewOptions={{ style: { backgroundColor: 'transparent', padding: 0 }, wrapper: ({ children }) => <div className="phb p-8">{children}</div>, components: { markdown: (props) => <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]} {...props} /> } }}/>
                          ) : (
                             <div className="h-full overflow-y-auto p-8">
                               <div className="phb">
                                 <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]}>
                                   {selectedIdea.response}
                                 </ReactMarkdown>
                               </div>
                             </div>
                          )}
                       </div>
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400"><FileText size={48} className="opacity-20 mb-4"/><p className="text-sm font-medium">Select an idea to view details.</p></div>
                 )}
              </div>
           </div>
        )}
      </div>
    </div>
  );
}
