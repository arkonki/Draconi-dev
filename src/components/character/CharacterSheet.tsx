import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Character, AttributeName } from '../../types/character';
import { calculateMovement } from '../../lib/movement';
import {
  Shield, Heart, HelpCircle, Swords, Brain, Zap, Users, Bed, Award, ShieldCheck, HeartPulse, UserCog, Dumbbell, Feather, StickyNote, Plus, Save, Trash2, Minus,
  Bold, Italic, List, ListOrdered, Heading1, Link as LinkIcon, Table as TableIcon, Eye, EyeOff, Quote, Code, Pencil, Calendar, Skull, Package, Sparkles, Book, UserSquare,
  Gem, X, Backpack, Scroll, AlertCircle
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
import { PdfExportButton } from './PdfExportButton'; 

// --- HELPER COMPONENTS ---

const PaperSection = ({ title, children, className = "", action }: { title?: string, children: React.ReactNode, className?: string, action?: React.ReactNode }) => (
  <div className={`relative bg-white/40 border-2 border-stone-300 rounded-sm p-4 shadow-sm ${className}`}>
    {title && (
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a472a] text-[#e8d5b5] px-4 py-0.5 text-xs md:text-sm font-serif font-bold tracking-wider uppercase shadow-md flex items-center gap-2 whitespace-nowrap z-10 clip-path-banner">
        {title}
        {action}
      </div>
    )}
    <div className="pt-2">{children}</div>
  </div>
);

const AttributeEditModal = ({ 
  attribute, 
  value, 
  onSave, 
  onClose 
}: { 
  attribute: string; 
  value: number; 
  onSave: (val: number) => void; 
  onClose: () => void; 
}) => {
  const [newValue, setNewValue] = useState(value);
  const getHelperText = (attr: string) => {
    if (attr === 'WIL') return "Rules: Powerful rituals (Permanence, Resurrection) may permanently reduce WIL by 1.";
    if (attr === 'CON') return "Note: Changing CON affects your Max HP (unless you have the Robust ability).";
    if (attr === 'STR' || attr === 'AGL') return "Note: Changing this may affect your Damage Bonus.";
    return "Attributes usually only change due to magical aging (Demon/Mishap) or severe magic.";
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] backdrop-blur-sm p-4">
      <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-lg p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-stone-400 hover:text-red-600"><X size={20} /></button>
        <h3 className="text-2xl font-serif font-bold text-[#1a472a] mb-2 uppercase tracking-wide border-b-2 border-[#d4c5a3] pb-2">Edit {attribute}</h3>
        <p className="text-xs text-stone-500 italic mb-6 font-serif leading-relaxed">{getHelperText(attribute)}</p>
        <div className="flex items-center justify-center gap-4 mb-6">
          <button onClick={() => setNewValue(prev => Math.max(1, prev - 1))} className="w-12 h-12 rounded border-2 border-stone-300 hover:border-[#1a472a] flex items-center justify-center text-2xl font-bold text-stone-600 hover:text-[#1a472a] bg-white transition-colors"><Minus size={20} /></button>
          <div className="w-20 h-20 rounded-full border-4 border-[#1a472a] bg-white flex items-center justify-center text-4xl font-serif font-bold text-[#1a472a] shadow-inner">{newValue}</div>
          <button onClick={() => setNewValue(prev => Math.min(18, prev + 1))} className="w-12 h-12 rounded border-2 border-stone-300 hover:border-[#1a472a] flex items-center justify-center text-2xl font-bold text-stone-600 hover:text-[#1a472a] bg-white transition-colors"><Plus size={20} /></button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="w-full">Cancel</Button>
          <Button variant="primary" onClick={() => onSave(newValue)} className="w-full">Confirm</Button>
        </div>
      </div>
    </div>
  );
};

