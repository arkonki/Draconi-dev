import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, AttributeName } from '../../types/character';
import { calculateMovement } from '../../lib/movement';
import {
  HelpCircle, Swords, Bed, Award, ShieldCheck, Plus, Trash2, Minus,
  Bold, Italic, List, Pencil, Package, Sparkles, Book, UserSquare,
  Gem, X, Backpack, Scroll, AlertCircle, History, RotateCcw, Calculator, CornerDownLeft, Delete
} from 'lucide-react';
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

// --- NEW STAT TRACKER COMPONENTS ---

interface StatHistoryItem {
  id: string;
  amount: number; // positive = heal/recover, negative = damage/spend
  timestamp: Date;
  previousValue: number;
}

const StatModificationModal = ({ 
  statName, 
  currentValue, 
  maxValue, 
  onApply, 
  onClose,
  history,
  onRevert
}: { 
  statName: string; 
  currentValue: number; 
  maxValue: number; 
  onApply: (amount: number) => void; 
  onClose: () => void;
  history: StatHistoryItem[];
  onRevert: (item: StatHistoryItem) => void;
}) => {
  const [inputValue, setInputValue] = useState<string>('');
  const [mode, setMode] = useState<'damage' | 'heal'>('damage');
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle Physical Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        handleNumPress(key);
      } else if (key === 'Backspace') {
        handleBackspace();
      } else if (key === 'Enter') {
        handleApply();
      } else if (key === 'Escape') {
        onClose();
      } else if (key === 'c' || key === 'C') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputValue, mode]);

  const handleNumPress = (num: string) => {
    if (inputValue.length >= 3) return; // Cap at 3 digits (999)
    setInputValue(prev => prev === '0' ? num : prev + num);
  };

  const handleBackspace = () => {
    setInputValue(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setInputValue('');
  };

  const handleApply = () => {
    const val = parseInt(inputValue);
    if (isNaN(val) || val === 0) return;
    
    // If mode is damage (HP) or spend (WP), make negative
    // If mode is heal (HP) or recover (WP), make positive
    const finalAmount = mode === 'damage' ? -val : val;
    onApply(finalAmount);
    setInputValue('');
  };

  const isHp = statName === 'HP';

  const NumpadBtn = ({
    children,
    onClick,
    variant = 'default',
    className = '',
  }: {
    children: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'danger' | 'action';
    className?: string;
  }) => {
    const baseStyles = "h-14 md:h-16 rounded-lg font-serif text-2xl font-bold transition-all active:scale-95 shadow-sm border-b-4 active:border-b-0 active:translate-y-1";
    const variants = {
      default: "bg-white text-stone-700 border-stone-300 hover:bg-stone-50 hover:border-stone-400",
      primary: "bg-[#1a472a] text-[#e8d5b5] border-[#0f2e1b] hover:bg-[#2c5e3f]",
      danger: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200",
      action: "bg-stone-200 text-stone-600 border-stone-300 hover:bg-stone-300"
    };

    return (
      <button onClick={onClick} className={`${baseStyles} ${variants[variant] || variants.default} ${className}`}>
        {children}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] backdrop-blur-sm p-4">
      <div ref={modalRef} className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#1a472a] text-[#e8d5b5] p-3 flex justify-between items-center border-b-4 border-[#d4c5a3] shrink-0">
          <div className="flex flex-col">
            <h3 className="text-lg font-serif font-bold uppercase tracking-wide flex items-center gap-2">
              <Calculator size={18} /> Modify {statName}
            </h3>
            <span className="text-xs opacity-80 font-mono">
              Current: {currentValue} / {maxValue}
            </span>
          </div>
          <button onClick={onClose} className="hover:text-white bg-white/10 p-1.5 rounded hover:bg-white/20 transition-colors"><X size={20} /></button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          
          {/* Mode Toggles */}
          <div className="flex gap-2 shrink-0">
            <button 
              onClick={() => setMode('damage')} 
              className={`flex-1 py-3 px-2 font-bold uppercase text-xs tracking-wider border-2 rounded-lg transition-all
              ${mode === 'damage' 
                ? 'bg-red-700 border-red-900 text-white shadow-inner scale-[0.98]' 
                : 'bg-white border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-700 shadow-sm'}`}
            >
              {isHp ? 'Damage' : 'Spend'} (-)
            </button>
            <button 
              onClick={() => setMode('heal')} 
              className={`flex-1 py-3 px-2 font-bold uppercase text-xs tracking-wider border-2 rounded-lg transition-all
              ${mode === 'heal' 
                ? 'bg-emerald-700 border-emerald-900 text-white shadow-inner scale-[0.98]' 
                : 'bg-white border-stone-200 text-stone-500 hover:border-emerald-300 hover:text-emerald-700 shadow-sm'}`}
            >
              {isHp ? 'Heal' : 'Recover'} (+)
            </button>
          </div>

          {/* Calculator Display Screen */}
          <div className="bg-[#dcdcdc] p-4 rounded-lg border-2 border-stone-400 shadow-inner flex flex-col items-end justify-center h-20 mb-2 relative overflow-hidden">
            {/* LCD Glare Effect */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></div>
            
            <div className={`text-4xl font-mono font-bold tracking-widest z-10 
              ${!inputValue ? 'opacity-30' : 'opacity-100'} 
              ${mode === 'damage' ? 'text-red-900' : 'text-emerald-900'}`
            }>
              {inputValue || '0'}
            </div>
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <NumpadBtn key={num} onClick={() => handleNumPress(num.toString())}>
                {num}
              </NumpadBtn>
            ))}
            
            <NumpadBtn variant="danger" onClick={handleClear} className="text-base">
              CLR
            </NumpadBtn>
            <NumpadBtn onClick={() => handleNumPress('0')}>
              0
            </NumpadBtn>
            <NumpadBtn variant="action" onClick={handleBackspace}>
              <Delete size={24} className="mx-auto" />
            </NumpadBtn>
          </div>

          {/* Apply Button */}
          <button
            onClick={handleApply}
            disabled={!inputValue}
            className={`w-full py-4 rounded-lg font-serif font-bold text-lg uppercase tracking-widest shadow-md transition-all active:scale-95 active:shadow-none
              ${!inputValue 
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed' 
                : mode === 'damage' 
                  ? 'bg-red-700 text-white hover:bg-red-800' 
                  : 'bg-emerald-700 text-white hover:bg-emerald-800'
              }`}
          >
            {inputValue ? (
              <span className="flex items-center justify-center gap-2">
                {mode === 'damage' ? 'Apply Damage' : 'Apply Healing'}
                <CornerDownLeft size={20} />
              </span>
            ) : 'Enter Amount'}
          </button>

          {/* History Log (Collapsible or Small) */}
          {history.length > 0 && (
            <div className="mt-4 pt-4 border-t-2 border-stone-200">
              <div className="flex items-center gap-2 mb-3 text-stone-400">
                <History size={14} />
                <span className="text-xs font-bold uppercase tracking-widest">Recent Changes</span>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                {history.slice().reverse().map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-stone-100 shadow-sm animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold font-mono ${item.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.amount > 0 ? '+' : ''}{item.amount}
                      </span>
                      <span className="text-stone-400 text-xs">
                        ({item.previousValue} → {item.previousValue + item.amount})
                      </span>
                    </div>
                    <button 
                      onClick={() => onRevert(item)}
                      title="Undo"
                      className="text-stone-400 hover:text-red-600 transition-colors p-1 hover:bg-stone-100 rounded"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatTracker = ({ 
  label, 
  currentValue, 
  maxValue, 
  colorClass, 
  onModify 
}: { 
  label: string, 
  currentValue: number, 
  maxValue: number, 
  colorClass: string, // e.g., 'bg-red-600'
  onModify: (stat: string, amount: number) => void 
}) => {
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState<StatHistoryItem[]>([]);

  // Calculate percentage for the bar
  const percent = Math.min(100, Math.max(0, (currentValue / maxValue) * 100));

  const handleApplyChange = (amount: number) => {
    // 1. Add to history
    const newItem: StatHistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      amount: amount,
      timestamp: new Date(),
      previousValue: currentValue
    };
    setHistory(prev => [...prev, newItem]);

    // 2. Apply to store
    onModify(label === 'HP' ? 'current_hp' : 'current_wp', amount);
  };

  const handleRevert = (item: StatHistoryItem) => {
    // To revert, we apply the inverse of the amount
    onModify(label === 'HP' ? 'current_hp' : 'current_wp', -item.amount);
    
    // Remove from history
    setHistory(prev => prev.filter(h => h.id !== item.id));
  };

  return (
    <>
      <div className="w-full bg-stone-100 rounded-md border border-stone-300 p-2 shadow-sm relative overflow-hidden group">
        
        {/* Header Row */}
        <div className="flex justify-between items-end mb-1 relative z-10">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white shadow-sm ${colorClass === 'bg-red-600' ? 'bg-red-800' : 'bg-teal-800'}`}>
              {label}
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
              {label === 'HP' ? 'Health' : 'Willpower'}
            </span>
          </div>
          <div className="font-serif font-bold text-stone-700">
            <span className="text-lg">{currentValue}</span>
            <span className="text-sm text-stone-400"> / {maxValue}</span>
          </div>
        </div>

        {/* Bar Container */}
        <div className="h-3 bg-stone-200 rounded-full overflow-hidden border border-stone-300 relative z-10">
          <div 
            className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Buttons - Overlay on hover for desktop, persistent for mobile? No, let's put them below or beside */}
        <div className="mt-2 flex justify-between items-center relative z-10">
            <div className="flex gap-1">
                 {/* Quick Adjust Buttons */}
                <button 
                  onClick={() => handleApplyChange(-1)}
                  className="w-10 h-10 rounded border border-stone-300 bg-white hover:bg-stone-50 hover:border-red-400 text-stone-600 flex items-center justify-center transition-colors touch-manipulation"
                  title="-1"
                >
                    <Minus size={14} />
                </button>
                <button 
                  onClick={() => handleApplyChange(1)}
                  className="w-10 h-10 rounded border border-stone-300 bg-white hover:bg-stone-50 hover:border-emerald-400 text-stone-600 flex items-center justify-center transition-colors touch-manipulation"
                  title="+1"
                >
                    <Plus size={14} />
                </button>
            </div>
            
            <button 
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-[#e8d5b5] hover:bg-[#d4c5a3] text-[#5c4d3c] text-xs font-bold uppercase tracking-wider rounded border border-[#d4c5a3] transition-colors shadow-sm touch-manipulation"
            >
                <Calculator size={14} />
                Modify
            </button>
        </div>
      </div>

      {showModal && (
        <StatModificationModal 
          statName={label}
          currentValue={currentValue}
          maxValue={maxValue}
          onApply={handleApplyChange}
          onClose={() => setShowModal(false)}
          history={history}
          onRevert={handleRevert}
        />
      )}
    </>
  );
};


// --- EXISTING HELPERS (Unchanged) ---

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

interface AttributeCircleProps {
  name: string;
  value: number | undefined;
  conditionKey: string;
  conditionActive: boolean;
  onToggle: () => void;
  onClick: () => void;
  isSaving: boolean;
}

const AttributeCircle = ({ name, value, conditionKey, conditionActive, onToggle, onClick, isSaving }: AttributeCircleProps) => {
  const displayValue = value ?? 10;
  return (
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
        className={`mt-2 w-full min-h-[40px] py-2 px-2 text-[10px] uppercase font-bold tracking-wider border rounded-sm transition-all shadow-sm touch-manipulation
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
function ToolbarButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="w-10 h-10 flex items-center justify-center text-stone-600 hover:text-[#1a472a] hover:bg-stone-200 rounded transition-all touch-manipulation">
      <Icon size={16} />
    </button>
  );
}

interface CharacterNote {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

interface EditableCharacterNote {
  id?: string;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

const CharacterNotesSection = ({ character }: { character: Character }) => {
  const [notes, setNotes] = useState<CharacterNote[]>([]);
  const [activeNote, setActiveNote] = useState<EditableCharacterNote | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('notes').select('*').eq('character_id', character.id).order('created_at', { ascending: false });
    setNotes(data || []);
  }, [character.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current || !activeNote) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    const newText = value.substring(0, selectionStart) + prefix + value.substring(selectionStart, selectionEnd) + suffix + value.substring(selectionEnd);
    setActiveNote(prev => (prev ? { ...prev, content: newText } : prev));
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
      <div className="flex justify-between items-center mb-4 border-b-2 border-stone-200 pb-2 gap-3">
        <h4 className="font-serif font-bold text-stone-700 text-xl">Journal Entries</h4>
        <button onClick={() => { setActiveNote({ title: '', content: '' }); setIsEditing(true); }} className="text-[#1a472a] text-xs md:text-sm font-bold flex items-center gap-1.5 border border-[#1a472a] px-3 py-2 rounded hover:bg-[#1a472a] hover:text-white transition-colors min-h-[40px] touch-manipulation whitespace-nowrap"><Plus size={14} /> NEW ENTRY</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 custom-scrollbar">
        {notes.length === 0 && <div className="col-span-full text-center py-8 text-stone-400 italic">No notes written yet.</div>}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => { setActiveNote(note); setIsEditing(false); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActiveNote(note);
                setIsEditing(false);
              }
            }}
            role="button"
            tabIndex={0}
            className="p-3 bg-white border border-stone-200 shadow-sm cursor-pointer hover:border-[#1a472a] hover:shadow-md group flex flex-col justify-between transition-all min-h-[96px] relative touch-manipulation"
          >
            <div>
              <div className="font-serif font-bold text-stone-800 line-clamp-1">{note.title}</div>
              <div className="text-[10px] text-stone-400 mt-1">{new Date(note.created_at).toLocaleDateString()}</div>
            </div>
            <div className="absolute top-2 right-2">
                <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-stone-400 hover:text-red-600 p-2 transition-opacity touch-manipulation"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {activeNote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
          <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-lg w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200">
             <button onClick={() => setActiveNote(null)} className="absolute top-2 right-2 text-stone-500 hover:text-red-600 p-3 touch-manipulation"><X /></button>
             <div className="p-4 md:p-6 flex flex-col h-full">
                {isEditing ? (
                  <>
                    <input className="text-2xl font-serif font-bold bg-transparent border-b-2 border-[#1a472a] mb-4 outline-none text-[#1a472a] w-full" value={activeNote.title} onChange={e => setActiveNote({...activeNote, title: e.target.value})} placeholder="Title" />
                    <div className="flex gap-2 bg-stone-100 p-2 border-b border-stone-300 overflow-x-auto">
                      <ToolbarButton icon={Bold} label="Bold" onClick={() => insertMarkdown('**', '**')} />
                      <ToolbarButton icon={Italic} label="Italic" onClick={() => insertMarkdown('*', '*')} />
                      <ToolbarButton icon={List} label="List" onClick={() => insertMarkdown('- ')} />
                      <div className="flex-1"></div>
                      <button onClick={() => setShowPreview(!showPreview)} className="text-xs font-bold text-[#1a472a] whitespace-nowrap px-3 min-h-[40px] touch-manipulation">{showPreview ? 'EDIT' : 'PREVIEW'}</button>
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
                      <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)} icon={Pencil}>Edit</Button>
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

// --- MAIN SHEET COMPONENT ---

export function CharacterSheet() {
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

  // Wrapper for adjustStat to handle the string key requirement
  const handleStatModify = (stat: 'current_hp' | 'current_wp', amount: number) => {
    adjustStat(stat, amount);
  };

  const renderRestModal = () => {
    if(!showRestOptionsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
         <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-2xl font-serif font-bold text-[#1a472a] mb-4 border-b-2 border-stone-200 pb-2">Take a Rest</h3>
            <div className="space-y-3 font-serif">
              <button onClick={() => handleRest('round')} className="w-full text-left p-3 min-h-[56px] hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors touch-manipulation">
                <div className="font-bold text-[#1a472a]">Round Rest (Action)</div>
                <div className="text-sm text-stone-600">Recover 1d6 WP. No HP.</div>
              </button>
              <div className="p-3 border border-stone-300 rounded group disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <button onClick={() => handleRest('stretch')} disabled={(character?.current_hp ?? 0) <= 0} className="w-full text-left min-h-[48px] hover:bg-[#e8d5b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation">
                  <div className="font-bold text-[#1a472a]">Stretch Rest (15 min)</div>
                  <div className="text-sm text-stone-600">Heal 1d6 HP (2d6 w/ Healer), 1d6 WP. Cure 1 Condition.</div>
                </button>
                <label className="flex items-center gap-2 mt-2 text-sm pointer-events-auto min-h-[40px]">
                  <input type="checkbox" className="accent-[#1a472a] w-5 h-5" checked={healerPresent} onChange={e => setHealerPresent(e.target.checked)} />
                  Healer Present?
                </label>
              </div>
              <button onClick={() => handleRest('shift')} className="w-full text-left p-3 min-h-[56px] hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors touch-manipulation">
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
                <button key={btn.label} onClick={btn.action} className="flex flex-col items-center justify-center w-14 h-12 md:w-16 md:h-14 min-h-[48px] bg-[#2c5e3f] hover:bg-[#3a7a52] active:bg-[#1a472a] rounded border border-[#4a8a62] text-[#e8d5b5] transition-colors shadow-sm touch-manipulation">
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
                <p className="block text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Character Name</p>
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
                    {/* UPDATED: StatTracker for HP */}
                    {currentHP > 0 ? (
                        <StatTracker 
                          label="HP" 
                          currentValue={currentHP} 
                          maxValue={maxHP} 
                          colorClass="bg-red-600"
                          onModify={handleStatModify}
                        />
                    ) : (
                        <DeathRollTracker character={character} />
                    )}
                    
                    {/* UPDATED: StatTracker for WP */}
                    <StatTracker 
                      label="WP" 
                      currentValue={currentWP} 
                      maxValue={maxWP} 
                      colorClass="bg-teal-600"
                      onModify={handleStatModify}
                    />
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
                 <button onClick={() => setShowInventoryModal(true)} className="flex flex-col items-center justify-center gap-1 border-2 border-stone-400 text-stone-700 bg-stone-50 p-2 font-serif font-bold hover:bg-stone-100 transition-colors rounded-sm shadow-sm h-full min-h-[88px] touch-manipulation"><Backpack size={20}/><span className="text-xs">Inventory</span></button>
               </div>
            </div>
          </div>

          <div className="w-full">
             <div className="bg-white border-2 border-stone-300 min-h-[500px] flex flex-col rounded-sm shadow-md">
                <div className="flex border-b-2 border-stone-300 bg-stone-100 overflow-x-auto hide-scrollbar">
                   <button onClick={() => setActiveTab('equipment')} className={`flex-1 min-w-[180px] py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'equipment' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Swords className="inline mr-2 w-4 h-4"/> Combat & Gear</button>
                   <button onClick={() => setActiveTab('abilities')} className={`flex-1 min-w-[180px] py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'abilities' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><ShieldCheck className="inline mr-2 w-4 h-4"/> Heroic Abilities</button>
                   <button onClick={() => setActiveTab('notes')} className={`flex-1 min-w-[180px] py-4 px-6 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'notes' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Scroll className="inline mr-2 w-4 h-4"/> Journal</button>
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
