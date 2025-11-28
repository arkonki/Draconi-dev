import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Character, AttributeName } from '../../types/character';
import { calculateMovement } from '../../lib/movement';
import {
  Shield, Heart, HelpCircle, Swords, Brain, Zap, Users, Moon, Sun, Clock, Skull, Package, Book, GraduationCap, Star, Sparkles, X, Bed, Award, ShieldCheck, HeartPulse, UserCog, Dumbbell, Feather, UserSquare, StickyNote, Plus, Save, Trash2, Minus,
  Bold, Italic, List, ListOrdered, Heading1, Link as LinkIcon, Table as TableIcon, Eye, EyeOff, Quote, Code, Pencil, Calendar
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';
import { SkillsModal } from './modals/SkillsModal';
import { SpellcastingView } from './SpellcastingView';
import { InventoryModal } from './InventoryModal';
import { EquipmentSection } from './EquipmentSection';
import { HeroicAbilitiesView } from './HeroicAbilitiesView';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { AdvancementSystem } from './AdvancementSystem';
import { DeathRollTracker } from './DeathRollTracker';
import { StatusPanelView } from './StatusPanelView';
import { BioModal } from './modals/BioModal';
import { PlayerAidModal } from './modals/PlayerAidModal';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

// --- Helper for Toolbar Buttons ---
function ToolbarButton({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      type="button"
      onClick={onClick} 
      title={label}
      className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded transition-all"
    >
      <Icon size={16} />
    </button>
  );
}

// --- UPDATED CHARACTER NOTES SECTION ---
interface CharacterNote { id: string; title: string; content: string; created_at: string; updated_at?: string; }

const CharacterNotesSection = ({ character }: { character: Character }) => {
  const [notes, setNotes] = useState<CharacterNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interaction State
  const [activeNote, setActiveNote] = useState<Partial<CharacterNote> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Editor State
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadNotes = useCallback(async () => { 
    setLoading(true); 
    setError(null); 
    try { 
      const { data, error: fetchError } = await supabase.from('notes').select('id, title, content, created_at, updated_at').eq('character_id', character.id).order('created_at', { ascending: false }); 
      if (fetchError) throw fetchError; 
      setNotes(data || []); 
    } catch (err) { 
      setError(err instanceof Error ? err.message : "Failed to load notes."); 
    } finally { 
      setLoading(false); 
    } 
  }, [character.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Editor Helpers
  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !activeNote) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value; // Use textarea value directly
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);

    const newText = before + prefix + selection + suffix + after;
    
    setActiveNote(prev => prev ? ({ ...prev, content: newText }) : null);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selection.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleInsertTable = () => {
    const tableTemplate = `\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
    insertMarkdown(tableTemplate);
  };

  const handleSaveNote = async () => { 
    if (!activeNote?.title?.trim()) { alert("Title is required."); return; } 
    
    const noteData = { ...activeNote, character_id: character.id, user_id: character.user_id, updated_at: new Date().toISOString(), }; 
    try { 
      const { id, created_at, ...upsertData } = noteData; 
      const { data, error: saveError } = await supabase.from('notes').upsert(upsertData, { onConflict: 'id' }).select().single(); 
      if (saveError) throw saveError; 
      
      // Update local state to reflect saved data
      setActiveNote(data);
      setIsEditing(false); 
      setShowPreview(false);
      await loadNotes(); 
    } catch (err) { 
      console.error("Error saving note:", err); 
      alert(err instanceof Error ? `Failed to save note: ${err.message}` : 'An unknown error occurred.'); 
    } 
  };

  const handleDeleteNote = async (noteId: string) => { 
    if (!window.confirm("Are you sure you want to delete this note?")) return; 
    try { 
      const { error: deleteError } = await supabase.from('notes').delete().eq('id', noteId); 
      if (deleteError) throw deleteError; 
      
      if (activeNote?.id === noteId) {
        setActiveNote(null);
        setIsEditing(false);
      }
      await loadNotes(); 
    } catch (err) { 
      alert(err instanceof Error ? `Failed to delete note: ${err.message}` : 'An unknown error occurred.'); 
    } 
  };

  const handleNoteClick = (note: CharacterNote) => {
    setActiveNote(note);
    setIsEditing(false); // Open in view mode
  };

  const openNewNoteForm = () => { 
    setActiveNote({ title: '', content: '' }); 
    setIsEditing(true); // Open directly in edit mode
    setShowPreview(false);
  };

  if (loading) return <div className="p-4"><LoadingSpinner size="sm" /></div>;
  if (error) return <div className="p-4"><ErrorMessage message={error} /></div>;

  return (
    <div className="bg-white p-4 rounded-lg border">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-gray-700"><StickyNote className="w-5 h-5 text-yellow-600" /> Character Notes</h3>
        <Button size="xs" icon={Plus} onClick={openNewNoteForm}>New Note</Button>
      </div>
      
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500 italic text-center py-4">No notes for this character yet.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="p-3 rounded-md border border-gray-100 hover:bg-gray-50 flex justify-between items-center transition-colors group">
              <div 
                className="flex-grow cursor-pointer"
                onClick={() => handleNoteClick(note)}
              >
                <div className="text-sm font-bold text-gray-800 group-hover:text-blue-600">
                  {note.title}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date(note.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                 <Button variant="ghost" size="xs" icon={Eye} onClick={() => handleNoteClick(note)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="View Note"/>
                 <Button variant="danger_outline" size="xs" icon={Trash2} onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} />
              </div>
            </div>
          ))
        )}
      </div>

      {activeNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-0 shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-yellow-600" />
                {isEditing ? (activeNote.id ? 'Edit Note' : 'New Note') : 'View Note'}
              </h4>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Button>
                )}
                <button onClick={() => setActiveNote(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-500 hover:text-gray-800" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="overflow-y-auto flex-grow p-6">
              
              {/* VIEW MODE */}
              {!isEditing && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 border-b pb-2 mb-4">{activeNote.title}</h2>
                    <div className="prose prose-sm max-w-none prose-blue">
                      <MarkdownRenderer content={activeNote.content || '*No content provided.*'} />
                    </div>
                  </div>
                  {activeNote.updated_at && (
                    <div className="text-xs text-gray-400 pt-8 border-t mt-4 text-right">
                      Last updated: {new Date(activeNote.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* EDIT MODE */}
              {isEditing && (
                <div className="space-y-4 h-full flex flex-col">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                    <input 
                      type="text" 
                      placeholder="Note Title" 
                      value={activeNote.title || ''} 
                      onChange={e => setActiveNote(prev => prev ? ({ ...prev, title: e.target.value }) : null)} 
                      className="w-full font-bold text-lg p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                      autoFocus={!activeNote.id}
                    />
                  </div>

                  <div className="flex-grow flex flex-col">
                    <div className="flex justify-between items-end mb-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase">Content</label>
                      <button 
                        type="button"
                        onClick={() => setShowPreview(!showPreview)} 
                        className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {showPreview ? <><EyeOff size={14}/> Continue Editing</> : <><Eye size={14}/> Preview Markdown</>}
                      </button>
                    </div>

                    <div className="flex-grow flex flex-col border rounded-lg overflow-hidden border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all min-h-[300px]">
                      {!showPreview && (
                        <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto shrink-0">
                           <ToolbarButton icon={Bold} label="Bold" onClick={() => insertMarkdown('**', '**')} />
                           <ToolbarButton icon={Italic} label="Italic" onClick={() => insertMarkdown('*', '*')} />
                           <div className="w-px h-4 bg-gray-300 mx-1"></div>
                           <ToolbarButton icon={Heading1} label="Heading" onClick={() => insertMarkdown('# ', '')} />
                           <ToolbarButton icon={Quote} label="Quote" onClick={() => insertMarkdown('> ', '')} />
                           <ToolbarButton icon={Code} label="Code Block" onClick={() => insertMarkdown('```\n', '\n```')} />
                           <div className="w-px h-4 bg-gray-300 mx-1"></div>
                           <ToolbarButton icon={List} label="Bullet List" onClick={() => insertMarkdown('- ', '')} />
                           <ToolbarButton icon={ListOrdered} label="Numbered List" onClick={() => insertMarkdown('1. ', '')} />
                           <div className="w-px h-4 bg-gray-300 mx-1"></div>
                           <ToolbarButton icon={LinkIcon} label="Link" onClick={() => insertMarkdown('[', '](url)')} />
                           <ToolbarButton icon={TableIcon} label="Table" onClick={handleInsertTable} />
                        </div>
                      )}

                      {showPreview ? (
                        <div className="p-4 flex-grow overflow-y-auto prose prose-sm max-w-none bg-gray-50/50">
                           <MarkdownRenderer content={activeNote.content || '*No content*'} />
                        </div>
                      ) : (
                        <textarea 
                          ref={textareaRef}
                          placeholder="Write your note here using Markdown..." 
                          value={activeNote.content || ''} 
                          onChange={e => setActiveNote(prev => prev ? ({...prev, content: e.target.value}) : null)} 
                          className="w-full p-4 flex-grow font-mono text-sm outline-none resize-none bg-white" 
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (Edit Mode Only) */}
            {isEditing && (
              <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
                <Button variant="ghost" onClick={() => {
                  if (!activeNote.id) {
                    setActiveNote(null); // Close if new
                  } else {
                    setIsEditing(false); // Go back to view if existing
                  }
                }}>Cancel</Button>
                <Button variant="primary" icon={Save} onClick={handleSaveNote}>Save Note</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- StatBar helper component ---
const StatBar = ({ label, icon: Icon, currentValue, maxValue, onDecrement, onIncrement, isSaving, colorClass }: {
  label: string;
  icon: React.ElementType;
  currentValue: number;
  maxValue: number;
  onDecrement: () => void;
  onIncrement: () => void;
  isSaving: boolean;
  colorClass: string;
}) => {
  const percentage = maxValue > 0 ? (currentValue / maxValue) * 100 : 0;
  return (
    <div className="p-3 rounded-lg shadow bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold flex items-center gap-1.5 text-sm">
          <Icon className={`w-4 h-4 ${label === 'HP' ? 'text-red-600' : 'text-blue-600'}`} /> {label}
        </h3>
        <span className="text-sm font-medium">{currentValue} / {maxValue}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onDecrement} className="p-1 text-xs bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 disabled:opacity-50" disabled={isSaving || currentValue <= 0} title={`Decrease ${label}`}><Minus className="w-3 h-3" /></button>
        <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${colorClass} h-2.5 rounded-full transition-all`} style={{ width: `${percentage}%` }}></div></div>
        <button onClick={onIncrement} className="p-1 text-xs bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 disabled:opacity-50" disabled={isSaving || currentValue >= maxValue} title={`Increase ${label}`}><Plus className="w-3 h-3" /></button>
      </div>
    </div>
  );
};