const AttributeCircle = ({ name, value, conditionKey, conditionActive, onToggle, onClick, isSaving }: any) => {
  const displayValue = value ?? 10;
  return (
    // UPDATED: w-full ensures it fits the grid cell; max-w allows it to stay contained on desktop
    <div className="flex flex-col items-center relative group w-full max-w-[120px]"> 
      <button 
        onClick={onClick}
        title={`Edit ${name} Score`}
        className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-[#1a472a] bg-[#fdfbf7] flex items-center justify-center shadow-lg relative z-10 transition-all hover:scale-105 hover:bg-[#e8d5b5] group/circle outline-none focus:ring-2 ring-offset-2 ring-[#1a472a] cursor-pointer"
      >
        <span className="text-2xl md:text-3xl font-serif font-bold text-[#1a472a]">{displayValue}</span>
        <span className="absolute -top-3 bg-[#fdfbf7] px-1 text-[10px] font-bold text-stone-500 uppercase tracking-widest border border-stone-200 rounded shadow-sm group-hover/circle:bg-white transition-colors">{name}</span>
        <span className="absolute bottom-1 text-[#1a472a]/0 group-hover/circle:text-[#1a472a]/50 transition-colors"><Pencil size={10} /></span>
      </button>

      <button 
        onClick={onToggle}
        disabled={isSaving}
        // UPDATED: Removed clip-path-banner to ensure text "Disheartened" has max possible space.
        // Used a simpler rounded style that matches the aesthetic but is much more text-friendly.
        className={`mt-2 w-full py-1.5 px-1 text-[9px] md:text-[10px] uppercase font-bold tracking-wider border rounded-sm transition-all shadow-sm
        ${conditionActive 
          ? 'bg-red-700 border-red-800 text-white' 
          : 'bg-stone-200 border-stone-300 text-stone-600 hover:bg-stone-300'}`}
      >
        {conditionKey}
      </button>
    </div>
  );
};

// Character Note Components
function ToolbarButton({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="p-1.5 text-stone-600 hover:text-[#1a472a] hover:bg-stone-200 rounded transition-all">
      <Icon size={16} />
    </button>
  );
}

const CharacterNotesSection = ({ character }: { character: Character }) => {
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; created_at: string; updated_at?: string; }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNote, setActiveNote] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('notes').select('*').eq('character_id', character.id).order('created_at', { ascending: false });
    setNotes(data || []);
    setLoading(false);
  }, [character.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current || !activeNote) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    const newText = value.substring(0, selectionStart) + prefix + value.substring(selectionStart, selectionEnd) + suffix + value.substring(selectionEnd);
    setActiveNote((prev: any) => ({ ...prev, content: newText }));
  };

  const handleSaveNote = async () => {
    if (!activeNote?.title) return;
    const noteData = { ...activeNote, character_id: character.id, user_id: character.user_id, updated_at: new Date().toISOString() };
    const { data } = await supabase.from('notes').upsert(noteData).select().single();
    setActiveNote(data); setIsEditing(false); loadNotes();
  };

  const handleDeleteNote = async (id: string) => {
    if (confirm("Delete note?")) { await supabase.from('notes').delete().eq('id', id); setActiveNote(null); loadNotes(); }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4 border-b-2 border-stone-200 pb-2">
        <h4 className="font-serif font-bold text-stone-700 text-xl">Journal Entries</h4>
        <button onClick={() => { setActiveNote({ title: '', content: '' }); setIsEditing(true); }} className="text-[#1a472a] hover:underline text-xs font-bold flex items-center gap-1 border border-[#1a472a] px-2 py-1 rounded hover:bg-[#1a472a] hover:text-white transition-colors"><Plus size={12} /> NEW ENTRY</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 custom-scrollbar">
        {notes.length === 0 && <div className="col-span-full text-center py-8 text-stone-400 italic">No notes written yet.</div>}
        {notes.map(note => (
          <div key={note.id} onClick={() => { setActiveNote(note); setIsEditing(false); }} className="p-3 bg-white border border-stone-200 shadow-sm cursor-pointer hover:border-[#1a472a] hover:shadow-md group flex flex-col justify-between transition-all min-h-[80px] relative">
            <div>
              <div className="font-serif font-bold text-stone-800 line-clamp-1">{note.title}</div>
              <div className="text-[10px] text-stone-400 mt-1">{new Date(note.created_at).toLocaleDateString()}</div>
            </div>
            <div className="absolute top-2 right-2">
                <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600 p-1 transition-opacity"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {activeNote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
          <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-lg w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200">
             <button onClick={() => setActiveNote(null)} className="absolute top-2 right-2 text-stone-500 hover:text-red-600 p-2"><X /></button>
             <div className="p-4 md:p-6 flex flex-col h-full">
                {isEditing ? (
                  <>
                    <input className="text-2xl font-serif font-bold bg-transparent border-b-2 border-[#1a472a] mb-4 outline-none text-[#1a472a] w-full" value={activeNote.title} onChange={e => setActiveNote({...activeNote, title: e.target.value})} placeholder="Title" />
                    <div className="flex gap-2 bg-stone-100 p-1 border-b border-stone-300 overflow-x-auto">
                      <ToolbarButton icon={Bold} label="Bold" onClick={() => insertMarkdown('**', '**')} />
                      <ToolbarButton icon={Italic} label="Italic" onClick={() => insertMarkdown('*', '*')} />
                      <ToolbarButton icon={List} label="List" onClick={() => insertMarkdown('- ')} />
                      <div className="flex-1"></div>
                      <button onClick={() => setShowPreview(!showPreview)} className="text-xs font-bold text-[#1a472a] whitespace-nowrap px-2">{showPreview ? 'EDIT' : 'PREVIEW'}</button>
                    </div>
                    {showPreview ? (
                      <div className="flex-1 overflow-y-auto p-4 prose prose-stone max-w-none"><MarkdownRenderer content={activeNote.content} /></div>
                    ) : (
                      <textarea ref={textareaRef} className="flex-1 p-4 bg-white resize-none outline-none font-serif text-stone-800 w-full border-x border-b border-stone-200" value={activeNote.content} onChange={e => setActiveNote({...activeNote, content: e.target.value})} />
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                       <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                       <Button variant="primary" onClick={handleSaveNote}>Save Entry</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start border-b-2 border-stone-200 pb-2 mb-4 pr-8">
                      <h2 className="text-2xl md:text-3xl font-serif font-bold text-[#1a472a] break-words">{activeNote.title}</h2>
                      <Button size="xs" variant="secondary" onClick={() => setIsEditing(true)} icon={Pencil}>Edit</Button>
                    </div>
                    <div className="flex-1 overflow-y-auto prose prose-stone max-w-none custom-scrollbar pr-2">
                       <MarkdownRenderer content={activeNote.content} />
                    </div>
                    <div className="text-right text-xs text-stone-400 mt-2 pt-2 border-t border-stone-100">{new Date(activeNote.created_at).toLocaleDateString()}</div>
                  </>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatBar = ({ label, currentValue, maxValue, onDecrement, onIncrement, colorClass }: any) => (
  <div className="flex items-center gap-2 w-full">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-stone-400 font-bold text-white shadow-sm shrink-0 ${colorClass === 'bg-red-600' ? 'bg-red-800' : 'bg-teal-800'}`}>
      <span className="text-xs">{label}</span>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1">
        <span>Current</span>
        <span>{currentValue} / {maxValue}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onDecrement} className="w-6 h-6 rounded border border-stone-300 bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 shrink-0 touch-manipulation"><Minus size={12} /></button>
        <div className="flex-1 h-3 bg-stone-300 rounded-full overflow-hidden border border-stone-400 relative">
           <div className={`h-full ${colorClass} transition-all duration-300`} style={{ width: `${(currentValue / maxValue) * 100}%` }}></div>
        </div>
        <button onClick={onIncrement} className="w-6 h-6 rounded border border-stone-300 bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 shrink-0 touch-manipulation"><Plus size={12} /></button>
      </div>
    </div>
  </div>
);

// --- MAIN SHEET COMPONENT ---

export function CharacterSheet() {
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
  const [editingAttribute, setEditingAttribute] = useState<{name: AttributeName, value: number} | null>(null);
  const [healerPresent, setHealerPresent] = useState(false);
  const [activeTab, setActiveTab] = useState<'equipment' | 'abilities' | 'notes'>('equipment');

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#f5f0e1]"><LoadingSpinner size="lg" /><span className="ml-3 font-serif text-xl text-[#1a472a]">Unrolling Scroll...</span></div>;
  if (error) return <div className="p-4 text-center text-red-500 font-serif">Error loading scroll: {error}</div>;
  if (!character) return <div className="p-4 text-center">Character data not available.</div>;

  const handleConditionToggle = (condition: keyof Character['conditions']) => { toggleCondition(condition); };
  const handleRest = async (type: 'round' | 'stretch' | 'shift') => { setShowRestOptionsModal(false); await performRest(type, type === 'stretch' ? healerPresent : undefined); setHealerPresent(false); };
  const canCastSpells = () => { const skills = Object.keys(character?.skill_levels || {}); return character?.profession?.endsWith('Mage') || skills.some(s => ['ELEMENTALISM', 'ANIMISM', 'MENTALISM'].includes(s.toUpperCase())); };

  const currentHP = character?.current_hp ?? 0;
  const currentWP = character?.current_wp ?? 0;
  const maxHP = character?.max_hp ?? 10;
  const maxWP = character?.max_wp ?? 10;

  const getDmgBonus = (value: number) => {
    if (value > 16) return '+D6';
    if (value > 12) return '+D4';
    return null;
  };
  const strBonus = getDmgBonus(character.attributes?.STR ?? 10);
  const aglBonus = getDmgBonus(character.attributes?.AGL ?? 10);

  const handleAttributeUpdate = async (newValue: number) => {
    if (!editingAttribute || !character) return;
    try {
      const updatedAttributes = { ...character.attributes, [editingAttribute.name]: newValue };
      useCharacterSheetStore.setState(state => ({ ...state, character: { ...state.character!, attributes: updatedAttributes } }));
      const { error } = await supabase.from('characters').update({ attributes: updatedAttributes }).eq('id', character.id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update attribute", err);
    } finally {
      setEditingAttribute(null);
    }
  };

  const renderRestModal = () => {
    if(!showRestOptionsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
         <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-2xl font-serif font-bold text-[#1a472a] mb-4 border-b-2 border-stone-200 pb-2">Take a Rest</h3>
            <div className="space-y-3 font-serif">
              <button onClick={() => handleRest('round')} className="w-full text-left p-3 hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors">
                <div className="font-bold text-[#1a472a]">Round Rest (Action)</div>
                <div className="text-sm text-stone-600">Recover 1d6 WP. No HP.</div>
              </button>
              <button onClick={() => handleRest('stretch')} disabled={(character?.current_hp ?? 0) <= 0} className="w-full text-left p-3 hover:bg-[#e8d5b5] border border-stone-300 rounded group disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <div className="font-bold text-[#1a472a]">Stretch Rest (15 min)</div>
                <div className="text-sm text-stone-600">Heal 1d6 HP (2d6 w/ Healer), 1d6 WP. Cure 1 Condition.</div>
                <label className="flex items-center gap-2 mt-2 text-sm pointer-events-auto" onClick={e => e.stopPropagation()}><input type="checkbox" className="accent-[#1a472a] w-4 h-4" checked={healerPresent} onChange={e => setHealerPresent(e.target.checked)}/> Healer Present?</label>
              </button>
              <button onClick={() => handleRest('shift')} className="w-full text-left p-3 hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors">
                <div className="font-bold text-[#1a472a]">Shift Rest (6 hours)</div>
                <div className="text-sm text-stone-600">Full Recovery of HP & WP. Heal all conditions.</div>
              </button>
            </div>
            <button onClick={() => setShowRestOptionsModal(false)} className="mt-4 w-full py-3 text-stone-500 hover:text-stone-800 font-bold uppercase text-xs tracking-widest">Cancel</button>
         </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f0e1] text-stone-800 p-0 md:p-6 font-sans overflow-x-hidden">
      <div className="max-w-7xl mx-auto bg-[#fdfbf7] shadow-2xl border-x-0 md:border-2 border-[#d4c5a3] relative">
        
        {/* HEADER */}
        <div className="bg-[#1a472a] text-[#e8d5b5] p-4 flex flex-col md:flex-row justify-between items-center border-b-4 border-[#d4c5a3] relative">
          <div className="z-10 flex flex-col w-full md:w-auto text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tighter uppercase drop-shadow-md">Dragonbane</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 md:gap-4 mt-2 text-xs md:text-sm font-serif tracking-wide opacity-90">
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">{character.kin}</span>
              <span className="hidden md:inline">•</span>
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">{character.profession}</span>
              <span className="hidden md:inline">•</span>
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">Age {character.age}</span>
            </div>
          </div>

          <div className="z-10 mt-4 md:mt-0 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
            <div className="flex gap-2 min-w-max px-1">
              {[
                { label: 'Bio', icon: UserSquare, action: () => setShowBioModal(true) },
                { label: 'Rest', icon: Bed, action: () => setShowRestOptionsModal(true) },
                { label: 'Inventory', icon: Package, action: () => setShowInventoryModal(true) },
                { label: 'Session', icon: Award, action: () => setShowAdvancementSystem(true) },
                { label: 'Help', icon: HelpCircle, action: () => setShowPlayerAidModal(true) },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} className="flex flex-col items-center justify-center w-14 h-12 md:w-16 md:h-14 bg-[#2c5e3f] hover:bg-[#3a7a52] active:bg-[#1a472a] rounded border border-[#4a8a62] text-[#e8d5b5] transition-colors shadow-sm touch-manipulation">
                  <btn.icon size={18} />
                  <span className="text-[9px] md:text-[10px] uppercase font-bold mt-1">{btn.label}</span>
                </button>
              ))}
              <PdfExportButton character={character} />
            </div>
          </div>
        </div>

        {/* MAIN PAPER AREA */}
        <div className="p-3 md:p-8 space-y-6 md:space-y-8 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')]">
          
          {/* NAME & VITALS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-end">
             <div className="md:col-span-5 border-b-2 border-stone-400 pb-2 text-center md:text-left">
                <label className="block text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Character Name</label>
                <div className="text-3xl md:text-4xl font-serif font-bold text-[#1a472a] leading-none">{character.name}</div>
             </div>
             
             <div className="md:col-span-7 flex flex-wrap gap-2 md:gap-4 justify-center md:justify-end">
                <div className="bg-[#1a472a] text-white px-3 py-1 md:px-4 md:py-2 clip-path-banner shadow-md text-center min-w-[80px]">
                   <div className="text-[9px] md:text-[10px] uppercase font-bold opacity-80">Movement</div>
                   <div className="text-lg md:text-xl font-serif font-bold">{calculateMovement(character.kin, character.attributes?.AGL)} m</div>
                </div>
                {strBonus && (
                  <div className="bg-[#8b2e2e] text-white px-3 py-1 md:px-4 md:py-2 clip-path-banner shadow-md text-center min-w-[80px]">
                    <div className="text-[9px] md:text-[10px] uppercase font-bold opacity-80">STR Bonus</div>
                    <div className="text-lg md:text-xl font-serif font-bold">{strBonus}</div>
                  </div>
                )}
                {aglBonus && (
                  <div className="bg-[#8b2e2e] text-white px-3 py-1 md:px-4 md:py-2 clip-path-banner shadow-md text-center min-w-[80px]">
                    <div className="text-[9px] md:text-[10px] uppercase font-bold opacity-80">AGL Bonus</div>
                    <div className="text-lg md:text-xl font-serif font-bold">{aglBonus}</div>
                  </div>
                )}
             </div>
          </div>

          {/* ATTRIBUTES ROW - UPDATED FOR MOBILE RESPONSIVENESS */}
          <div className="relative py-4 md:py-6">
             <div className="hidden md:block absolute top-1/2 left-0 w-full h-2 bg-[#1a472a] opacity-20 -z-0 rounded-full"></div>
             {/* grid-cols-2 on mobile, grid-cols-6 on desktop */}
             <div className="relative z-10 grid grid-cols-2 md:grid-cols-6 gap-y-8 gap-x-4 justify-items-center">
                {[
                  ['STR', 'exhausted'], 
                  ['CON', 'sickly'], 
                  ['AGL', 'dazed'], 
                  ['INT', 'angry'], 
                  ['WIL', 'scared'], 
                  ['CHA', 'disheartened']
                ].map(([attr, cond]) => (
                   <AttributeCircle 
                      key={attr} 
                      name={attr} 
                      value={character.attributes?.[attr as AttributeName]} 
                      conditionKey={cond}
                      conditionActive={character.conditions?.[cond as keyof Character['conditions']]}
                      onToggle={() => handleConditionToggle(cond as keyof Character['conditions'])}
                      onClick={() => setEditingAttribute({ 
                        name: attr as AttributeName, 
                        value: character.attributes?.[attr as AttributeName] || 10 
                      })}
                      isSaving={isSaving}
                   />
                ))}
             </div>
          </div>

          {/* TOP SECTION: 3 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="space-y-4 md:space-y-6">
               <PaperSection title="Vitals & Combat">
                  <div className="space-y-4 pt-2">
                    {currentHP > 0 ? (
                        <StatBar label="HP" currentValue={currentHP} maxValue={maxHP} colorClass="bg-red-600" onIncrement={() => adjustStat('current_hp', 1)} onDecrement={() => adjustStat('current_hp', -1)} />
                    ) : (
                        <DeathRollTracker character={character} />
                    )}
                    <StatBar label="WP" currentValue={currentWP} maxValue={maxWP} colorClass="bg-teal-600" onIncrement={() => adjustStat('current_wp', 1)} onDecrement={() => adjustStat('current_wp', -1)} />
                  </div>
                  <div className="mt-4 pt-4 border-t border-stone-300"><StatusPanelView /></div>
               </PaperSection>
            </div>

            <div className="space-y-4 md:space-y-6">
               <PaperSection title="Abilities">
                   <div className="flex flex-col gap-3 py-2">
                      <button onClick={() => setShowSkillsModal(true)} className="w-full flex items-center justify-center gap-2 border-2 border-[#1a472a] text-[#1a472a] bg-white p-3 font-serif font-bold hover:bg-[#e8d5b5] transition-colors rounded-sm shadow-sm"><Book size={18}/> View Skills</button>
                      {canCastSpells() && (<button onClick={() => setShowSpellcastingModal(true)} className="w-full flex items-center justify-center gap-2 border-2 border-purple-800 text-purple-900 bg-purple-50 p-3 font-serif font-bold hover:bg-purple-100 transition-colors rounded-sm shadow-sm"><Sparkles size={18}/> Open Grimoire</button>)}
                   </div>
               </PaperSection>
               <div className="bg-[#f0e6d2] p-3 rounded border border-[#d4c5a3] flex justify-between items-center text-sm font-bold font-serif text-[#5c4d3c] shadow-inner">
                  <div className="flex flex-col items-center w-1/3 border-r border-[#d4c5a3]"><span className="text-lg md:text-xl text-[#b8860b]">{character.equipment?.money?.gold || 0}</span><span className="text-[9px] md:text-[10px] uppercase">Gold</span></div>
                  <div className="flex flex-col items-center w-1/3 border-r border-[#d4c5a3]"><span className="text-lg md:text-xl text-[#718096]">{character.equipment?.money?.silver || 0}</span><span className="text-[9px] md:text-[10px] uppercase">Silver</span></div>
                  <div className="flex flex-col items-center w-1/3"><span className="text-lg md:text-xl text-[#a0522d]">{character.equipment?.money?.copper || 0}</span><span className="text-[9px] md:text-[10px] uppercase">Copper</span></div>
               </div>
            </div>

            <div className="space-y-4 md:space-y-6">
               <PaperSection title="Character Details">
                  <div className="space-y-3">
                    <div className="font-serif text-sm leading-relaxed text-stone-700 min-h-[40px] italic">{character.appearance || "No description provided."}</div>
                    <div className="mt-3 pt-3 border-t border-stone-200">
                        <div className="flex items-center gap-2 mb-1"><AlertCircle size={14} className="text-red-700" /><span className="text-[10px] uppercase font-bold text-stone-500">Weakness</span></div>
                        <div className="font-serif text-sm text-red-900 font-bold leading-tight">{character.flaw || "None"}</div>
                    </div>
                  </div>
               </PaperSection>
               <div className="grid grid-cols-2 gap-4">
                 <div className="flex flex-col items-center justify-center gap-1 p-2 bg-[#fdfbf7] border border-stone-200 shadow-inner rounded-sm h-full"><Gem className="text-[#b8860b] mb-1" size={20} /><span className="text-[10px] uppercase font-bold text-stone-400">Memento</span><span className="font-serif font-bold text-stone-800 text-xs text-center line-clamp-2 leading-tight">{character.memento || "None"}</span></div>
                 <button onClick={() => setShowInventoryModal(true)} className="flex flex-col items-center justify-center gap-1 border-2 border-stone-400 text-stone-700 bg-stone-50 p-2 font-serif font-bold hover:bg-stone-100 transition-colors rounded-sm shadow-sm h-full"><Backpack size={20}/><span className="text-xs">Inventory</span></button>
               </div>
            </div>
          </div>

          <div className="w-full">
             <div className="bg-white border-2 border-stone-300 min-h-[500px] flex flex-col rounded-sm shadow-md">
                <div className="flex border-b-2 border-stone-300 bg-stone-100 overflow-x-auto">
                   <button onClick={() => setActiveTab('equipment')} className={`flex-1 py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap ${activeTab === 'equipment' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Swords className="inline mr-2 w-4 h-4"/> Combat & Gear</button>
                   <button onClick={() => setActiveTab('abilities')} className={`flex-1 py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap ${activeTab === 'abilities' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><ShieldCheck className="inline mr-2 w-4 h-4"/> Heroic Abilities</button>
                   <button onClick={() => setActiveTab('notes')} className={`flex-1 py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap ${activeTab === 'notes' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Scroll className="inline mr-2 w-4 h-4"/> Journal</button>
                </div>
                <div className="p-4 md:p-6 flex-1 bg-white/80">
                   {activeTab === 'equipment' && <EquipmentSection character={character} />}
                   {activeTab === 'abilities' && <HeroicAbilitiesView />}
                   {activeTab === 'notes' && <CharacterNotesSection character={character} />}
                </div>
             </div>
          </div>
        </div>

        <div className="h-4 bg-[#1a472a] border-t-4 border-[#d4c5a3]"></div>
        {showBioModal && <BioModal onClose={() => setShowBioModal(false)} />}
        {showSkillsModal && <SkillsModal onClose={() => setShowSkillsModal(false)} />}
        {showSpellcastingModal && <SpellcastingView onClose={() => setShowSpellcastingModal(false)} />}
        {showInventoryModal && <InventoryModal onClose={() => setShowInventoryModal(false)} />}
        {showAdvancementSystem && <AdvancementSystem character={character} onClose={() => { setShowAdvancementSystem(false); if (character?.id && character?.user_id) fetchCharacter(character.id, character.user_id); }} />}
        {showPlayerAidModal && <PlayerAidModal onClose={() => setShowPlayerAidModal(false)} />}
        {editingAttribute && (<AttributeEditModal attribute={editingAttribute.name} value={editingAttribute.value} onClose={() => setEditingAttribute(null)} onSave={handleAttributeUpdate} />)}
        {renderRestModal()}
        {isSaving && <div className="fixed bottom-4 right-4 bg-[#1a472a] text-[#e8d5b5] px-4 py-2 rounded shadow-lg text-sm z-50 animate-pulse font-serif border border-[#e8d5b5]">Inscribing...</div>}
        {saveError && <div className="fixed bottom-4 right-4 bg-red-800 text-white px-4 py-2 rounded shadow-lg text-sm z-50 font-serif border border-white">Ink Smudge (Error): {saveError}</div>}
      </div>
      <style>{`
        .clip-path-banner {
          clip-path: polygon(0% 0%, 100% 0%, 95% 50%, 100% 100%, 0% 100%, 5% 50%);
          padding-left: 1.5rem;
          padding-right: 1.5rem;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4c5a3; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #1a472a; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}