import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllEncountersForParty,
  fetchEncounterDetails,
  fetchEncounterCombatants,
  createEncounter,
  deleteEncounter,
  duplicateEncounter,
  addCharacterToEncounter,
  addMonsterToEncounter,
  updateEncounter,
  updateCombatant,
  removeCombatant,
  swapInitiative,
  startEncounter,
  endEncounter,
  appendEncounterLog,
  nextRound,
} from '../../lib/api/encounters';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import { CharacterSheet } from '../character/CharacterSheet';
import { RandomTableManager } from '../tools/RandomTableManager';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import {
  PlusCircle, UserPlus, Trash2, Play, Square, Edit3, XCircle, Heart, Zap, Dice6, SkipForward,
  ArrowUpDown, Copy, List, RotateCcw, ShieldAlert, Skull, Dices, Search, User,
  Sword, Swords, RefreshCw, Crosshair, Target, Link as LinkIcon, Check, Hourglass, AlertCircle
} from 'lucide-react';
import { useDice } from '../dice/useDice';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';

// --- TYPES ---
export interface MonsterStats { HP?: number; SIZE?: string; ARMOR?: number; FEROCITY?: number; MOVEMENT?: number;[key: string]: unknown; }
export interface MonsterAttack { name: string; effects: unknown[]; description: string; roll_values: string; }
export interface MonsterData { id: string; name: string; category?: string; stats?: MonsterStats; attacks?: MonsterAttack[]; effectsSummary?: string; }
interface PartyEncounterViewProps { partyId: string; partyMembers: Character[]; isDM: boolean; }
interface EditableCombatantStats { current_hp: string; current_wp: string; initiative_roll?: string; }
interface AttackDescriptionRendererProps { description: string; attackName: string; }
interface CombatLogEntry {
  type: string;
  ts: number;
  round?: number;
  name?: string;
  delta?: number;
  attack?: { name?: string };
  roll?: number;
  attacker?: string;
  target?: string;
  damage?: number;
  message?: string;
}
interface InitiativeUpdate { id: string; initiative_roll: number; }
interface PersistedEncounterViewState {
  selectedEncounterId: string | null;
  viewMode: 'details' | 'create';
  selectedActorId: string | null;
  temporaryNotes: string;
  editedName: string;
  isEditingEncounter: boolean;
  swapSourceId: string | null;
}

const ENCOUNTER_VIEW_STATE_STORAGE_PREFIX = 'partyEncounterViewState';
const getEncounterViewStateStorageKey = (partyId: string) => `${ENCOUNTER_VIEW_STATE_STORAGE_PREFIX}:${partyId}`;

// --- HELPER: SYNC LOGIC ---
const getSiblings = (target: EncounterCombatant, allCombatants: EncounterCombatant[]) => {
  if (!target.monster_id) return [target];
  const baseName = target.display_name.replace(/ \(Act \d+\)$/, '');
  return allCombatants.filter(c =>
    c.monster_id === target.monster_id &&
    c.display_name.replace(/ \(Act \d+\)$/, '') === baseName
  );
};

// --- UTILS ---
const generateDeck = (totalNeeded: number, manualValues: number[]): number[] => {
  const deck: number[] = [];
  const decksCount = Math.ceil(Math.max(totalNeeded, 1) / 10);
  for (let d = 0; d < decksCount; d++) { for (let i = 1; i <= 10; i++) deck.push(i); }
  manualValues.forEach(val => { const index = deck.indexOf(val); if (index > -1) deck.splice(index, 1); });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
};

// --- SUB-COMPONENTS ---
const StatsTableView = ({ stats }: { stats: object }) => (
  <div className="grid grid-cols-3 gap-2 text-xs">
    {Object.entries(stats).map(([key, value]) => (
      <div key={key} className="bg-white/50 p-1 rounded border border-stone-200 flex flex-col items-center">
        <span className="font-bold text-stone-500 uppercase text-[10px] truncate w-full text-center" title={key}>{key.replace(/_/g, ' ')}</span>
        <span className="font-mono font-bold text-stone-800">{String(value)}</span>
      </div>
    ))}
  </div>
);

function AttackDescriptionRenderer({ description, attackName }: AttackDescriptionRendererProps) {
  const { toggleDiceRoller } = useDice();
  const diceRegex = /(\d*d\d+\s*[+-]?\s*\d*)/gi;
  const parts = description.split(diceRegex);
  return (<p className="text-stone-800 mt-1 leading-relaxed">{parts.map((part, index) => {
    if (part.match(diceRegex) && part.match(/[dD]/)) {
      return (<button key={index} className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${attackName} - Damage`, })}><Dice6 size={10} className="mr-1" />{part}</button>);
    }
    return <span key={index}>{part}</span>;
  })}</p>);
}

function MarkdownDiceRenderer({ text, contextLabel }: { text: string; contextLabel: string; }) {
  const { toggleDiceRoller } = useDice();
  if (!text) return null;
  const diceRegex = /(\d*d\d+\s*[+-]?\s*\d*)/gi;
  const parts = text.split(diceRegex);
  const applyMarkdown = (str: string) => { return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>'); };
  return (<div className="whitespace-pre-wrap leading-relaxed">{parts.map((part, index) => {
    if (part.match(diceRegex) && part.match(/[dD]/)) {
      return (<button key={index} className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${contextLabel} - Effects Roll`, })}><Dice6 size={10} className="mr-1" />{part}</button>);
    }
    const html = applyMarkdown(part);
    return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  })}</div>);
}

function LogEntry({ entry }: { entry: CombatLogEntry }) {
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (entry.type === 'round_advanced') return <div className="flex items-center justify-center gap-2 my-2"><div className="h-px bg-stone-300 w-10"></div><span className="font-serif font-bold text-stone-600 text-xs uppercase tracking-widest">Round {entry.round}</span><div className="h-px bg-stone-300 w-10"></div></div>;
  let content = null;
  switch (entry.type) {
    case 'turn_start': content = <span className="text-stone-600">Turn started: <strong>{entry.name}</strong></span>; break;
    case 'turn_end': content = <span className="text-stone-400 italic">Turn ended: {entry.name}</span>; break;
    case 'hp_change': {
      const isDamage = entry.delta < 0;
      content = (
        <span className={isDamage ? 'text-red-700' : 'text-green-700'}>
          <strong>{entry.name}</strong> {isDamage ? `took ${Math.abs(entry.delta)} DMG` : `healed ${entry.delta} HP`}
        </span>
      );
      break;
    }
    case 'wp_change': {
      const isSpend = entry.delta < 0;
      content = (
        <span className="text-blue-700">
          <strong>{entry.name}</strong> {isSpend ? `spent ${Math.abs(entry.delta)} WP` : `recovered ${entry.delta} WP`}
        </span>
      );
      break;
    }
    case 'monster_attack': content = (<div className="bg-orange-50 p-2 rounded border border-orange-100"><span className="text-orange-800 font-medium flex items-center gap-1"><Sword size={12} /> {entry.name}: {entry.attack?.name || 'Attack'}</span><div className="text-xs text-stone-600 mt-1 italic">Rolled {entry.roll}</div></div>); break;
    case 'attack_resolve': content = (<span className="text-stone-700"><Crosshair size={12} className="inline mr-1" /><strong>{entry.attacker}</strong> dealt {entry.damage} damage to <strong>{entry.target}</strong></span>); break;
    default: content = <span>{entry.message || JSON.stringify(entry)}</span>;
  }
  return (<div className="flex gap-2 text-sm py-1 border-b border-stone-100 last:border-0"><time className="text-xs text-stone-300 font-mono mt-0.5 w-10 shrink-0">{formatTime(entry.ts)}</time><div className="flex-grow">{content}</div></div>);
}