interface CharacterSheetProps {}

export function CharacterSheet({}: CharacterSheetProps) {
  const navigate = useNavigate();
  const { toggleDiceRoller } = useDice();
  const { character, fetchCharacter, adjustStat, toggleCondition, performRest, isLoading, error, isSaving, saveError } = useCharacterSheetStore();
  const [showSpellcastingModal, setShowSpellcastingModal] = useState(false);
  const [showRestOptionsModal, setShowRestOptionsModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showAdvancementSystem, setShowAdvancementSystem] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [showPlayerAidModal, setShowPlayerAidModal] = useState(false);
  const [healerPresent, setHealerPresent] = useState(false);
  const [activeCombatTab, setActiveCombatTab] = useState<'equipment' | 'abilities' | 'notes'>('equipment');

  if (isLoading) return <div className="p-4 text-center">Loading character...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error loading character: {error}</div>;
  if (!character) return <div className="p-4 text-center">Character data not available.</div>;

  const handleConditionToggle = (condition: keyof Character['conditions']) => { toggleCondition(condition); };
  const handleRest = async (type: 'round' | 'stretch' | 'shift') => { setShowRestOptionsModal(false); await performRest(type, type === 'stretch' ? healerPresent : undefined); setHealerPresent(false); };

  const renderAttribute = (name: AttributeName, value: number | undefined, icon: React.ReactNode, conditionKey: keyof Character['conditions']) => {
    const displayValue = value ?? 10;
    const conditionActive = character.conditions?.[conditionKey] ?? false;
    return (
      <div className="relative">
        <div className="p-4 bg-gray-800 rounded-lg text-white">
          <div className="flex items-center justify-between mb-2"><span className="font-medium">{name}</span><span className="text-xl">{displayValue}</span></div>
          <div className="text-sm h-5">{(name === 'STR' || name === 'AGL') && displayValue > 12 && (<div className="text-blue-400">Damage Bonus: {displayValue <= 15 ? '+D4' : '+D6'}</div>)}</div>
        </div>
        <button onClick={() => handleConditionToggle(conditionKey)} className={`absolute -bottom-3 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${conditionActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} ${isSaving ? 'opacity-50' : ''}`} disabled={isSaving} title={`Toggle ${conditionKey}`}>{conditionKey.toUpperCase().substring(0, 3)}</button>
      </div>
    );
  };
  
  const renderRestOptionsModal = () => { if (!showRestOptionsModal) return null; return ( <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-xl"><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold flex items-center gap-2"><Bed className="w-6 h-6" /> Choose Rest Type</h3><button onClick={() => { setShowRestOptionsModal(false); setHealerPresent(false); }} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button></div><div className="space-y-4 mb-6"><div><button onClick={() => handleRest('shift')} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50" disabled={isSaving}>{isSaving ? 'Resting...' : 'Take Shift Rest'}</button><p className="text-sm text-gray-600 mt-2"><strong>Shift Rest (~6 hours):</strong> Requires a safe location. Recovers all HP & WP, heals all standard conditions.</p></div><div><button onClick={() => handleRest('stretch')} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50" disabled={isSaving || (character?.current_hp ?? 0) <= 0}>{isSaving ? 'Resting...' : `Take Stretch Rest`}</button><p className="text-sm text-gray-600 mt-2"><strong>Stretch Rest (~15 mins):</strong> Heal {healerPresent ? '2d6' : '1d6'} HP, recover 1d6 WP, heal one condition. Cannot be taken while dying.</p></div><div className="mb-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={healerPresent} onChange={(e) => setHealerPresent(e.target.checked)} className="rounded border-gray-300" /><span>Healer present for Stretch Rest</span></label></div><div><button onClick={() => handleRest('round')} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50" disabled={isSaving}>{isSaving ? 'Resting...' : 'Take Round Rest'}</button><p className="text-sm text-gray-600 mt-2"><strong>Round Rest (~10 secs):</strong> Recover 1d6 WP. No HP recovery.</p></div></div>{isSaving && <div className="mt-4 text-sm text-center text-gray-500">Saving...</div>}{saveError && <div className="mt-4 text-sm text-center text-red-500">Error: {saveError}</div>}</div></div> ); };
  const canCastSpells = () => { const skills = Object.keys(character?.skill_levels || {}); return character?.profession?.endsWith('Mage') || skills.some(s => ['ELEMENTALISM', 'ANIMISM', 'MENTALISM'].includes(s.toUpperCase())); };

  const currentHP = character?.current_hp ?? 0;
  const currentWP = character?.current_wp ?? 0;
  const maxHP = character?.max_hp ?? 10;
  const maxWP = character?.max_wp ?? 10;

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div><h1 className="text-3xl font-bold">{character.name}</h1><p className="text-gray-600 text-lg">{character.kin} {character.profession} - Age: {character.age}</p></div>
        <div className="flex items-center flex-wrap gap-2"><button onClick={() => setShowBioModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"><UserSquare className="w-4 h-4" /> Bio</button><button onClick={() => setShowInventoryModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"><Package className="w-4 h-4" /> Inventory</button><button onClick={() => setShowRestOptionsModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"><Bed className="w-4 h-4" /> Rest</button><button onClick={() => setShowAdvancementSystem(true)} className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 text-sm"><Award className="w-4 h-4" /> Session</button><button onClick={() => setShowPlayerAidModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"><HelpCircle className="w-4 h-4" /> Actions</button></div>
      </div>

      <StatusPanelView />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-6">
        {renderAttribute('STR', character.attributes?.STR, <Dumbbell />, 'exhausted')}
        {renderAttribute('CON', character.attributes?.CON, <Heart />, 'sickly')}
        {renderAttribute('AGL', character.attributes?.AGL, <Feather />, 'dazed')}
        {renderAttribute('INT', character.attributes?.INT, <Brain />, 'angry')}
        {renderAttribute('WIL', character.attributes?.WIL, <Zap />, 'scared')}
        {renderAttribute('CHA', character.attributes?.CHA, <UserCog />, 'disheartened')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="md:col-span-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowSkillsModal(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"><Book className="w-4 h-4" /> Skills</button>
            {canCastSpells() && ( <button onClick={() => setShowSpellcastingModal(true)} className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"><Sparkles className="w-4 h-4" /> Spells</button> )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm self-start"><span className="font-medium">Movement:</span><span className="font-bold text-lg">{calculateMovement(character.kin, character.attributes?.AGL)}m</span></div>
        </div>
        
        <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentHP > 0 ? (
            <StatBar label="HP" icon={HeartPulse} currentValue={currentHP} maxValue={maxHP} onDecrement={() => adjustStat('current_hp', -1)} onIncrement={() => adjustStat('current_hp', 1)} isSaving={isSaving} colorClass="bg-red-500" />
          ) : (
            <DeathRollTracker character={character} />
          )}
          <StatBar label="WP" icon={Zap} currentValue={currentWP} maxValue={maxWP} onDecrement={() => adjustStat('current_wp', -1)} onIncrement={() => adjustStat('current_wp', 1)} isSaving={isSaving} colorClass="bg-blue-500" />
        </div>
      </div>
      
      <div>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button onClick={() => setActiveCombatTab('equipment')} className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeCombatTab === 'equipment' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Shield className="w-5 h-5" /> Equipment</button>
            <button onClick={() => setActiveCombatTab('abilities')} className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeCombatTab === 'abilities' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><ShieldCheck className="w-5 h-5" /> Heroic Abilities</button>
            <button onClick={() => setActiveCombatTab('notes')} className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeCombatTab === 'notes' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><StickyNote className="w-5 h-5" /> Notes</button>
          </nav>
        </div>
        <div className="mt-4">
          {activeCombatTab === 'equipment' && <EquipmentSection character={character} />}
          {activeCombatTab === 'abilities' && <HeroicAbilitiesView />}
          {activeCombatTab === 'notes' && <CharacterNotesSection character={character} />}
        </div>
      </div>

      {showBioModal && ( <BioModal onClose={() => setShowBioModal(false)} /> )}
      {showSkillsModal && ( <SkillsModal onClose={() => setShowSkillsModal(false)} /> )}
      {showSpellcastingModal && ( <SpellcastingView onClose={() => setShowSpellcastingModal(false)} /> )}
      {showInventoryModal && ( <InventoryModal onClose={() => setShowInventoryModal(false)} /> )}
      {showAdvancementSystem && ( <AdvancementSystem character={character} onClose={() => { setShowAdvancementSystem(false); if (character?.id && character?.user_id) { fetchCharacter(character.id, character.user_id); } }} /> )}
      {showPlayerAidModal && ( <PlayerAidModal onClose={() => setShowPlayerAidModal(false)} /> )}
      {renderRestOptionsModal()}
      {isSaving && ( <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md text-sm z-50 animate-pulse"> Saving... </div> )}
      {saveError && ( <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-md text-sm z-50"> Save Error: {saveError} </div> )}
    </div>
  );
}