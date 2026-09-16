import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Character, AttributeName } from '../../types/character';
import { calculateMovement } from '../../lib/movement';
import {
  HelpCircle, Swords, Bed, Award, ShieldCheck, Plus, Trash2, Minus,
  Bold, Italic, List, Pencil, Package, Sparkles, Book, UserSquare,
  Gem, Backpack, Scroll, AlertCircle, History, RotateCcw, Calculator, CornerDownLeft, Delete, Dices, MoreHorizontal
} from 'lucide-react';
import { SkillsModal } from './modals/SkillsModal';
import { SpellcastingView } from './SpellcastingView';
import { InventoryModal } from './InventoryModal';
import { EquipmentSection } from './EquipmentSection';
import { HeroicAbilitiesView } from './HeroicAbilitiesView';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { AdvancementSystem } from './AdvancementSystem';
import { DeathRollTracker } from './DeathRollTracker';
import { CharacterInjuriesPanel } from './CharacterInjuriesPanel';
import { StatusPanelView } from './StatusPanelView';
import { BioModal } from './modals/BioModal';
import { PlayerAidModal } from './modals/PlayerAidModal';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { PdfExportButton } from './PdfExportButton'; 
import { advanceCharacterInjuryRecovery, fetchCharacterInjuries } from '../../lib/api/injuries';
import { fetchSoloState, takeSoloRest, type SoloState } from '../../lib/api/solo';
import { useDice } from '../dice/useDice';

// --- HELPER COMPONENTS ---

const PaperSection = ({ title, children, className = "", action }: { title?: string, children: React.ReactNode, className?: string, action?: React.ReactNode }) => (
  <div className={`paper-section relative bg-white/40 border-2 border-stone-300 rounded-sm p-4 shadow-sm ${className}`}>
    {title && (
      <div className="paper-section-title absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a472a] text-[#e8d5b5] px-4 py-0.5 text-xs md:text-sm font-serif font-bold tracking-wider uppercase shadow-md whitespace-nowrap z-10 clip-path-banner">
        {title}
      </div>
    )}
    {action && <div className="absolute -top-4 right-3 z-20 md:right-4">{action}</div>}
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
    <AccessibleDialog
      onClose={onClose}
      title={`Modify ${statName}`}
      description={`Current: ${currentValue} / ${maxValue}`}
      icon={<Calculator size={20} />}
      size="sm"
      layer="nested"
      panelClassName="border-4 border-[#1a472a] bg-[#fdfbf7]"
      headerClassName="border-b-4 border-[#d4c5a3] bg-[#1a472a] text-[#e8d5b5]"
      titleClassName="font-serif uppercase tracking-wide text-[#e8d5b5]"
      bodyClassName="bg-[#fdfbf7] p-4 custom-scrollbar"
    >
        <div className="flex flex-col gap-4">
          
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
    </AccessibleDialog>
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
      <div className="stat-tracker-shell w-full bg-stone-100 rounded-md border border-stone-300 p-2 shadow-sm relative overflow-hidden group">
        
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
    <AccessibleDialog
      onClose={onClose}
      title={`Edit ${attribute}`}
      description={getHelperText(attribute)}
      size="sm"
      layer="nested"
      panelClassName="border-4 border-[#1a472a] bg-[#fdfbf7]"
      headerClassName="border-b-2 border-[#d4c5a3] bg-[#fdfbf7]"
      titleClassName="font-serif uppercase tracking-wide text-[#1a472a]"
      bodyClassName="bg-[#fdfbf7] p-6"
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="w-full">Cancel</Button>
          <Button variant="primary" onClick={() => onSave(newValue)} className="w-full">Confirm</Button>
        </div>
      )}
    >
        <div className="flex items-center justify-center gap-4 mb-6">
          <button type="button" aria-label={`Decrease ${attribute}`} onClick={() => setNewValue(prev => Math.max(1, prev - 1))} className="w-12 h-12 rounded border-2 border-stone-300 hover:border-[#1a472a] flex items-center justify-center text-2xl font-bold text-stone-600 hover:text-[#1a472a] bg-white transition-colors"><Minus size={20} /></button>
          <div className="w-20 h-20 rounded-full border-4 border-[#1a472a] bg-white flex items-center justify-center text-4xl font-serif font-bold text-[#1a472a] shadow-inner">{newValue}</div>
          <button type="button" aria-label={`Increase ${attribute}`} onClick={() => setNewValue(prev => Math.min(18, prev + 1))} className="w-12 h-12 rounded border-2 border-stone-300 hover:border-[#1a472a] flex items-center justify-center text-2xl font-bold text-stone-600 hover:text-[#1a472a] bg-white transition-colors"><Plus size={20} /></button>
        </div>
    </AccessibleDialog>
  );
};