function CombatLogView({ log }: { log: CombatLogEntry[] }) {
  if (!log || log.length === 0) { return <p className="text-sm text-gray-500 mt-2 px-1">No events have been logged yet.</p>; }
  return (<div className="space-y-1 divide-y divide-gray-100">{log.slice().reverse().map((entry, index) => (<LogEntry key={index} entry={entry} />))}</div>);
}

// --- MODAL: WAIT / SWAP TURN ---
interface WaitTurnModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentActor: EncounterCombatant;
  allCombatants: EncounterCombatant[];
  onSwap: (targetId: string) => void;
}

function WaitTurnModal({ isOpen, onClose, currentActor, allCombatants, onSwap }: WaitTurnModalProps) {
  if (!isOpen) return null;

  const candidates = allCombatants
    .filter(c => c.id !== currentActor.id && !c.has_acted && (c.current_hp > 0 || c.monster_id))
    .sort((a, b) => (a.initiative_roll || 0) - (b.initiative_roll || 0));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <h3 className="text-lg font-bold font-serif flex items-center gap-2"><Hourglass className="w-5 h-5" /> Wait & Swap Initiative</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button>
        </div>
        <div className="p-4 bg-stone-50 overflow-y-auto">
          <p className="text-sm text-stone-600 mb-4">Select a creature who has not acted yet. You will swap Initiative Cards with them.</p>

          {candidates.length === 0 ? (
            <div className="text-center py-6 text-stone-400 italic">No valid targets available. Everyone else has acted.</div>
          ) : (
            <div className="space-y-2">
              {candidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSwap(c.id)}
                  className="w-full flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-10 bg-white border-2 border-stone-800 rounded flex items-center justify-center font-serif font-bold shadow-sm group-hover:border-purple-600 group-hover:text-purple-700">
                      {c.initiative_roll}
                    </div>
                    <div className="text-left">
                      <span className="block font-bold text-stone-800 group-hover:text-purple-900">{c.display_name}</span>
                      <span className="text-[10px] uppercase font-bold text-stone-400">{c.monster_id ? 'Monster' : 'Player'}</span>
                    </div>
                  </div>
                  <ArrowUpDown className="text-stone-300 group-hover:text-purple-500" size={18} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t bg-white flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// --- MODAL: ATTACK RESOLUTION ---
interface AttackResolutionModalProps { isOpen: boolean; onClose: () => void; attacker: EncounterCombatant; targets: EncounterCombatant[]; attackName?: string; onConfirm: (targetIds: string[], damage: number) => void; }

function AttackResolutionModal({ isOpen, onClose, attacker, targets, attackName, onConfirm }: AttackResolutionModalProps) {
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [damage, setDamage] = useState<string>('');
  const damageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTargetIds([]);
      damageInputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isAttackerMonster = !!attacker.monster_id;

  const uniqueTargets = useMemo(() => {
    const seen = new Set<string>();
    return targets.filter(t => {
      if (!t.monster_id) return true;
      const baseName = t.display_name.replace(/ \(Act \d+\)$/, '');
      const key = `${t.monster_id}:${baseName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [targets]);

  const sortedTargets = [...uniqueTargets].sort((a, b) => {
    const aIsMonster = !!a.monster_id; const bIsMonster = !!b.monster_id;
    if (isAttackerMonster) return (aIsMonster === bIsMonster) ? 0 : aIsMonster ? 1 : -1;
    return (aIsMonster === bIsMonster) ? 0 : aIsMonster ? -1 : 1;
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center"><div><h3 className="text-lg font-bold font-serif flex items-center gap-2"><Sword className="w-5 h-5 text-red-400" /> Resolve Action</h3><p className="text-xs text-stone-400">{attacker.display_name} is acting{attackName ? ` using ${attackName}` : ''}</p></div><button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button></div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-stone-500 uppercase mb-2 flex items-center gap-1"><Target size={12} /> Select Target(s)</h4>
            <p className="text-[11px] text-stone-500 mb-2">{selectedTargetIds.length} selected</p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {sortedTargets.map(t => {
                const isFoe = (isAttackerMonster && !t.monster_id) || (!isAttackerMonster && !!t.monster_id);
                const isDead = t.current_hp === 0;
                const displayName = t.monster_id ? t.display_name.replace(/ \(Act \d+\)$/, '') : t.display_name;
                const isSelected = selectedTargetIds.includes(t.id);
                return (
                  <button type="button" key={t.id} onClick={() => !isDead && setSelectedTargetIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} className={`w-full p-3 rounded border flex justify-between items-center cursor-pointer transition-all text-left ${isSelected ? 'ring-2 ring-red-500 border-red-500 bg-red-50' : 'bg-white border-stone-200 hover:border-stone-400'} ${isDead ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <div>
                      <span className={`font-bold ${isFoe ? 'text-red-700' : 'text-blue-700'}`}>{displayName}</span>
                      <div className="text-xs text-stone-500">{isFoe ? 'Enemy' : 'Ally'} • HP: {t.current_hp}/{t.max_hp}</div>
                    </div>
                    {isSelected && <Check className="text-red-600 w-5 h-5" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div><h4 className="text-xs font-bold text-stone-500 uppercase mb-2">Damage Amount</h4><div className="flex gap-2"><input ref={damageInputRef} type="number" placeholder="0" className="flex-grow p-3 text-lg font-bold border rounded shadow-sm focus:ring-2 focus:ring-red-500 outline-none" value={damage} onChange={(e) => setDamage(e.target.value)} /></div><p className="text-xs text-stone-400 mt-1">Enter negative number to heal.</p></div>
        </div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" icon={Sword} disabled={selectedTargetIds.length === 0 || !damage} onClick={() => { const parsed = parseInt(damage, 10); if (!isNaN(parsed)) onConfirm(selectedTargetIds, parsed); }}>Apply to {selectedTargetIds.length || 0}</Button></div>
      </div>
    </div>
  );
}

interface InitiativeDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  combatants: EncounterCombatant[];
  onApply: (updates: InitiativeUpdate[]) => void;
}

function InitiativeDrawModal({ isOpen, onClose, combatants, onApply }: InitiativeDrawModalProps) {
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isOpen) {
      const init: Record<string, string> = {};
      combatants.forEach((c) => {
        if (c.initiative_roll) init[c.id] = String(c.initiative_roll);
      });
      setManualValues(init);
    }
  }, [isOpen, combatants]);
  const handleDraw = () => {
    const updates: InitiativeUpdate[] = [];
    const taken: number[] = [];
    combatants.forEach((c) => {
      const val = parseInt(manualValues[c.id]);
      if (!isNaN(val)) {
        taken.push(val);
        updates.push({ id: c.id, initiative_roll: val });
      }
    });
    if (combatants.length - updates.length > 0) {
      const deck = generateDeck(combatants.length, taken);
      combatants.forEach((c) => {
        if (!updates.find((u) => u.id === c.id)) {
          const card = deck.pop();
          if (card) updates.push({ id: c.id, initiative_roll: card });
        }
      });
    }
    onApply(updates);
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center"><h3 className="text-lg font-bold font-serif flex items-center gap-2"><Dices className="w-5 h-5" /> Draw Initiative</h3><button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button></div>
        <div className="p-3 bg-blue-50 text-blue-900 text-sm border-b border-blue-100">Enter manual values for characters keeping their card (e.g. <strong>Veteran</strong> talent). Leave blank to draw from deck.</div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-2">{combatants.map((c) => (<div key={c.id} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm"><span className="font-bold text-stone-800">{c.display_name}</span><input type="number" min="1" max="10" placeholder="Auto" className={`w-20 px-2 py-1 text-center border rounded font-mono font-bold ${manualValues[c.id] ? 'bg-yellow-50 border-yellow-400 text-yellow-900' : 'bg-white'}`} value={manualValues[c.id] || ''} onChange={(e) => setManualValues(prev => ({ ...prev, [c.id]: e.target.value }))} /></div>))}</div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Dices} onClick={handleDraw}>Draw & Apply</Button></div>
      </div>
    </div>
  );
}

