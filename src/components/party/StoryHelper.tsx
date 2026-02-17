import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saveStoryIdea, getStoryIdeasForParty, deleteStoryIdea, updateStoryIdea } from '../../lib/api/storyIdeas';
import type { StoryIdea } from '../../lib/api/storyIdeas';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import {
  Trash2, Sparkles, BookOpen, Search, Edit, X, KeyRound,
  Settings, Wand2, ChevronRight, ChevronDown, Bot,
  Shield, StickyNote, Copy, Check, RefreshCw, Eraser,
  Users, Maximize2, Minimize2, Eye, EyeOff
} from 'lucide-react';

import MDEditor, { commands, ICommand } from '@uiw/react-md-editor';
import { HomebrewRenderer } from '../compendium/HomebrewRenderer';

// --- CONSTANTS ---
const QUICK_PROMPTS = [
  { label: 'Monster', icon: Shield, prompt: 'Create a new Dragonbane monster. Include stats for Ferocity, Size, Movement, Armor, HP, and a table of d6 Monster Attacks.' },
  { label: 'NPC', icon: Bot, prompt: 'Create an interesting NPC. Include their appearance, personality, motivation, and a stat block with Skills and Gear.' },
  { label: 'Spell', icon: Sparkles, prompt: 'Create a new magic spell. Include Rank, Prerequisite, Requirement, Casting Time, Range, Duration and Effect.' },
  { label: 'Loot', icon: KeyRound, prompt: 'Generate a treasure hoard containing coins, one magical item, and two interesting trinkets.' },
  { label: 'Encounter', icon: SwordIcon, prompt: 'Design a combat encounter for the party involving terrain hazards and enemy tactics.' },
];

function SwordIcon(props: React.SVGProps<SVGSVGElement>) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" y1="19" x2="19" y2="13" /><line x1="16" y1="16" x2="20" y2="20" /><line x1="19" y1="21" x2="21" y2="19" /></svg>; }

interface PartyCharacter {
  id: string;
  name: string;
  kin: string;
  profession: string;
  appearance?: string | null;
  weak_spot?: string | null;
  current_hp?: number | null;
  max_hp?: number | null;
  current_wp?: number | null;
  max_wp?: number | null;
}

interface PartyCharacterRow {
  character: PartyCharacter | null;
}

const monsterTemplate = `\`\`\`monster
### Monster Name
*Size type (tag)*
___
| Ferocity | Movement | Armor | HP |
|:---:|:---:|:---:|:---:|
| 1 | 12 | 2 | 24 |

**Skills:** Awareness 14, Healing 10
___
**Abilities:**
* **Trait Name:** Description.

#### Monster Attacks
| d6 | Attack |
|:---|:---|
| 1 | **Slash:** 2D8 slashing damage. |
| 2 | **Bite:** 3D6 piercing damage. |
\`\`\``;

const noteTemplate = `\`\`\`note
#### GM Note
Use this block for specific rules or secrets.
\`\`\``;

const spellTemplate = `\`\`\`spell
### Spell Name
*Rank 1 School*
___
* **Requirement:** Word, Gesture
* **Casting Time:** Action
* **Range:** 10 meters
* **Duration:** Instant
___
**Effect:** Description here.
\`\`\``;

const npcTemplate = `\`\`\`npc
### NPC Name
*Kin Profession*
___
**Appearance:** Description of appearance.
**Personality:** Key personality traits.
**Motivation:** What dictates their actions?
___
| STR | CON | AGL | INT | WIL | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 13 | 11 | 14 | 12 | 10 | 15 |
___
**Movement:** 12 **HP:** 11 **WP:** 10
**Armor:** Leather (1)
**Skills:** Awareness 14, Persuasion 12
**Weapons:** Dagger (skill 12, damage D8)
\`\`\``;

const itemTemplate = `\`\`\`item
### Item Name
*Rarity Type*
___
**Cost:** 50 Gold
**Weight:** 1
___
**Effect:** Description of the magical effect.
\`\`\``;

const DRAGONBANE_RULES_SUMMARY = `
SYSTEM RULES (DRAGONBANE):
- Core Mechanic: Roll D20 under Skill. 1 = Dragon (Crit), 20 = Demon (Fumble).
- Attributes: STR, CON, AGL, INT, WIL, CHA.
- Kin: Human, Halfling, Dwarf, Elf, Mallard, Wolfkin.
- Combat: Rounds (10s). Initiative cards 1-10. Actions: Attack, Parry, Dodge, Dash, etc.
- Monsters: Do NOT roll to hit. Attacks hit automatically; players must Dodge/Parry. Monsters use a d6 Attack Table. Stats: Ferocity (actions/round), Size, Movement, Armor, HP.
- Magic: Costs Willpower Points (WP). Schools: Animism, Elementalism, Mentalism. Spells have Ranks.
- Conditions: Exhausted (STR), Sickly (CON), Dazed (AGL), Angry (INT), Scared (WIL), Disheartened (CHA).
`;