interface AttributeCircleProps {
  name: string;
  value: number | undefined;
  conditionKey: string;
  conditionActive: boolean;
  onToggle: () => void;
  onRoll: () => void;
  onEdit: () => void;
  editEnabled: boolean;
  isSaving: boolean;
}

const AttributeCircle = ({ name, value, conditionKey, conditionActive, onToggle, onRoll, onEdit, editEnabled, isSaving }: AttributeCircleProps) => {
  const displayValue = value ?? 10;
  return (
    <div className="attribute-circle-shell flex flex-col items-center relative w-full max-w-[132px]">
      <div className="relative z-10 flex h-[108px] w-[108px] flex-col overflow-hidden rounded-full border-4 border-[#1a472a] bg-[#fdfbf7] shadow-lg transition-transform hover:scale-[1.03]">
        <span className="attribute-circle-name pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 bg-[#fdfbf7] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-stone-500 shadow-sm">
          {name}
        </span>

        <button
          type="button"
          onClick={onRoll}
          aria-label={`Roll ${name} attribute test. Target ${displayValue}`}
          title={`Roll ${name} (D20 ≤ ${displayValue})`}
          className="group/roll relative flex min-h-0 flex-[3] items-center justify-center bg-[#fdfbf7] pt-2 text-[#1a472a] transition-colors hover:bg-[#e8d5b5] focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a472a] touch-manipulation"
        >
          <span className="attribute-circle-value text-3xl font-serif font-bold transition-all duration-150 sm:group-hover/roll:scale-75 sm:group-hover/roll:opacity-0 group-focus-visible/roll:scale-75 group-focus-visible/roll:opacity-0">
            {displayValue}
          </span>
          <span className="pointer-events-none absolute bottom-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#1a472a]/75 sm:inset-0 sm:bottom-auto sm:translate-y-1 sm:flex-col sm:justify-center sm:pt-2 sm:opacity-0 sm:transition-all sm:duration-150 sm:group-hover/roll:translate-y-0 sm:group-hover/roll:opacity-100 group-focus-visible/roll:translate-y-0 group-focus-visible/roll:opacity-100">
            <Dices size={20} aria-hidden="true" />
            <span className="sm:mt-0.5">Roll</span>
          </span>
        </button>

        {editEnabled && <button
          type="button"
          onClick={onEdit}
          disabled={isSaving}
          aria-label={`Edit ${name} score`}
          title={`Edit ${name} score`}
          className="group/edit relative flex min-h-0 flex-1 items-center justify-center border-t-2 border-[#1a472a]/35 bg-[#efe4cf] text-[#5c4d3c] transition-colors hover:bg-[#d4c5a3] hover:text-[#1a472a] focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a472a] disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        >
          <Pencil size={14} className="transition-transform group-hover/edit:scale-110" aria-hidden="true" />
        </button>}
      </div>

      <button 
        type="button"
        onClick={onToggle}
        disabled={isSaving}
        className={`attribute-condition-button mt-2 w-full min-h-[44px] py-2 px-2 text-xs uppercase font-bold tracking-wider border rounded-sm transition-all shadow-sm touch-manipulation
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
  const [savedNoteSnapshot, setSavedNoteSnapshot] = useState<EditableCharacterNote | null>(null);
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
    setActiveNote(data); setSavedNoteSnapshot(data); setIsEditing(false); setShowPreview(false); loadNotes();
  };

  const noteIsDirty = Boolean(
    isEditing && activeNote && (
      activeNote.title !== (savedNoteSnapshot?.title || '')
      || activeNote.content !== (savedNoteSnapshot?.content || '')
    ),
  );

  const closeActiveNote = () => {
    if (noteIsDirty && !window.confirm('Discard unsaved changes to this journal entry?')) return;
    setActiveNote(null);
    setSavedNoteSnapshot(null);
    setIsEditing(false);
    setShowPreview(false);
  };

  const cancelNoteEditing = () => {
    if (!savedNoteSnapshot?.id) {
      closeActiveNote();
      return;
    }
    setActiveNote({ ...savedNoteSnapshot });
    setIsEditing(false);
    setShowPreview(false);
  };

  const handleDeleteNote = async (id: string) => {
    if (confirm("Delete note?")) { await supabase.from('notes').delete().eq('id', id); setActiveNote(null); loadNotes(); }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4 border-b-2 border-stone-200 pb-2 gap-3">
        <h4 className="font-serif font-bold text-stone-700 text-xl">Journal Entries</h4>
        <button onClick={() => { setSavedNoteSnapshot(null); setActiveNote({ title: '', content: '' }); setIsEditing(true); setShowPreview(false); }} className="text-[#1a472a] text-xs md:text-sm font-bold flex items-center gap-1.5 border border-[#1a472a] px-3 py-2 rounded hover:bg-[#1a472a] hover:text-white transition-colors min-h-[44px] touch-manipulation whitespace-nowrap"><Plus size={14} /> NEW ENTRY</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 custom-scrollbar">
        {notes.length === 0 && <div className="col-span-full text-center py-8 text-stone-400 italic">No notes written yet.</div>}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => { setSavedNoteSnapshot({ ...note }); setActiveNote({ ...note }); setIsEditing(false); setShowPreview(false); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSavedNoteSnapshot({ ...note });
                setActiveNote({ ...note });
                setIsEditing(false);
                setShowPreview(false);
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
        <AccessibleDialog
          onClose={closeActiveNote}
          title={isEditing ? (activeNote.id ? 'Edit journal entry' : 'New journal entry') : activeNote.title}
          description={noteIsDirty ? 'Unsaved changes' : undefined}
          size="lg"
          layer="nested"
          fullScreenMobile
          panelClassName="sm:h-[85dvh] border-4 border-[#1a472a] bg-[#fdfbf7]"
          headerClassName="border-b-2 border-[#d4c5a3] bg-[#fdfbf7]"
          titleClassName="font-serif text-[#1a472a]"
          bodyClassName="bg-[#fdfbf7]"
        >
             <div className="p-4 md:p-6 flex flex-col min-h-full">
                {isEditing ? (
                  <>
                    <input aria-label="Journal entry title" className="text-2xl font-serif font-bold bg-transparent border-b-2 border-[#1a472a] mb-4 outline-none text-[#1a472a] w-full" value={activeNote.title} onChange={e => setActiveNote({...activeNote, title: e.target.value})} placeholder="Title" />
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
                      <textarea ref={textareaRef} aria-label="Journal entry content" className="min-h-[45dvh] flex-1 p-4 bg-white resize-none outline-none font-serif text-stone-800 w-full border-x border-b border-stone-200" value={activeNote.content} onChange={e => setActiveNote({...activeNote, content: e.target.value})} />
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                       <Button variant="secondary" onClick={cancelNoteEditing}>Cancel</Button>
                       <Button variant="primary" onClick={handleSaveNote}>Save Entry</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-end border-b-2 border-stone-200 pb-2 mb-4">
                      <Button size="sm" variant="secondary" onClick={() => { setSavedNoteSnapshot(activeNote ? { ...activeNote } : null); setIsEditing(true); }} icon={Pencil}>Edit</Button>
                    </div>
                    <div className="flex-1 overflow-y-auto prose prose-stone max-w-none custom-scrollbar pr-2">
                       <MarkdownRenderer content={activeNote.content} />
                    </div>
                    <div className="text-right text-xs text-stone-400 mt-2 pt-2 border-t border-stone-100">{new Date(activeNote.created_at).toLocaleDateString()}</div>
                  </>
                )}
             </div>
        </AccessibleDialog>
      )}
    </div>
  );
};

// --- MAIN SHEET COMPONENT ---

export interface CharacterSheetProps {
  soloState?: SoloState;
  embedded?: boolean;
}

export function CharacterSheet({ soloState: providedSoloState, embedded = false }: CharacterSheetProps = {}) {
  const queryClient = useQueryClient();
  const { toggleDiceRoller } = useDice();
  const { character, fetchCharacter, adjustStat, toggleCondition, updateAttribute, performRest, isLoading, error, isSaving, activeEncounter, setActiveStatusMessage } = useCharacterSheetStore();

  const [showSpellcastingModal, setShowSpellcastingModal] = useState(false);
  const [showRestOptionsModal, setShowRestOptionsModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showAdvancementSystem, setShowAdvancementSystem] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [showPlayerAidModal, setShowPlayerAidModal] = useState(false);
  const [showSevereInjuriesModal, setShowSevereInjuriesModal] = useState(false);
  const [showSecondaryActions, setShowSecondaryActions] = useState(false);
  const [isAttributeEditMode, setIsAttributeEditMode] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<{name: AttributeName, value: number} | null>(null);
  const [healerPresent, setHealerPresent] = useState(false);
  const [soloRestCondition, setSoloRestCondition] = useState('');
  const [soloSafeLocation, setSoloSafeLocation] = useState(false);
  const [isSoloRestSaving, setIsSoloRestSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'equipment' | 'abilities' | 'notes'>('equipment');

  const characterInjuriesQuery = useQuery({
    queryKey: ['character-injuries', character?.party_id, character?.id],
    queryFn: () => {
      if (!character?.party_id || !character.id) {
        throw new Error('This character is not attached to a campaign.');
      }
      return fetchCharacterInjuries(character.party_id, character.id);
    },
    enabled: Boolean(character?.party_id && character?.id),
    staleTime: 0,
  });
  const detectedSoloStateQuery = useQuery({
    queryKey: ['solo-state', character?.party_id],
    queryFn: () => fetchSoloState(character!.party_id!),
    enabled: Boolean(!providedSoloState && character?.party_id),
    staleTime: 0,
    retry: false,
  });
  const soloState = providedSoloState || detectedSoloStateQuery.data;
  const isSoloHero = Boolean(
    soloState?.solo.enabled
    && character?.id
    && (soloState.solo.playerCharacterId === character.id || soloState.playerCharacter?.id === character.id),
  );
  const hasActiveSevereInjuries = Boolean(characterInjuriesQuery.data?.activeInjuries.length);
  const showSevereInjuriesShortcut = Boolean(
    character?.party_id && !characterInjuriesQuery.isLoading && !hasActiveSevereInjuries,
  );

  useEffect(() => {
    if (hasActiveSevereInjuries) setShowSevereInjuriesModal(false);
  }, [hasActiveSevereInjuries]);

  useEffect(() => {
    if (!showSevereInjuriesModal) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSevereInjuriesModal(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showSevereInjuriesModal]);

  if (isLoading) return <div className={`${embedded ? 'min-h-[24rem]' : 'min-h-screen'} flex items-center justify-center bg-[#f5f0e1]`}><LoadingSpinner size="lg" /><span className="ml-3 font-serif text-xl text-[#1a472a]">Unrolling Scroll...</span></div>;
  if (error) return <div className="p-4 text-center text-red-500 font-serif">Error loading scroll: {error}</div>;
  if (!character) return <div className="p-4 text-center">Character data not available.</div>;

  const activeStandardConditions = Object.entries(character.conditions || {})
    .filter(([key, active]) => active && ['exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened'].includes(key))
    .map(([key]) => key);
  const handleConditionToggle = (condition: keyof Character['conditions']) => { toggleCondition(condition); };
  const handleRest = async (type: 'round' | 'stretch' | 'shift') => {
    if (isSoloHero && soloState && character.party_id) {
      setIsSoloRestSaving(true);
      try {
        const result = await takeSoloRest(character.party_id, soloState.campaignRevision, {
          restType: type,
          useHealing: type === 'stretch' && healerPresent,
          conditionToClear: type === 'stretch' ? soloRestCondition || undefined : undefined,
          safeLocation: type === 'shift' && soloSafeLocation,
          context: 'Rest taken from the solo hero character sheet.',
        });
        setShowRestOptionsModal(false);
        setHealerPresent(false);
        setSoloRestCondition('');
        setSoloSafeLocation(false);
        setActiveStatusMessage(result.summary, 5000);
        await Promise.all([
          fetchCharacter(character.id, character.user_id),
          queryClient.invalidateQueries({ queryKey: ['solo-state', character.party_id] }),
          queryClient.invalidateQueries({ queryKey: ['character-injuries', character.party_id, character.id] }),
          queryClient.invalidateQueries({ queryKey: ['party', character.party_id] }),
        ]);
      } catch (restError) {
        setActiveStatusMessage(restError instanceof Error ? restError.message : 'Could not resolve the solo rest.', 5000);
      } finally {
        setIsSoloRestSaving(false);
      }
      return;
    }
    setShowRestOptionsModal(false);
    await performRest(type, type === 'stretch' ? healerPresent : undefined);
    setHealerPresent(false);
    if (type !== 'shift' || !character.party_id) return;
    try {
      const injuryState = await fetchCharacterInjuries(character.party_id, character.id);
      if (injuryState.activeInjuries.some((injury) => !injury.permanent)) {
        const result = await advanceCharacterInjuryRecovery(
          character.party_id,
          character.id,
          injuryState.campaignRevision,
        );
        setActiveStatusMessage(result.summary, 5000);
        await queryClient.invalidateQueries({
          queryKey: ['character-injuries', character.party_id, character.id],
        });
      }
    } catch (injuryError) {
      setActiveStatusMessage(
        injuryError instanceof Error ? injuryError.message : 'Could not advance severe-injury recovery.',
        5000,
      );
    }
  };
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
      await updateAttribute(editingAttribute.name, newValue);
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
    const roundAvailable = !isSoloHero || Boolean(soloState?.restState.available.round);
    const stretchAvailable = !isSoloHero || Boolean(soloState?.restState.available.stretch);
    const stretchReady = stretchAvailable && (!isSoloHero || activeStandardConditions.length === 0 || Boolean(soloRestCondition));
    return (
      <AccessibleDialog
        onClose={() => setShowRestOptionsModal(false)}
        title="Take a Rest"
        description="Choose a rest only after its listed amount of game time has passed."
        icon={<Bed size={20} />}
        size="md"
        closeDisabled={isSoloRestSaving}
        panelClassName="border-4 border-[#1a472a] bg-[#fdfbf7]"
        headerClassName="border-b-2 border-stone-200 bg-[#fdfbf7]"
        titleClassName="font-serif text-2xl text-[#1a472a]"
        bodyClassName="bg-[#fdfbf7] p-4 sm:p-6"
        footer={<Button variant="secondary" onClick={() => setShowRestOptionsModal(false)} disabled={isSoloRestSaving} className="w-full">Cancel</Button>}
      >
            <div className="space-y-3 font-serif">
              {isSoloHero && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  Solo rest is resolved by the campaign rules engine. Recovery, rest availability, threat, time, equipment durations, and injuries update together.
                </div>
              )}
              <button type="button" onClick={() => handleRest('round')} disabled={!roundAvailable || isSoloRestSaving} className="w-full text-left p-3 min-h-[56px] hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50">
                <div className="font-bold text-[#1a472a]">Round Rest (10 seconds / one action)</div>
                <div className="text-sm text-stone-600">Recover 1d6 WP. No HP recovery.{isSoloHero && !roundAvailable ? ' Already used this shift.' : ''}</div>
              </button>
              <div className="p-3 border border-stone-300 rounded group disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <button type="button" onClick={() => handleRest('stretch')} disabled={(character?.current_hp ?? 0) <= 0 || !stretchReady || isSoloRestSaving} className="w-full text-left min-h-[48px] hover:bg-[#e8d5b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation">
                  <div className="font-bold text-[#1a472a]">Stretch Rest (15 min)</div>
                  <div className="text-sm text-stone-600">Heal 1d6 HP, recover 1d6 WP, and clear one condition.{isSoloHero && !stretchAvailable ? ' Already used this shift.' : ''}</div>
                </button>
                <label className="flex items-center gap-2 mt-2 text-sm pointer-events-auto min-h-[40px]">
                  <input type="checkbox" className="accent-[#1a472a] w-5 h-5" checked={healerPresent} onChange={e => setHealerPresent(e.target.checked)} />
                  {isSoloHero ? 'Use Healing skill (success heals 2d6 HP)' : 'Healer Present?'}
                </label>
                {isSoloHero && activeStandardConditions.length > 0 && (
                  <label className="mt-2 block text-sm font-bold text-stone-700">Condition to clear
                    <select value={soloRestCondition} onChange={(event) => setSoloRestCondition(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="">Choose an active condition...</option>
                      {activeStandardConditions.map((condition) => <option key={condition} value={condition}>{condition.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {isSoloHero && (
                <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <input id="character-sheet-solo-safe-location" aria-label="Confirm safe location for Solo Shift Rest" type="checkbox" checked={soloSafeLocation} onChange={(event) => setSoloSafeLocation(event.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1a472a]" />
                  <span><strong>Safe location confirmed</strong><span className="block text-xs">Required before taking a Shift Rest.</span></span>
                </div>
              )}
              <button type="button" onClick={() => handleRest('shift')} disabled={(isSoloHero && !soloSafeLocation) || isSoloRestSaving} className="w-full text-left p-3 min-h-[56px] hover:bg-[#e8d5b5] border border-stone-300 rounded group transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50">
                <div className="font-bold text-[#1a472a]">Shift Rest (6 hours)</div>
                <div className="text-sm text-stone-600">Full HP/WP and conditions. Advances temporary severe injuries by one shift.</div>
              </button>
            </div>
      </AccessibleDialog>
    );
  };

  const openSecondaryAction = (action: () => void) => {
    setShowSecondaryActions(false);
    action();
  };

  const openGeneralRoll = () => toggleDiceRoller({
    initialDice: ['d20'],
    rollMode: 'generic',
    description: 'General D20 Roll',
  });

  return (
    <div className={`character-sheet-root ${embedded ? 'min-h-0' : 'min-h-screen md:p-6'} bg-[#f5f0e1] text-stone-800 p-0 font-sans overflow-x-hidden`}>
      <div className={`character-sheet-shell max-w-7xl mx-auto bg-[#fdfbf7] border-x-0 md:border-2 border-[#d4c5a3] relative ${embedded ? 'shadow-none md:border-0' : 'shadow-2xl'}`}>
        
        {/* HEADER */}
        <div className="character-sheet-header bg-[#1a472a] text-[#e8d5b5] p-4 flex flex-col md:flex-row justify-between items-center border-b-4 border-[#d4c5a3] relative">
          <div className="character-sheet-brand z-10 flex flex-col w-full md:w-auto text-center md:text-left">
            <h1 className="character-sheet-brand-title text-4xl md:text-5xl font-serif font-black tracking-tighter uppercase drop-shadow-md">Dragonbane</h1>
            <div className="character-sheet-meta flex flex-wrap justify-center md:justify-start gap-2 md:gap-4 mt-2 text-xs md:text-sm font-serif tracking-wide opacity-90">
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">{character.kin}</span>
              <span className="hidden md:inline">•</span>
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">{character.profession}</span>
              <span className="hidden md:inline">•</span>
              <span className="bg-[#0f2e1b] px-2 py-0.5 rounded">Age {character.age}</span>
            </div>
          </div>

          <div className="character-sheet-actions z-10 mt-4 hidden w-full md:mt-0 md:block md:w-auto">
            <div className="character-sheet-action-row flex gap-2 px-1">
              {[
                { label: 'Roll', icon: Dices, action: openGeneralRoll },
                { label: 'Skills', icon: Book, action: () => setShowSkillsModal(true) },
                { label: 'Rest', icon: Bed, action: () => setShowRestOptionsModal(true) },
                { label: 'Inventory', icon: Package, action: () => setShowInventoryModal(true) },
                ...(canCastSpells() ? [{ label: 'Spells', icon: Sparkles, action: () => setShowSpellcastingModal(true) }] : []),
              ].map(btn => (
                <button type="button" key={btn.label} onClick={btn.action} className="character-sheet-action-button flex min-h-14 w-16 flex-col items-center justify-center rounded border border-[#4a8a62] bg-[#2c5e3f] text-[#e8d5b5] shadow-sm transition-colors hover:bg-[#3a7a52] active:bg-[#1a472a] touch-manipulation">
                  <btn.icon size={18} />
                  <span className="mt-1 text-xs font-bold uppercase">{btn.label}</span>
                </button>
              ))}
              <button type="button" onClick={() => setShowSecondaryActions((current) => !current)} aria-expanded={showSecondaryActions} className="character-sheet-action-button flex min-h-14 w-16 flex-col items-center justify-center rounded border border-[#4a8a62] bg-[#2c5e3f] text-[#e8d5b5] shadow-sm transition-colors hover:bg-[#3a7a52] touch-manipulation">
                <MoreHorizontal size={18} /><span className="mt-1 text-xs font-bold uppercase">More</span>
              </button>
            </div>
          </div>
          {showSecondaryActions && (
            <div className="fixed bottom-16 right-3 z-50 grid w-64 grid-cols-2 gap-2 rounded-lg border border-stone-300 bg-[#fdfbf7] p-3 text-stone-800 shadow-2xl md:absolute md:bottom-auto md:right-4 md:top-[calc(100%-0.5rem)]" role="menu" aria-label="More character actions">
              <button type="button" role="menuitem" onClick={() => openSecondaryAction(() => setShowBioModal(true))} className="flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-bold hover:bg-stone-100"><UserSquare size={18} /> Bio</button>
              <button type="button" role="menuitem" onClick={() => openSecondaryAction(() => setShowAdvancementSystem(true))} className="flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-bold hover:bg-stone-100"><Award size={18} /> Advancement</button>
              <button type="button" role="menuitem" onClick={() => openSecondaryAction(() => setShowPlayerAidModal(true))} className="flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-bold hover:bg-stone-100"><HelpCircle size={18} /> Player Aid</button>
              <button type="button" role="menuitem" onClick={() => { setIsAttributeEditMode((current) => !current); setShowSecondaryActions(false); }} className="flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-bold hover:bg-stone-100"><Pencil size={18} /> {isAttributeEditMode ? 'Stop editing' : 'Edit attributes'}</button>
              <div className="col-span-2"><PdfExportButton character={character} /></div>
            </div>
          )}
        </div>

        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#d4c5a3] bg-[#fdfbf7]/95 px-3 py-2 shadow-sm backdrop-blur md:hidden">
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-bold text-[#1a472a]">{character.name}</div>
            <div className="truncate text-xs text-stone-600">{activeStandardConditions.length ? activeStandardConditions.join(' • ') : 'No active conditions'}</div>
          </div>
          <div className="flex shrink-0 gap-2 text-sm font-bold">
            <span className="rounded bg-red-100 px-2 py-1 text-red-800">HP {currentHP}/{maxHP}</span>
            <span className="rounded bg-teal-100 px-2 py-1 text-teal-800">WP {currentWP}/{maxWP}</span>
          </div>
        </div>

        {/* MAIN PAPER AREA */}
        <div className="character-sheet-main space-y-6 bg-[#f7f0df] p-3 pb-24 md:space-y-8 md:p-8">
          
          {/* NAME & VITALS ROW */}
          <div className="character-sheet-name-vitals grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-end">
             <div className="character-sheet-name-block md:col-span-5 border-b-2 border-stone-400 pb-2 text-center md:text-left">
                <p className="block text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Character Name</p>
                <div className="text-3xl md:text-4xl font-serif font-bold text-[#1a472a] leading-none">{character.name}</div>
             </div>
             
             <div className="character-sheet-vitals-strip md:col-span-7 flex flex-wrap gap-2 md:gap-4 justify-center md:justify-end">
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
          <div className="character-sheet-attributes relative py-4 md:py-6">
             <div className="hidden md:block absolute top-1/2 left-0 w-full h-2 bg-[#1a472a] opacity-20 -z-0 rounded-full"></div>
             <div className="character-sheet-attributes-grid relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-8 gap-x-4 justify-items-center">
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
                      onRoll={() => toggleDiceRoller({
                        initialDice: ['d20'],
                        rollMode: 'skillCheck',
                        targetValue: character.attributes?.[attr as AttributeName] ?? 10,
                        description: `${attr} Attribute Test`,
                        requiresBane: Boolean(character.conditions?.[cond as keyof Character['conditions']]),
                      })}
                      onEdit={() => setEditingAttribute({
                        name: attr as AttributeName, 
                        value: character.attributes?.[attr as AttributeName] || 10 
                      })}
                      editEnabled={isAttributeEditMode}
                      isSaving={isSaving}
                   />
                ))}
             </div>
          </div>

          {/* TOP SECTION: 3 Columns */}
          <div className="character-sheet-top-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
            <div className="space-y-4 md:col-span-2 md:space-y-6 xl:col-span-1">
               <PaperSection
                 title="Vitals & Combat"
                 action={showSevereInjuriesShortcut ? (
                   <button
                     type="button"
                     onClick={() => setShowSevereInjuriesModal(true)}
                     aria-label="Open severe injuries"
                     title="Severe injuries"
                     className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#1a472a] bg-[#fdfbf7] text-[#1a472a] shadow-md transition-colors hover:bg-[#e8d5b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a472a]"
                   >
                     <Book size={18} aria-hidden="true" />
                   </button>
                 ) : undefined}
               >
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
                        <DeathRollTracker character={character} soloMode={isSoloHero} soloState={isSoloHero ? soloState : undefined} />
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
               {character.party_id && hasActiveSevereInjuries && (
                 <PaperSection title="Severe Injuries">
                   <CharacterInjuriesPanel
                     campaignId={character.party_id}
                     characterId={character.id}
                     inActiveCombat={Boolean(activeEncounter)}
                     onStatus={(message) => setActiveStatusMessage(message, 5000)}
                   />
                 </PaperSection>
               )}
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
             <div className="character-sheet-lower-panel bg-white border-2 border-stone-300 flex flex-col rounded-sm shadow-md">
                <div className="character-sheet-tabs relative flex border-b-2 border-stone-300 bg-stone-100 overflow-x-auto after:pointer-events-none after:sticky after:right-0 after:w-8 after:shrink-0 after:bg-gradient-to-l after:from-stone-200 after:to-transparent md:after:hidden">
                   <button onClick={() => setActiveTab('equipment')} className={`character-sheet-tab-button flex-1 min-w-[150px] py-3 px-4 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'equipment' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Swords className="inline mr-2 w-4 h-4"/> Combat & Gear</button>
                   <button onClick={() => setActiveTab('abilities')} className={`character-sheet-tab-button flex-1 min-w-[150px] py-3 px-4 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'abilities' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><ShieldCheck className="inline mr-2 w-4 h-4"/> Heroic Abilities</button>
                   <button onClick={() => setActiveTab('notes')} className={`character-sheet-tab-button flex-1 min-w-[150px] py-3 px-4 font-serif font-bold text-sm md:text-base uppercase tracking-wide whitespace-nowrap touch-manipulation ${activeTab === 'notes' ? 'bg-white text-[#1a472a] border-b-4 border-[#1a472a] -mb-0.5' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200'}`}><Scroll className="inline mr-2 w-4 h-4"/> Journal</button>
                </div>
                <div className="character-sheet-tab-panel p-4 md:p-6 flex-1 bg-white/80">
                   {activeTab === 'equipment' && <EquipmentSection character={character} />}
                   {activeTab === 'abilities' && <HeroicAbilitiesView />}
                   {activeTab === 'notes' && <CharacterNotesSection character={character} />}
                </div>
             </div>
          </div>
        </div>

        <div className="h-4 bg-[#1a472a] border-t-4 border-[#d4c5a3]"></div>
        <nav className="sticky bottom-0 z-40 grid grid-cols-5 border-t border-[#d4c5a3] bg-[#1a472a] pb-[max(0.25rem,env(safe-area-inset-bottom))] text-[#e8d5b5] shadow-[0_-4px_16px_rgba(0,0,0,0.2)] md:hidden" aria-label="Character actions">
          {[
            { label: 'Roll', icon: Dices, action: openGeneralRoll },
            { label: 'Skills', icon: Book, action: () => setShowSkillsModal(true) },
            { label: 'Inventory', icon: Package, action: () => setShowInventoryModal(true) },
            { label: 'Rest', icon: Bed, action: () => setShowRestOptionsModal(true) },
            { label: 'More', icon: MoreHorizontal, action: () => setShowSecondaryActions((current) => !current) },
          ].map((action) => (
            <button key={action.label} type="button" onClick={action.action} className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-xs font-bold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e8d5b5]">
              <action.icon size={19} aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          ))}
        </nav>
        {showBioModal && <BioModal onClose={() => setShowBioModal(false)} />}
        {showSkillsModal && <SkillsModal onClose={() => setShowSkillsModal(false)} />}
        {showSpellcastingModal && <SpellcastingView onClose={() => setShowSpellcastingModal(false)} />}
        {showInventoryModal && <InventoryModal onClose={() => setShowInventoryModal(false)} />}
        {showAdvancementSystem && <AdvancementSystem character={character} onClose={() => { setShowAdvancementSystem(false); if (character?.id && character?.user_id) fetchCharacter(character.id, character.user_id); }} />}
        {showPlayerAidModal && <PlayerAidModal onClose={() => setShowPlayerAidModal(false)} />}
        {showSevereInjuriesModal && character.party_id && (
          <AccessibleDialog
            onClose={() => setShowSevereInjuriesModal(false)}
            title="Severe Injuries"
            icon={<Book size={20} />}
            size="lg"
            layer="nested"
            panelClassName="border-4 border-[#1a472a] bg-[#fdfbf7]"
            headerClassName="border-b-4 border-[#d4c5a3] bg-[#1a472a] text-[#e8d5b5]"
            titleClassName="font-serif uppercase tracking-wide text-[#e8d5b5]"
            bodyClassName="bg-[#fdfbf7] p-4 md:p-6"
          >
            <CharacterInjuriesPanel
              campaignId={character.party_id}
              characterId={character.id}
              inActiveCombat={Boolean(activeEncounter)}
              onStatus={(message) => setActiveStatusMessage(message, 5000)}
            />
          </AccessibleDialog>
        )}
        {editingAttribute && (<AttributeEditModal attribute={editingAttribute.name} value={editingAttribute.value} onClose={() => setEditingAttribute(null)} onSave={handleAttributeUpdate} />)}
        {renderRestModal()}
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