interface AddCombatantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  partyMembers?: Character[];
  availablePartyMembers: Character[];
  allMonsters: MonsterData[];
  onAddParty: (characterId: string) => void;
  onAddMonster: (monsterId: string, count: number, customName: string) => void;
}

function AddCombatantsModal({ isOpen, onClose, availablePartyMembers, allMonsters, onAddParty, onAddMonster }: AddCombatantsModalProps) {
  const [tab, setTab] = useState<'party' | 'monsters'>('party');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [monsterCount, setMonsterCount] = useState(1);
  const [monsterCustomName, setMonsterCustomName] = useState('');
  const monsterSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && tab === 'monsters') {
      monsterSearchInputRef.current?.focus();
    }
  }, [isOpen, tab]);
  if (!isOpen) return null;
  const filteredMonsters = allMonsters ? allMonsters.filter((m) => m.name.toLowerCase().includes(monsterSearch.toLowerCase()) || (m.category && m.category.toLowerCase().includes(monsterSearch.toLowerCase()))).slice(0, 20) : [];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-50 flex justify-between items-center"><h3 className="text-xl font-bold font-serif text-stone-800">Add Combatants</h3><button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={24} /></button></div>
        <div className="flex border-b"><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'party' ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('party')}>Party Members</button><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'monsters' ? 'bg-white border-b-2 border-orange-600 text-orange-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('monsters')}>Monsters & NPCs</button></div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50/50">
          {tab === 'party' && (<div className="space-y-2">{availablePartyMembers.length === 0 ? <p className="text-center text-stone-400 py-8 italic">All party members added.</p> : availablePartyMembers.map((char) => (<div key={char.id} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700"><User size={16} /></div><span className="font-bold text-stone-800">{char.name}</span></div><Button size="sm" onClick={() => onAddParty(char.id)} icon={PlusCircle}>Add</Button></div>))}</div>)}
          {tab === 'monsters' && (<div className="flex flex-col h-full gap-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" /><input ref={monsterSearchInputRef} type="text" placeholder="Search monsters..." className="w-full pl-9 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-orange-500 outline-none" value={monsterSearch} onChange={(e) => setMonsterSearch(e.target.value)} /></div><div className="flex-grow overflow-hidden flex flex-col md:flex-row gap-4"><div className="flex-1 overflow-y-auto border rounded bg-white divide-y">{filteredMonsters.map((m) => (<button type="button" key={m.id} className={`w-full p-3 cursor-pointer hover:bg-orange-50 text-left ${selectedMonsterId === m.id ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`} onClick={() => setSelectedMonsterId(m.id)}><p className="font-bold text-sm">{m.name}</p><p className="text-[10px] text-stone-500">{m.category}</p></button>))}</div>{selectedMonsterId && (<div className="w-full md:w-64 bg-white p-4 border rounded shadow-sm flex flex-col gap-3 flex-shrink-0 h-fit"><h4 className="font-bold text-stone-800 border-b pb-2">{allMonsters.find((m) => m.id === selectedMonsterId)?.name}</h4><div><label htmlFor="encounter-monster-count" className="text-[10px] font-bold text-stone-500 uppercase">Count</label><input id="encounter-monster-count" type="number" min="1" className="w-full p-1.5 border rounded text-sm" value={monsterCount} onChange={(e) => setMonsterCount(Math.max(1, parseInt(e.target.value) || 1))} /></div><div><label htmlFor="encounter-monster-name" className="text-[10px] font-bold text-stone-500 uppercase">Name (Opt)</label><input id="encounter-monster-name" type="text" placeholder="e.g. Boss" className="w-full p-1.5 border rounded text-sm" value={monsterCustomName} onChange={(e) => setMonsterCustomName(e.target.value)} /></div><Button className="w-full mt-2" onClick={() => { onAddMonster(selectedMonsterId, monsterCount, monsterCustomName); setMonsterCount(1); setMonsterCustomName(''); }} icon={PlusCircle}>Add to Fight</Button></div>)}</div></div>)}
        </div>
        <div className="p-3 border-t bg-stone-50 flex justify-end"><Button onClick={onClose} variant="secondary">Done</Button></div>
      </div>
    </div>
  );
}

interface CharacterSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  onRetry: () => void;
}

function CharacterSheetModal({ isOpen, onClose, title, isLoading, isReady, error, onRetry }: CharacterSheetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full h-[96vh] md:h-[92vh] max-w-[1400px] overflow-hidden border border-stone-300 flex flex-col">
        <div className="p-3 md:p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-base md:text-lg font-bold font-serif">Character Sheet</h3>
            <p className="text-xs text-stone-300">{title}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close character sheet">
            <XCircle size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f5f0e1]">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <p className="text-red-600 font-semibold">{error}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button variant="primary" onClick={onRetry}>Retry</Button>
              </div>
            </div>
          ) : isLoading || !isReady ? (
            <div className="h-full flex items-center justify-center gap-3 text-stone-600">
              <LoadingSpinner />
              <span className="font-medium">Loading character sheet...</span>
            </div>
          ) : (
            <CharacterSheet />
          )}
        </div>
      </div>
    </div>
  );
}

interface RollTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
}

function RollTablesModal({ isOpen, onClose, partyId }: RollTablesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[65] p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full h-[96vh] md:h-[92vh] max-w-[1400px] overflow-hidden border border-stone-300 flex flex-col">
        <div className="p-3 md:p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-base md:text-lg font-bold font-serif">Roll Tables</h3>
            <p className="text-xs text-stone-300">Open and use random tables during combat</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close roll tables">
            <XCircle size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-stone-50 p-4">
          <RandomTableManager partyId={partyId} allowedCategoryKeywords={['combat']} />
        </div>
      </div>
    </div>
  );
}