// --- CUSTOM COMMANDS ---
const createCommand = (name: string, icon: React.ReactNode, template: string): ICommand => ({
  name,
  keyCommand: name,
  buttonProps: { 'aria-label': `Insert ${name}`, title: `Insert ${name}` },
  icon,
  execute: (state, api) => api.replaceSelection(template)
});

const customCommands = [
  commands.bold, commands.italic, commands.title, commands.divider,
  commands.quote, commands.table, commands.hr,
  commands.divider,
  createCommand('monsterBlock', <Shield size={12} />, monsterTemplate),
  createCommand('npcBlock', <Bot size={12} />, npcTemplate),
  createCommand('spellBlock', <BookOpen size={12} />, spellTemplate),
  createCommand('itemBlock', <KeyRound size={12} />, itemTemplate),
  createCommand('noteBlock', <StickyNote size={12} />, noteTemplate),
  commands.divider,
  commands.fullscreen
];

// --- MAIN COMPONENT ---

export function StoryHelperApp({ partyId }: { partyId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const resultRef = useRef<HTMLDivElement>(null);

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Generator State
  const [prompt, setPrompt] = useState('');
  const [contextLocation, setContextLocation] = useState('');
  const [contextNpc, setContextNpc] = useState('');
  const [showContext, setShowContext] = useState(true);

  // Character Context State
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [includeCharDesc, setIncludeCharDesc] = useState(true);
  const [includeCharStats, setIncludeCharStats] = useState(false);

  // Content State
  const [response, setResponse] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // API State
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [loading, setLoading] = useState(false);

  // Library State
  const [selectedIdea, setSelectedIdea] = useState<StoryIdea | null>(null);
  const [isEditingLibrary, setIsEditingLibrary] = useState(false);

  // -- DATA FETCHING --
  const { data: partyCharacters = [] } = useQuery({
    queryKey: ['partyCharactersDetail', partyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('party_members')
        .select(`
          character:characters (
            id, name, kin, profession, appearance, weak_spot, 
            current_hp, max_hp, current_wp, max_wp
          )
        `)
        .eq('party_id', partyId);

      if (error) throw error;
      const rows = (data ?? []) as unknown as PartyCharacterRow[];
      return rows
        .map((row) => row.character)
        .filter((character): character is PartyCharacter => Boolean(character));
    },
    enabled: !!partyId
  });

  useEffect(() => {
    if (partyCharacters.length > 0 && selectedCharIds.size === 0) {
      setSelectedCharIds(new Set(partyCharacters.map((c) => c.id)));
    }
  }, [partyCharacters.length]);

  const { data: savedIdeas, isLoading: isLoadingIdeas } = useQuery({
    queryKey: ['storyIdeas', partyId],
    queryFn: () => getStoryIdeasForParty(partyId),
    enabled: !!user,
  });

  // -- EFFECTS --
  useEffect(() => {
    if (response) {
      setEditorContent(response);
      if (window.innerWidth < 1024) {
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, [response]);

  // -- MUTATIONS --
  const saveMutation = useMutation({
    mutationFn: saveStoryIdea,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      setActiveTab('saved');
      if (data?.[0]) setSelectedIdea(data[0]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStoryIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      setSelectedIdea(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ ideaId, updates }: { ideaId: string; updates: { response: string } }) => updateStoryIdea(ideaId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storyIdeas', partyId] });
      setIsEditingLibrary(false);
    }
  });

  // -- LOGIC --
  const toggleCharSelection = (id: string) => {
    const next = new Set(selectedCharIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCharIds(next);
  };

  const buildCharacterContextString = () => {
    const selectedChars = partyCharacters.filter((c) => selectedCharIds.has(c.id));
    if (selectedChars.length === 0) return "No specific party members.";

    return selectedChars.map((c) => {
      let details = `- ${c.name} (${c.kin} ${c.profession})`;
      if (includeCharDesc) {
        if (c.appearance) details += `. Appearance: ${c.appearance}`;
        if (c.weak_spot) details += `. Weakness: ${c.weak_spot}`;
      }
      if (includeCharStats) {
        details += ` [HP: ${c.current_hp}/${c.max_hp}, WP: ${c.current_wp}/${c.max_wp}]`;
      }
      return details;
    }).join('\n');
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey) return;
    setLoading(true);

    if (window.innerWidth < 768) setIsMaximized(true);

    try {
      const partyContextString = buildCharacterContextString();

      const fullPrompt = `
        You are a helpful Dragonbane RPG Gamemaster assistant. Generate content using Markdown.
        ${DRAGONBANE_RULES_SUMMARY}
        
        CRITICAL FORMATTING:
        - Use **bold** for mechanics (e.g., **Skill 14**).
        - Use code blocks for specific content types:
          - \`\`\`npc (Must follow: ### Name \\n *Kin Profession* \\n ___ \\n Attrib Table)
          - \`\`\`monster (Must follow: ### Name \\n *Type* \\n ___ \\n Stat Table)
          - \`\`\`spell (Must follow: ### Name \\n *Rank School* \\n ___)
          - \`\`\`item (Must follow: ### Name \\n *Rarity Type* \\n ___)
          - \`\`\`note (For invisible GM notes)
        
        TASK: ${prompt}
        
        CONTEXT:
        Party Members:
        ${partyContextString}
        
        ${contextLocation ? `Location/Scene: ${contextLocation}` : ''}
        ${contextNpc ? `Involved NPCs: ${contextNpc}` : ''}
      `;

      // 1. Connection Fix (Headers & Model)
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href, // Required by OpenRouter
          'X-Title': 'Dragonbane Manager'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001', // Using 2.0 Flash (Stable & Fast)
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || `API Error: ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || 'No response.';
      setResponse(content);
    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setResponse(`Error: ${errorMessage}. Please check your API key.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = () => {
    localStorage.setItem('openrouter_api_key', tempApiKey);
    setApiKey(tempApiKey);
    setShowConfig(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editorContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const filteredIdeas = savedIdeas?.filter((idea) => idea.prompt.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-100px)]">

      {/* --- HEADER --- */}
      <div className={`bg-white border-b border-gray-200 px-4 h-14 shrink-0 flex items-center justify-between relative z-20 ${isMaximized ? 'hidden' : 'flex'}`}>
        <div className="flex gap-1">
          <button onClick={() => setActiveTab('generate')} className={`text-sm font-bold flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'generate' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Wand2 size={16} /> Generator
          </button>
          <button onClick={() => setActiveTab('saved')} className={`text-sm font-bold flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'saved' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:bg-gray-50'}`}>
            <BookOpen size={16} /> Library
          </button>
        </div>
        <Button variant={apiKey ? 'ghost' : 'outline'} size="sm" onClick={() => setShowConfig(!showConfig)} className={!apiKey ? "border-orange-300 text-orange-600 bg-orange-50" : ""}>
          <Settings size={16} className={!apiKey ? "animate-pulse" : ""} />
          {!apiKey && <span className="ml-2">Set API Key</span>}
        </Button>
      </div>

      {/* --- CONFIG SLIDE-DOWN (FIXED HEIGHT & LAYOUT) --- */}
      <div className={`bg-gray-50 border-b border-gray-200 overflow-hidden transition-all duration-300 ease-in-out ${showConfig && !isMaximized ? 'max-h-96 py-4 px-4' : 'max-h-0'}`}>
        {/* Fix: Changed to flex-col on mobile to prevent squashing */}
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 w-full">
            <label htmlFor="story-helper-api-key" className="block text-xs font-bold text-gray-500 uppercase mb-1">OpenRouter API Key</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                id="story-helper-api-key"
                type="password"
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="sk-or-..."
              />
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button className="flex-1 sm:flex-none" variant="primary" onClick={handleSaveKey}>Save Key</Button>
            <Button className="flex-1 sm:flex-none" variant="ghost" onClick={() => setShowConfig(false)}>Cancel</Button>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Keys are stored locally in your browser. Get one at <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="underline hover:text-indigo-600">openrouter.ai</a>
        </p>
      </div>

      <div className="flex-grow overflow-hidden flex flex-col md:flex-row bg-gray-50">

        {/* === LEFT PANE: INPUTS === */}
        {activeTab === 'generate' && !isMaximized && (
          <div className="w-full md:w-1/3 border-r border-gray-200 bg-white flex flex-col z-10 shadow-lg md:shadow-none h-1/2 md:h-full">

            {!apiKey ? (
              <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-gray-500">
                <KeyRound size={40} className="mb-4 text-orange-300" />
                <p className="text-sm font-medium">API Key Required</p>
                <p className="text-xs mt-1 max-w-[200px]">Please configure your OpenRouter API key in the settings above to start generating.</p>
              </div>
            ) : (
              <>
                <div className="p-4 overflow-y-auto flex-grow space-y-5 custom-scrollbar">

                  {/* Prompt Box */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="story-helper-prompt" className="text-xs font-bold text-gray-500 uppercase">Prompt</label>
                      {prompt && <button onClick={() => setPrompt('')} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1"><Eraser size={10} /> Clear</button>}
                    </div>
                    <textarea
                      id="story-helper-prompt"
                      className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none shadow-sm transition-shadow focus:shadow-md"
                      rows={4}
                      placeholder="Describe what you need..."
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                    />

                    {/* Quick Prompts */}
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Quick Start</p>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_PROMPTS.map(p => (
                          <button
                            key={p.label}
                            onClick={() => setPrompt(p.prompt)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 text-xs font-medium text-gray-600 hover:text-indigo-600 rounded-md transition-all active:scale-95"
                            title={p.prompt}
                          >
                            <p.icon size={12} />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Enhanced Context Accordion */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowContext(!showContext)}
                      className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-bold text-gray-500 uppercase"
                    >
                      <span>Context Helpers</span>
                      {showContext ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {showContext && (
                      <div className="p-3 space-y-4 bg-white animate-in slide-in-from-top-1">

                        {/* 1. Character Selector */}
                        <div>
                          <p className="block text-[10px] font-bold text-gray-400 uppercase mb-2 flex items-center gap-1"><Users size={10} /> Party Members</p>
                          {partyCharacters.length === 0 ? (
                            <div className="text-xs text-gray-400 italic">No characters found in party.</div>
                          ) : (
                            <div className="space-y-2">
                              <div className="max-h-24 overflow-y-auto border rounded p-1 space-y-1 bg-gray-50">
                                {partyCharacters.map((c) => (
                                  <label key={c.id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedCharIds.has(c.id)}
                                      onChange={() => toggleCharSelection(c.id)}
                                      className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs text-gray-700 truncate">{c.name}</span>
                                  </label>
                                ))}
                              </div>
                              {/* Data Toggles */}
                              <div className="flex gap-2">
                                <button onClick={() => setIncludeCharDesc(!includeCharDesc)} className={`flex-1 text-[10px] py-1 border rounded flex items-center justify-center gap-1 transition-colors ${includeCharDesc ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-400'}`}>
                                  {includeCharDesc ? <Eye size={10} /> : <EyeOff size={10} />} Desc/Weakness
                                </button>
                                <button onClick={() => setIncludeCharStats(!includeCharStats)} className={`flex-1 text-[10px] py-1 border rounded flex items-center justify-center gap-1 transition-colors ${includeCharStats ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-400'}`}>
                                  {includeCharStats ? <Eye size={10} /> : <EyeOff size={10} />} Stats (HP/WP)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full h-px bg-gray-100"></div>

                        {/* 2. Text Inputs */}
                        <div>
                          <label htmlFor="story-helper-location" className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Location / Setting</label>
                          <input
                            id="story-helper-location"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={contextLocation}
                            onChange={e => setContextLocation(e.target.value)}
                            placeholder="e.g. A haunted crypt, Dark forest..."
                          />
                        </div>
                        <div>
                          <label htmlFor="story-helper-npcs" className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Involved NPCs</label>
                          <input
                            id="story-helper-npcs"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={contextNpc}
                            onChange={e => setContextNpc(e.target.value)}
                            placeholder="e.g. The mayor, A nervous goblin..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                  <Button onClick={handleGenerate} disabled={loading} className="w-full justify-center shadow-sm" icon={loading ? RefreshCw : Sparkles} variant="primary" loading={loading}>
                    {loading ? 'Conjuring...' : 'Generate (Gemini 2.0)'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* === LEFT PANE: LIBRARY LIST === */}
        {activeTab === 'saved' && !isMaximized && (
          <div className="w-full md:w-1/3 border-r border-gray-200 bg-white flex flex-col h-1/2 md:h-full z-10">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  className="w-full pl-8 pr-8 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                  placeholder="Search library..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
              </div>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              {isLoadingIdeas ? <div className="flex justify-center py-8"><LoadingSpinner size="sm" /></div> : filteredIdeas.length === 0 ? <div className="p-8 text-center"><BookOpen size={32} className="mx-auto text-gray-200 mb-2" /><p className="text-gray-400 text-xs">No saved items found.</p></div> : (
                <div className="divide-y divide-gray-50">
                  {filteredIdeas.map((idea) => (
                    <button key={idea.id} onClick={() => { setSelectedIdea(idea); setIsEditingLibrary(false); }} className={`w-full text-left p-3 hover:bg-gray-50 transition-all ${selectedIdea?.id === idea.id ? 'bg-indigo-50 border-l-4 border-indigo-500 pl-2' : 'border-l-4 border-transparent pl-3'}`}>
                      <div className={`font-bold text-sm truncate mb-0.5 ${selectedIdea?.id === idea.id ? 'text-indigo-700' : 'text-gray-700'}`}>{idea.prompt}</div>
                      <div className="text-[10px] text-gray-400 flex justify-between items-center"><span>{new Date(idea.created_at).toLocaleDateString()}</span><span className="bg-gray-100 px-1.5 py-0.5 rounded-full">{idea.response.length} chars</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === RIGHT PANE: EDITOR === */}
        <div className={`flex flex-col h-1/2 md:h-full overflow-hidden relative border-t md:border-t-0 md:border-l border-gray-200 transition-all duration-300 ${isMaximized ? 'w-full' : 'w-full md:w-2/3'}`} ref={resultRef}>

          {(activeTab === 'generate' ? editorContent : selectedIdea) ? (
            <>
              {/* Toolbar */}
              <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${activeTab === 'generate' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {activeTab === 'generate' ? 'Preview' : (isEditingLibrary ? 'Editing' : 'Saved')}
                  </span>

                  {/* MAXIMIZE TOGGLE */}
                  <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 ml-1"
                    title={isMaximized ? "Show Prompt" : "Hide Prompt"}
                  >
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'generate' && (
                    <>
                      <button onClick={copyToClipboard} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all ${isCopied ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100 text-gray-600'}`}>{isCopied ? <Check size={14} /> : <Copy size={14} />}<span className="hidden sm:inline">{isCopied ? 'Copied' : 'Copy'}</span></button>
                      <div className="w-px h-4 bg-gray-200 mx-1" />
                      <Button size="sm" variant="primary" onClick={() => saveMutation.mutate({ party_id: partyId, user_id: user?.id || '', prompt: prompt || 'Generated Content', response: editorContent, context: { party: partyId, location: contextLocation, npc: contextNpc } })} loading={saveMutation.isPending}>Save to Library</Button>
                    </>
                  )}

                  {activeTab === 'saved' && selectedIdea && (
                    !isEditingLibrary ? (
                      <>
                        <button onClick={() => setIsEditingLibrary(true)} className="p-1.5 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 rounded transition-colors" title="Edit"><Edit size={16} /></button>
                        <button onClick={() => deleteMutation.mutate(selectedIdea.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setIsEditingLibrary(false)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Cancel"><X size={16} /></button>
                        <Button size="sm" variant="primary" onClick={() => updateMutation.mutate({ ideaId: selectedIdea.id, updates: { response: editorContent } })} loading={updateMutation.isPending}>Save Changes</Button>
                      </>
                    )
                  )}
                </div>
              </div>

              {/* Editor / Viewer */}
              <div className="flex-grow overflow-hidden relative group" data-color-mode="light">

                {activeTab === 'generate' || isEditingLibrary ? (
                  <MDEditor
                    value={activeTab === 'generate' ? editorContent : (isEditingLibrary ? selectedIdea.response : '')}
                    onChange={(val) => {
                      if (activeTab === 'generate') setEditorContent(val || '');
                      else setSelectedIdea({ ...selectedIdea, response: val || '' });
                    }}
                    height="100%"
                    visibleDragbar={false}
                    preview="live"
                    commands={customCommands}
                    className="h-full border-none"
                    textareaProps={{ placeholder: "Content will appear here..." }}
                    previewOptions={{
                      components: {
                        div: ({ children, className }) => {
                          if (className?.includes('markdown-body')) return <div className="h-full overflow-y-auto bg-gray-50 p-6 custom-scrollbar">{children}</div>;
                          return <div className={className}>{children}</div>;
                        },
                        code: (props: React.ComponentPropsWithoutRef<'code'>) => <code {...props} />
                      }
                    }}
                    renderPreview={(markdownContent) => <div className="h-full overflow-y-auto bg-gray-50 p-6 custom-scrollbar"><HomebrewRenderer content={markdownContent} /></div>}
                  />
                ) : (
                  <div className="h-full overflow-y-auto bg-gray-50 p-6 custom-scrollbar">
                    <HomebrewRenderer content={selectedIdea.response} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50/50">
              <Bot size={64} className="mb-4 opacity-20" />
              <p className="text-sm font-medium text-gray-400">
                {activeTab === 'generate' ? 'Ready to conjure.' : 'Select an idea to view.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