function ActiveCombatantSpotlight({ combatant, monsterData, currentAttack, onRollAttack, onEndTurn, onOpenAttackModal, onWait, onOpenCharacterSheet, isDM }: {
  combatant: EncounterCombatant,
  monsterData?: MonsterData,
  currentAttack?: MonsterAttack | null,
  onRollAttack: () => void,
  onEndTurn: () => void,
  onOpenAttackModal: () => void,
  onWait: () => void,
  onOpenCharacterSheet?: () => void,
  isDM: boolean
}) {
  const isMonster = !!combatant.monster_id;
  const canControl = isDM || (!isMonster);

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-blue-500 overflow-hidden mb-6 relative animate-in fade-in slide-in-from-top-2">
      <div className="bg-blue-600 text-white px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="bg-white text-blue-800 font-bold font-serif w-8 h-8 flex items-center justify-center rounded shadow">{combatant.initiative_roll ?? '-'}</div><div><h3 className="font-bold text-lg leading-none">{combatant.display_name}</h3><span className="text-xs text-blue-100 uppercase tracking-wider font-semibold">Current Turn</span></div></div>
        <div className="flex gap-2">
          {canControl && (
            <>
              {isDM && combatant.character_id && onOpenCharacterSheet && (
                <Button size="sm" variant="secondary" onClick={onOpenCharacterSheet} icon={User} title="Open character sheet">
                  Sheet
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={onWait} icon={Hourglass} title="Swap Initiative (Wait)">Wait</Button>
              <Button size="sm" variant="secondary" onClick={onEndTurn} icon={RotateCcw} title="End turn and automatically flip next card">End Turn</Button>
            </>
          )}
        </div>
      </div>
      <div className="p-4">
        {isMonster && monsterData ? (
          <div className="space-y-4">
            {monsterData.stats && <StatsTableView stats={monsterData.stats} />}
            {monsterData.effectsSummary && (<div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm"><span className="text-xs font-bold text-yellow-800 uppercase block mb-1">Traits & Effects</span><MarkdownDiceRenderer text={monsterData.effectsSummary} contextLabel={monsterData.name} /></div>)}
            <div className="bg-stone-50 rounded-lg border border-stone-200 p-3">
              {currentAttack ? (
                <div className="animate-in fade-in"><div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-stone-400 uppercase">Active Action (Rolled)</span></div><h4 className="font-bold text-lg text-red-700 mb-1">{currentAttack.name}</h4><AttackDescriptionRenderer description={currentAttack.description} attackName={currentAttack.name} /><div className="mt-3 pt-2 border-t border-stone-200 flex justify-end gap-2">{isDM && <Button size="sm" variant="outline" icon={Dices} onClick={onRollAttack}>Reroll</Button>}{canControl && <Button size="sm" variant="danger" icon={Crosshair} onClick={onOpenAttackModal}>Resolve / Apply</Button>}</div></div>
              ) : (<div className="text-center py-4"><p className="text-stone-500 text-sm mb-3 italic">No attack selected.</p>{isDM && <Button size="default" variant="danger" icon={Sword} onClick={onRollAttack} className="w-full justify-center shadow-md">Roll Monster Attack</Button>}</div>)}
            </div>
          </div>
        ) : (<div className="text-center py-6 text-stone-500 flex flex-col items-center gap-3"><p className="italic">It's a player's turn.</p>{canControl && <Button size="sm" variant="outline" icon={Crosshair} onClick={onOpenAttackModal}>Record Action / Damage</Button>}</div>)}
      </div>
    </div>
  );
}

interface DragonbaneCombatantCardProps {
  combatant: EncounterCombatant;
  isSelected: boolean;
  isSwapSource: boolean;
  onSelect: (id: string) => void;
  onSwapRequest: (id: string) => void;
  onFlipCard: (id: string, current: boolean) => void;
  onSaveStats: (id: string) => void;
  statsState: EditableCombatantStats;
  setStatsState: (value: EditableCombatantStats) => void;
  monsterData?: MonsterData;
  onRemove: (id: string) => void;
  isDM: boolean;
  myCharacterId: string | null;
  onSetInitiative: (id: string, val: number) => void;
  onOpenCharacterSheet: (combatant: EncounterCombatant) => void;
}

function DragonbaneCombatantCard({ combatant, isSelected, isSwapSource, onSelect, onSwapRequest, onFlipCard, onSaveStats, statsState, setStatsState, monsterData, onRemove, isDM, myCharacterId, onSetInitiative, onOpenCharacterSheet }: DragonbaneCombatantCardProps) {
  const isMonster = !!combatant.monster_id;
  const hasActed = combatant.has_acted || false;
  const initValue = combatant.initiative_roll ?? '-';
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = !isMonster && combatant.current_hp === 0;
  const hpVal = statsState.current_hp ?? '';
  const wpVal = statsState.current_wp ?? '';

  const isMyCharacter = myCharacterId && combatant.character_id === myCharacterId;
  const canEdit = isDM || isMyCharacter;
  const canOpenCharacterSheet = isDM && !!combatant.character_id;

  const handleInitClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const newInit = prompt("Set Initiative (1-10):", String(combatant.initiative_roll || ''));
    if (newInit !== null) {
      const val = parseInt(newInit);
      if (!isNaN(val) && val >= 1 && val <= 10) {
        onSetInitiative(combatant.id, val);
      }
    }
  };

  const maxWp = combatant.max_wp || combatant.character?.max_wp || 0;
  const showWp = !isMonster || maxWp > 0;

  return (
    <div className={`relative flex items-center gap-3 p-2 pr-3 rounded-lg border shadow-sm transition-all cursor-pointer overflow-hidden ${isDefeated ? 'bg-stone-200 border-stone-400 opacity-80' : hasActed ? 'bg-stone-100 border-stone-200 opacity-60 grayscale' : isSelected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-md'} ${isSwapSource ? 'ring-2 ring-purple-500 bg-purple-50 animate-pulse' : ''}`} onClick={() => onSelect(combatant.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(combatant.id); } }} role="button" tabIndex={0}>
      {isDefeated && (<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"><span className="text-stone-400/20 font-black text-4xl uppercase -rotate-12 select-none">Defeated</span></div>)}

      {/* Initiative Box */}
      <button
        type="button"
        onClick={handleInitClick}
        title={canEdit ? "Click to set Initiative" : "Initiative"}
        className={`relative z-10 flex-shrink-0 w-10 h-14 rounded flex items-center justify-center shadow-sm border transition-colors ${isDefeated ? 'bg-red-100 border-red-300 text-red-800' : hasActed ? 'bg-stone-200 border-stone-300 text-stone-400' : 'bg-white border-stone-800 text-stone-900'} ${canEdit ? 'hover:bg-blue-50 cursor-pointer' : ''}`}
      >
        <span className="font-serif font-bold text-xl">{initValue}</span>
      </button>

      <div className="relative z-10 flex-grow min-w-0">
        <div className="flex justify-between items-start mb-1">
          <div className="min-w-0 flex items-center gap-2">
            <p className={`font-bold truncate leading-tight ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{combatant.display_name}</p>
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">{isMonster ? (monsterData?.name || 'Monster') : 'Player'}</span>
            {isMonster && isDM && (
              <span title="HP synced across all action cards">
                <LinkIcon size={10} className="text-stone-300" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onPointerDownCapture={e => e.stopPropagation()}>
            <div className={`flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm ${combatant.current_hp === 0 ? 'ring-2 ring-red-500 border-red-500' : ''}`}><div className={`px-1.5 py-1 ${combatant.current_hp === 0 ? 'bg-red-100' : 'bg-stone-50'} border-r border-stone-200`}><Heart className={`w-3 h-3 ${combatant.current_hp === 0 ? 'text-red-500' : 'text-red-600'}`} /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" disabled={!canEdit} value={hpVal} onChange={(e) => setStatsState({ ...statsState, current_hp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} /><div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{combatant.max_hp}</div></div>
            {showWp && (
              <div className="flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm"><div className="px-1.5 py-1 bg-stone-50 border-r border-stone-200"><Zap className="w-3 h-3 text-blue-600" /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" disabled={!canEdit} value={wpVal} onChange={(e) => setStatsState({ ...statsState, current_wp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} />{maxWp > 0 && <div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{maxWp}</div>}</div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 h-6">
          {isDying && (<div className="flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100"><Skull size={10} className="text-red-500" /><span className="text-[10px] font-bold text-red-700 uppercase">Dying</span></div>)}
          {isDefeated && (<div className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-700 text-white"><Skull size={10} /><span className="text-[10px] font-bold uppercase">Defeated</span></div>)}
          <div className={`flex items-center gap-1 transition-opacity ${hasActed ? 'opacity-50 hover:opacity-100' : ''}`} onPointerDownCapture={e => e.stopPropagation()}>
            {!hasActed && !isDefeated && (<button className={`p-1 rounded transition-colors ${isSwapSource ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50'}`} title="Swap Initiative (Wait)" onClick={() => onSwapRequest(combatant.id)}><ArrowUpDown size={14} /></button>)}
            {!isDefeated && <button className={`p-1 rounded transition-colors ${hasActed ? 'text-stone-400 hover:bg-stone-200' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'}`} title={hasActed ? "Unflip Card" : "Flip Card (End Turn/Reaction)"} onClick={() => onFlipCard(combatant.id, hasActed)}>{hasActed ? <RotateCcw size={14} /> : <ShieldAlert size={14} />}</button>}
            {canOpenCharacterSheet && (
              <button
                className="p-1 rounded transition-colors text-stone-400 hover:text-blue-700 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCharacterSheet(combatant);
                }}
                title="Open Character Sheet"
              >
                <User size={14} />
              </button>
            )}
            {isDM && (<button className={`p-1 rounded transition-colors flex items-center gap-1 ${isDefeated ? 'bg-red-600 text-white hover:bg-red-700 px-2 shadow-sm' : 'text-stone-300 hover:text-red-600 hover:bg-red-50'}`} onClick={() => onRemove(combatant.id)} title="Remove from Encounter"><Trash2 size={14} />{isDefeated && <span className="text-[10px] font-bold uppercase">Remove Corpse</span>}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---

import { useAuth } from '../../contexts/useAuth';

// ...

export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    character: viewedSheetCharacter,
    isLoading: isCharacterSheetLoading,
    error: characterSheetError,
    fetchCharacter: fetchCharacterSheetData,
    setCharacter: setViewedSheetCharacter,
  } = useCharacterSheetStore();
  // const { toggleDiceRoller } = useDice();
  const previousViewedCharacterRef = useRef<Character | null>(null);
  const activeSheetRequestIdRef = useRef(0);
  const shouldRestoreCharacterContextRef = useRef(false);
  const hasHydratedPersistedStateRef = useRef(false);

  // Determine current user's character ID from the party members list
  const myCharacterId = useMemo(() => {
    if (!user || !partyMembers) return null;
    return partyMembers.find((m) => m.user_id === user.id)?.id;
  }, [user, partyMembers]);

  const handleSetInitiativeSingle = (id: string, val: number) => {
    updateCombatantMu.mutate({ id, updates: { initiative_roll: val } });
  };

  // STATE
  const [newEncounterName, setNewEncounterName] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'create'>('details');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const [isWaitModalOpen, setIsWaitModalOpen] = useState(false); // NEW: Wait Modal State
  const [isRollTablesModalOpen, setIsRollTablesModalOpen] = useState(false);
  const [isCharacterSheetModalOpen, setIsCharacterSheetModalOpen] = useState(false);
  const [showEncounterList, setShowEncounterList] = useState(false);
  const [isEditingEncounter, setIsEditingEncounter] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editingStats, setEditingStats] = useState<Record<string, EditableCombatantStats>>({});
  const [currentMonsterAttacks, setCurrentMonsterAttacks] = useState<Record<string, MonsterAttack | null>>({});
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [sheetCombatant, setSheetCombatant] = useState<EncounterCombatant | null>(null);
  const [temporaryNotes, setTemporaryNotes] = useState('');
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ id: number; text: string, type?: 'success' | 'error' } | null>(null);

  const { data: allEncounters, isLoading: loadingEnc } = useQuery<Encounter[]>({ queryKey: ['allEncounters', partyId], queryFn: () => fetchAllEncountersForParty(partyId), enabled: !!partyId });
  const { data: allMonsters } = useQuery<MonsterData[]>({
    queryKey: ['allMonsters'], queryFn: async () => {
      const monsters = await fetchAllMonsters();
      return monsters as MonsterData[];
    }
  });

  const currentEncounterId = useMemo(() => selectedEncounterId || allEncounters?.[0]?.id || null, [selectedEncounterId, allEncounters]);
  const { data: encounterDetails } = useQuery<Encounter | null>({ queryKey: ['encounterDetails', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)), enabled: !!currentEncounterId });
  const { data: combatantsData } = useQuery<EncounterCombatant[]>({ queryKey: ['encounterCombatants', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])), enabled: !!currentEncounterId });

  useEncounterRealtime(currentEncounterId);

  const monstersById = useMemo(() => {
    const map = new Map<string, MonsterData>();
    if (allMonsters) {
      allMonsters.forEach((m) => {
        if (m.id) map.set(m.id, m);
      });
    }
    return map;
  }, [allMonsters]);
  const combatants = useMemo(() => (combatantsData?.slice().sort((a, b) => { const ia = a.initiative_roll ?? 1000; const ib = b.initiative_roll ?? 1000; if (ia !== ib) return ia - ib; return (a.display_name ?? '').localeCompare(b.display_name ?? ''); }) || []), [combatantsData]);
  const activeCombatant = useMemo(() => combatants.find(c => c.id === selectedActorId), [combatants, selectedActorId]);
  const activeCombatantMonsterData = useMemo(() => activeCombatant?.monster_id ? monstersById.get(activeCombatant.monster_id) : null, [activeCombatant, monstersById]);
  const availableParty = useMemo(() => partyMembers.filter(m => !combatants.some(c => c.character_id === m.id)), [partyMembers, combatants]);
  const requestedSheetCharacterId = sheetCombatant?.character_id || null;
  const isRequestedCharacterLoaded = !!requestedSheetCharacterId && viewedSheetCharacter?.id === requestedSheetCharacterId;

  const restorePreviousCharacterContext = () => {
    const previousCharacter = previousViewedCharacterRef.current;
    previousViewedCharacterRef.current = null;
    shouldRestoreCharacterContextRef.current = false;
    setViewedSheetCharacter(previousCharacter ?? null);
  };

  const loadCharacterSheetForModal = (characterId: string, userId: string) => {
    shouldRestoreCharacterContextRef.current = false;
    const requestId = ++activeSheetRequestIdRef.current;

    void fetchCharacterSheetData(characterId, userId).finally(() => {
      if (activeSheetRequestIdRef.current !== requestId) return;
      if (shouldRestoreCharacterContextRef.current) {
        restorePreviousCharacterContext();
      }
    });
  };

  const handleOpenCharacterSheet = (combatant: EncounterCombatant) => {
    if (!combatant.character_id) return;
    if (!user?.id) {
      setFeedbackToast({ id: Date.now(), text: 'Cannot open sheet: user not authenticated.', type: 'error' });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    if (!isCharacterSheetModalOpen) {
      previousViewedCharacterRef.current = useCharacterSheetStore.getState().character;
    }

    setSheetCombatant(combatant);
    setIsCharacterSheetModalOpen(true);
    loadCharacterSheetForModal(combatant.character_id, user.id);
  };

  const handleRetryCharacterSheetLoad = () => {
    if (!requestedSheetCharacterId || !user?.id) return;
    loadCharacterSheetForModal(requestedSheetCharacterId, user.id);
  };

  const handleCloseCharacterSheetModal = () => {
    setIsCharacterSheetModalOpen(false);
    setSheetCombatant(null);

    shouldRestoreCharacterContextRef.current = true;
    if (!isCharacterSheetLoading) {
      restorePreviousCharacterContext();
    }
  };

  useEffect(() => {
    hasHydratedPersistedStateRef.current = false;
    if (!partyId || typeof window === 'undefined') {
      hasHydratedPersistedStateRef.current = true;
      return;
    }

    try {
      const stored = window.localStorage.getItem(getEncounterViewStateStorageKey(partyId));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedEncounterViewState>;
        if (typeof parsed.selectedEncounterId === 'string' || parsed.selectedEncounterId === null) setSelectedEncounterId(parsed.selectedEncounterId ?? null);
        if (parsed.viewMode === 'details' || parsed.viewMode === 'create') setViewMode(parsed.viewMode);
        if (typeof parsed.selectedActorId === 'string' || parsed.selectedActorId === null) setSelectedActorId(parsed.selectedActorId ?? null);
        if (typeof parsed.temporaryNotes === 'string') setTemporaryNotes(parsed.temporaryNotes);
        if (typeof parsed.editedName === 'string') setEditedName(parsed.editedName);
        if (typeof parsed.isEditingEncounter === 'boolean') setIsEditingEncounter(parsed.isEditingEncounter);
        if (typeof parsed.swapSourceId === 'string' || parsed.swapSourceId === null) setSwapSourceId(parsed.swapSourceId ?? null);
      }
    } catch (error) {
      console.warn('Failed to restore encounter view state:', error);
    } finally {
      hasHydratedPersistedStateRef.current = true;
    }
  }, [partyId]);

  useEffect(() => {
    if (!hasHydratedPersistedStateRef.current || !partyId || typeof window === 'undefined') return;

    const stateToPersist: PersistedEncounterViewState = {
      selectedEncounterId,
      viewMode,
      selectedActorId,
      temporaryNotes,
      editedName,
      isEditingEncounter,
      swapSourceId,
    };

    try {
      window.localStorage.setItem(getEncounterViewStateStorageKey(partyId), JSON.stringify(stateToPersist));
    } catch (error) {
      console.warn('Failed to persist encounter view state:', error);
    }
  }, [partyId, selectedEncounterId, viewMode, selectedActorId, temporaryNotes, editedName, isEditingEncounter, swapSourceId]);

  useEffect(() => {
    if (loadingEnc) return;
    if (!allEncounters || allEncounters.length === 0) {
      if (selectedEncounterId) setSelectedEncounterId(null);
      return;
    }
    if (selectedEncounterId && !allEncounters.some((enc) => enc.id === selectedEncounterId)) {
      setSelectedEncounterId(null);
    }
  }, [allEncounters, loadingEnc, selectedEncounterId]);

  useEffect(() => {
    if (selectedActorId && !combatants.some((combatant) => combatant.id === selectedActorId)) {
      setSelectedActorId(null);
    }
    if (swapSourceId && !combatants.some((combatant) => combatant.id === swapSourceId)) {
      setSwapSourceId(null);
    }
  }, [combatants, selectedActorId, swapSourceId]);

  useEffect(() => {
    return () => {
      if (previousViewedCharacterRef.current) {
        setViewedSheetCharacter(previousViewedCharacterRef.current);
        previousViewedCharacterRef.current = null;
      }
    };
  }, [setViewedSheetCharacter]);

  useEffect(() => { if (!loadingEnc && (!allEncounters || allEncounters.length === 0)) setViewMode('create'); }, [allEncounters, loadingEnc]);
  useEffect(() => { if (encounterDetails && !isEditingEncounter) setEditedName(encounterDetails.name); }, [encounterDetails, isEditingEncounter]);

  useEffect(() => {
    if (!combatants) return;
    const init: Record<string, EditableCombatantStats> = {};
    combatants.forEach(c => {
      const maxWp = c.max_wp || c.character?.max_wp || 0;
      init[c.id] = {
        current_hp: String(c.current_hp ?? 0),
        current_wp: maxWp > 0 ? String(c.current_wp ?? c.character?.current_wp ?? maxWp) : String(c.current_wp ?? ''),
        initiative_roll: String(c.initiative_roll || '')
      };
    });
    setEditingStats(init);
  }, [combatants]);

  // FIX: ROBUST AUTO-SELECTION
  useEffect(() => {
    if (encounterDetails?.status !== 'active') return;

    // 1. Find the correct "Next Up" actor (Lowest init, not acted, alive)
    const nextUp = combatants.find(c => !c.has_acted && !(c.monster_id && c.current_hp === 0));

    if (nextUp) {
      // 2. Determine current selection state
      const current = combatants.find(c => c.id === selectedActorId);

      // 3. Logic to switch
      const shouldSwitch =
        !selectedActorId ||
        !current ||
        current.has_acted || // Current just finished turn
        (current.monster_id && current.current_hp === 0) || // Current died
        // CRITICAL: If current selection is valid but has HIGHER init than nextUp (e.g. after swap), switch to nextUp
        (current.initiative_roll ?? 99) > (nextUp.initiative_roll ?? 99);

      if (shouldSwitch) {
        setSelectedActorId(nextUp.id);
      }
    } else {
      // End of round (everyone acted)
      setSelectedActorId(null);
    }
  }, [combatants, encounterDetails?.status, selectedActorId]);

  const createEncounterMu = useMutation({ mutationFn: (name: string) => createEncounter(partyId, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters'] }); setSelectedEncounterId(newEnc.id); setViewMode('details'); } });
  const deleteEncounterMu = useMutation({ mutationFn: deleteEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allEncounters'] }) });
  const duplicateEncounterMu = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => duplicateEncounter(id, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters'] }); setSelectedEncounterId(newEnc.id); } });
  const updateEncounterMu = useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Partial<Encounter> }) => updateEncounter(id, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails'] }); setIsEditingEncounter(false); } });
  const addCharacterMu = useMutation({ mutationFn: addCharacterToEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const addMonsterMu = useMutation({ mutationFn: addMonsterToEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const removeCombatantMu = useMutation({ mutationFn: removeCombatant, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const updateCombatantMu = useMutation({ mutationFn: ({ id, updates }: { id: string; updates: Partial<EncounterCombatant> }) => updateCombatant(id, updates), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });

  // FIX: Explicitly handle object destructuring for mutation
  const swapInitiativeMu = useMutation({
    mutationFn: (vars: { id1: string, id2: string }) => swapInitiative(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] });
      setSwapSourceId(null);
      setFeedbackToast({ id: Date.now(), text: 'Initiative Swapped!', type: 'success' });
      setTimeout(() => setFeedbackToast(null), 3000);
    },
    onError: () => {
      setFeedbackToast({ id: Date.now(), text: 'Failed to swap.', type: 'error' });
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  });

  const appendLogMu = useMutation({ mutationFn: (entry: CombatLogEntry) => appendEncounterLog(currentEncounterId!, entry), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterDetails'] }) });
  const startEncounterMu = useMutation({ mutationFn: () => startEncounter(currentEncounterId!), onSuccess: () => { queryClient.invalidateQueries(); setIsInitModalOpen(true); } });
  const endEncounterMu = useMutation({ mutationFn: endEncounter, onSuccess: () => queryClient.invalidateQueries() });
  const nextRoundMu = useMutation({ mutationFn: async () => { await nextRound(currentEncounterId!); if (combatantsData) await Promise.all(combatantsData.map(c => updateCombatant(c.id, { has_acted: false }))); }, onSuccess: () => { appendLogMu.mutate({ type: 'round_advanced', ts: Date.now(), round: (encounterDetails?.current_round ?? 0) + 1 }); setSelectedActorId(null); setIsInitModalOpen(true); queryClient.invalidateQueries(); } });

  const handleAddMonster = (id: string, count: number, customName: string) => {
    const m = id ? monstersById.get(id) : null;
    const ferocity = m?.stats?.FEROCITY || 1;
    const nameToUse = customName || m?.name || 'Monster';
    for (let i = 1; i <= count; i++) {
      const base = count > 1 ? `${nameToUse} ${i}` : nameToUse;
      for (let f = 1; f <= ferocity; f++) {
        addMonsterMu.mutate({ encounterId: currentEncounterId!, monsterId: id, customName: ferocity > 1 ? `${base} (Act ${f})` : base, initiativeRoll: null });
      }
    }
    setFeedbackToast({ id: Date.now(), text: `Added ${count}x ${nameToUse}` });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleSaveStats = (id: string) => {
    const stats = editingStats[id];
    const c = combatants.find(x => x.id === id);
    if (!stats || !c) return;
    const nh = parseInt(stats.current_hp); const nw = parseInt(stats.current_wp);
    const updates: Partial<EncounterCombatant> = {};
    let siblings = [c];
    if (c.monster_id && combatantsData) siblings = getSiblings(c, combatantsData);
    if (!isNaN(nh) && nh !== c.current_hp) { updates.current_hp = nh; appendLogMu.mutate({ type: 'hp_change', ts: Date.now(), who: id, name: c.display_name, delta: nh - (c.current_hp || 0) }); }
    if (!isNaN(nw) && nw !== c.current_wp) { updates.current_wp = nw; appendLogMu.mutate({ type: 'wp_change', ts: Date.now(), who: id, name: c.display_name, delta: nw - (c.current_wp || 0) }); }
    if (Object.keys(updates).length > 0) siblings.forEach(sib => updateCombatantMu.mutate({ id: sib.id, updates }));
  };

  /*
  const handleRemove = (id: string) => {
    const c = combatants.find(x => x.id === id);
    if (c && c.monster_id && combatantsData) { const siblings = getSiblings(c, combatantsData); siblings.forEach((sib: any) => removeCombatantMu.mutate(sib.id)); } else { removeCombatantMu.mutate(id); }
  };
  */

  const handleRollMonsterAttack = (id: string, m: MonsterData) => {
    if (!m.attacks?.length) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    const attack = m.attacks.find(a => a.roll_values.split(',').includes(String(roll)));
    if (attack) { setCurrentMonsterAttacks(p => ({ ...p, [id]: attack })); appendLogMu.mutate({ type: 'monster_attack', ts: Date.now(), who: id, name: m.name, roll, attack: { name: attack.name } }); }
  };

  const handleInitApply = async (updates: { id: string, initiative_roll: number }[]) => { await Promise.all(updates.map(u => updateCombatant(u.id, { ...u, has_acted: false }))); setIsInitModalOpen(false); queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }); appendLogMu.mutate({ type: 'generic', ts: Date.now(), message: 'Initiative drawn.' }); };

  const handleFlip = (id: string, current: boolean) => {
    updateCombatantMu.mutate({ id, updates: { has_acted: !current } });
  };

  const handleAttackConfirm = (targetIds: string[], dmg: number) => {
    if (!activeCombatant || targetIds.length === 0) return;
    const updatedCombatantIds = new Set<string>();
    const loggedTargets = new Set<string>();

    targetIds.forEach((targetId) => {
      const target = combatants.find(c => c.id === targetId);
      if (!target) return;

      const newHp = Math.max(0, target.current_hp - dmg);
      const updates: Partial<EncounterCombatant> = { current_hp: newHp };
      let siblings = [target];
      if (target.monster_id && combatantsData) siblings = getSiblings(target, combatantsData);

      siblings.forEach((sib) => {
        if (updatedCombatantIds.has(sib.id)) return;
        updatedCombatantIds.add(sib.id);
        updateCombatantMu.mutate({ id: sib.id, updates });
      });

      const targetName = target.monster_id ? target.display_name.replace(/ \(Act \d+\)$/, '') : target.display_name;
      if (!loggedTargets.has(targetName)) {
        loggedTargets.add(targetName);
        appendLogMu.mutate({ type: 'attack_resolve', ts: Date.now(), attacker: activeCombatant.display_name, target: targetName, damage: dmg });
      }
    });

    setIsAttackModalOpen(false);
  };

  const handleWaitConfirm = (targetId: string) => {
    if (!activeCombatant) return;
    swapInitiativeMu.mutate({ id1: activeCombatant.id, id2: targetId });
    setIsWaitModalOpen(false);
  }

  // REMOVED: if (!isDM) return <div ...> check to allow players to see the view.

  if (loadingEnc) return <LoadingSpinner />;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 sticky top-2 z-30">
        <div><h2 className="text-2xl font-bold font-serif text-stone-900">{encounterDetails ? encounterDetails.name : 'Encounters'}</h2>{encounterDetails && (<div className="flex items-center gap-3 text-sm mt-1"><span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider ${encounterDetails.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{encounterDetails.status}</span>{encounterDetails.status === 'active' && (<span className="font-mono font-bold text-stone-600">Round {encounterDetails.current_round}</span>)}</div>)}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {viewMode === 'details' && (
              <>
                {isDM && (
                  <>
                    <Button variant="ghost" icon={PlusCircle} onClick={() => setViewMode('create')}>New</Button>
                    <Button onClick={() => setShowEncounterList(true)} icon={List} variant="secondary">List</Button>
                    <Button onClick={() => setIsRollTablesModalOpen(true)} icon={Dices} variant="secondary">Tables</Button>
                  </>
                )}
                {encounterDetails?.status === 'planning' && isDM && <Button variant="primary" icon={Play} onClick={() => startEncounterMu.mutate()}>Start</Button>}
                {encounterDetails?.status === 'active' && isDM && (
                  <>
                    <Button variant="primary" icon={SkipForward} onClick={() => nextRoundMu.mutate()}>Next Round</Button>
                    <Button variant="outline" icon={Square} onClick={() => endEncounterMu.mutate(currentEncounterId!)}>End</Button>
                  </>
                )}
                {/* Player View: Simple Status Indicator if not DM */}
                {!isDM && encounterDetails?.status === 'active' && (
                  <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 animate-pulse">
                    <Swords size={12} /> COMBAT ACTIVE
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {feedbackToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in ${feedbackToast.type === 'error' ? 'bg-red-600' : 'bg-stone-900'}`}>
          <div className={`${feedbackToast.type === 'error' ? 'bg-red-800' : 'bg-green-500'} rounded-full p-1`}>
            {feedbackToast.type === 'error' ? <AlertCircle size={12} className="text-white" /> : <Check size={12} className="text-white" />}
          </div>
          <span className="font-medium text-sm">{feedbackToast.text}</span>
        </div>
      )}

      {viewMode === 'create' ? (
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md mx-auto text-center"><h3 className="text-xl font-bold mb-4">Start a New Encounter</h3><input className="w-full p-3 border rounded-lg mb-4" placeholder="Name" value={newEncounterName} onChange={e => setNewEncounterName(e.target.value)} /><div className="flex justify-center gap-3"><Button variant="primary" onClick={() => createEncounterMu.mutate(newEncounterName)}>Create</Button><Button variant="ghost" onClick={() => setViewMode('details')}>Cancel</Button></div></div>
      ) : !encounterDetails ? (
        <div className="text-center py-12 text-stone-400">No encounter selected.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-1 h-fit lg:sticky lg:top-24">
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden"><div className="p-3 bg-stone-50 border-b border-stone-200"><h4 className="font-bold text-stone-600 text-sm uppercase">Combat Log</h4></div><div className="h-64 lg:h-[calc(100vh-300px)] overflow-y-auto p-3 bg-white"><CombatLogView log={(encounterDetails.log as CombatLogEntry[] | undefined) || []} /></div></div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200"><textarea className="w-full text-sm p-2 border rounded bg-yellow-50/50 min-h-[100px]" placeholder={isDM ? "DM Notes..." : "Encounter Notes"} disabled={!isDM} value={temporaryNotes} onChange={e => setTemporaryNotes(e.target.value)} />{isDM && <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} icon={Edit3}>Edit Encounter</Button></div>}</div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {swapSourceId && (<div className="bg-purple-600 text-white p-3 rounded-lg shadow-md flex justify-between items-center animate-pulse"><span className="font-bold flex items-center gap-2"><ArrowUpDown /> Select swap target...</span><Button size="sm" variant="secondary" onClick={() => setSwapSourceId(null)}>Cancel</Button></div>)}
            {isEditingEncounter && (<div className="bg-white p-4 rounded-xl shadow mb-4 border border-blue-200"><h4 className="font-bold mb-2">Edit Details</h4><input className="w-full mb-2 p-2 border rounded" value={editedName} onChange={e => setEditedName(e.target.value)} /><div className="flex gap-2"><Button size="sm" onClick={() => updateEncounterMu.mutate({ id: currentEncounterId, updates: { name: editedName } })}>Save</Button><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(false)}>Cancel</Button></div></div>)}
            {encounterDetails.status === 'active' && activeCombatant && (
              <ActiveCombatantSpotlight
                combatant={activeCombatant}
                monsterData={activeCombatantMonsterData || undefined}
                currentAttack={currentMonsterAttacks[activeCombatant.id]}
                onRollAttack={() => activeCombatantMonsterData && handleRollMonsterAttack(activeCombatant.id, activeCombatantMonsterData as MonsterData)}
                onEndTurn={() => handleFlip(activeCombatant.id, false)}
                onOpenAttackModal={() => setIsAttackModalOpen(true)}
                onWait={() => setIsWaitModalOpen(true)}
                onOpenCharacterSheet={() => handleOpenCharacterSheet(activeCombatant)}
                isDM={isDM}
              />
            )}
            <div className="bg-stone-100/50 p-4 rounded-xl border border-stone-200">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-stone-500 uppercase tracking-wider text-sm">Initiative Track</h3><div className="flex gap-2">{isDM && encounterDetails.status === 'active' && <Button size="sm" variant="outline" icon={RefreshCw} onClick={() => setIsInitModalOpen(true)}>Re-Draw</Button>}{isDM && <Button size="sm" variant="outline" icon={UserPlus} onClick={() => setIsAddModalOpen(true)}>Add</Button>}</div></div>

              <div className="space-y-2">{combatants.length === 0 && <p className="text-center py-8 text-stone-400 italic">No combatants added.</p>}{combatants.map(c => (<DragonbaneCombatantCard key={c.id} combatant={c} monsterData={monstersById.get(c.monster_id || '')} isSelected={selectedActorId === c.id} isSwapSource={swapSourceId === c.id} onSelect={setSelectedActorId} onSwapRequest={(id: string) => swapSourceId ? swapInitiativeMu.mutate({ id1: swapSourceId, id2: id }) : setSwapSourceId(id)} onFlipCard={handleFlip} onSaveStats={handleSaveStats} onRemove={(id: string) => removeCombatantMu.mutate(id)} statsState={editingStats[c.id] || { current_hp: '', current_wp: '' }} setStatsState={(v: EditableCombatantStats) => setEditingStats(prev => ({ ...prev, [c.id]: v }))} isDM={isDM} myCharacterId={myCharacterId} onSetInitiative={handleSetInitiativeSingle} onOpenCharacterSheet={handleOpenCharacterSheet} />))}</div>
            </div>
          </div>
        </div>
      )}
      <AddCombatantsModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        partyMembers={partyMembers}
        availablePartyMembers={availableParty}
        allMonsters={allMonsters || []}
        onAddParty={(id: string) => addCharacterMu.mutate({ encounterId: currentEncounterId!, characterId: id, initiativeRoll: null })}
        onAddMonster={handleAddMonster}
      />
      <InitiativeDrawModal isOpen={isInitModalOpen} onClose={() => setIsInitModalOpen(false)} combatants={combatants} onApply={handleInitApply} />
      {isAttackModalOpen && activeCombatant && (
        <AttackResolutionModal
          isOpen={isAttackModalOpen}
          onClose={() => setIsAttackModalOpen(false)}
          attacker={activeCombatant}
          targets={combatants.filter(c => c.id !== activeCombatant.id)}
          attackName={activeCombatant.monster_id ? currentMonsterAttacks[activeCombatant.id]?.name : undefined}
          onConfirm={handleAttackConfirm}
        />
      )}
      {/* NEW: WAIT MODAL */}
      {isWaitModalOpen && activeCombatant && (
        <WaitTurnModal
          isOpen={isWaitModalOpen}
          onClose={() => setIsWaitModalOpen(false)}
          currentActor={activeCombatant}
          allCombatants={combatants}
          onSwap={handleWaitConfirm}
        />
      )}
      <CharacterSheetModal
        isOpen={isCharacterSheetModalOpen}
        onClose={handleCloseCharacterSheetModal}
        title={sheetCombatant?.display_name || 'Character'}
        isLoading={isCharacterSheetLoading}
        isReady={isRequestedCharacterLoaded}
        error={characterSheetError}
        onRetry={handleRetryCharacterSheetLoad}
      />
      <RollTablesModal
        isOpen={isRollTablesModalOpen}
        onClose={() => setIsRollTablesModalOpen(false)}
        partyId={partyId}
      />
      {showEncounterList && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl space-y-4 max-h-[80vh] flex flex-col"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">All Encounters</h3><Button variant="ghost" size="sm" onClick={() => setShowEncounterList(false)} icon={XCircle}>Close</Button></div><div className="overflow-y-auto space-y-2 border-t pt-4">{(allEncounters ?? []).map(enc => (<div key={enc.id} className={`flex items-center justify-between p-3 rounded-md ${currentEncounterId === enc.id ? 'bg-blue-100' : 'bg-gray-50'}`}><div><p className="font-semibold">{enc.name}</p><p className="text-sm text-gray-600 capitalize">Status: {enc.status}</p></div><div className="flex items-center gap-2"><Button size="sm" onClick={() => setSelectedEncounterId(enc.id)} disabled={currentEncounterId === enc.id}>Select</Button><Button size="sm" variant="outline" icon={Copy} onClick={() => duplicateEncounterMu.mutate({ id: enc.id, name: enc.name })}>Copy</Button><Button size="sm" variant="danger" icon={Trash2} onClick={() => deleteEncounterMu.mutate(enc.id)}>Del</Button></div></div>))}</div></div></div>)}
    </div>
  );
}
