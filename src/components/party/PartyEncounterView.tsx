import React, { useState, useMemo, useEffect } from 'react';
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
// IMPORT THE HOOK HERE
import { useEncounterRealtime } from '../../hooks/useEncounterRealtime';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import {
  PlusCircle, UserPlus, Trash2, Play, Square, Edit3, XCircle, Heart, Zap, Dice6, SkipForward, ArrowUpDown, Copy, List, ArrowLeft, RotateCcw, ShieldAlert, Skull, Dices, Search, User, Sword, RefreshCw, Crosshair, Target, Link as LinkIcon
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';

// --- TYPES ---
export interface MonsterStats { HP?: number; SIZE?: string; ARMOR?: number; FEROCITY?: number; MOVEMENT?: number; [key: string]: any; }
export interface MonsterAttack { name: string; effects: any[]; description: string; roll_values: string; }
export interface MonsterData { id: string; name: string; category?: string; stats?: MonsterStats; attacks?: MonsterAttack[]; effectsSummary?: string; }
interface PartyEncounterViewProps { partyId: string; partyMembers: Character[]; isDM: boolean; }
interface EditableCombatantStats { current_hp: string; current_wp: string; initiative_roll?: string; }
interface AttackDescriptionRendererProps { description: string; attackName: string; }

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
  let deck: number[] = [];
  const decksCount = Math.ceil(Math.max(totalNeeded, 1) / 10);
  for (let d = 0; d < decksCount; d++) { for (let i = 1; i <= 10; i++) deck.push(i); }
  manualValues.forEach(val => { const index = deck.indexOf(val); if (index > -1) deck.splice(index, 1); });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
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
      return (<button key={index} className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${attackName} - Damage`, })}><Dice6 size={10} className="mr-1"/>{part}</button>); 
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
      return (<button key={index} className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${contextLabel} - Effects Roll`, })}><Dice6 size={10} className="mr-1"/>{part}</button>); 
    } 
    const html = applyMarkdown(part); 
    return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />; 
  })}</div>); 
}

function LogEntry({ entry }: { entry: any }) { 
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
  if (entry.type === 'round_advanced') return <div className="flex items-center justify-center gap-2 my-2"><div className="h-px bg-stone-300 w-10"></div><span className="font-serif font-bold text-stone-600 text-xs uppercase tracking-widest">Round {entry.round}</span><div className="h-px bg-stone-300 w-10"></div></div>;
  let content = null; 
  switch (entry.type) { 
    case 'turn_start': content = <span className="text-stone-600">Turn started: <strong>{entry.name}</strong></span>; break; 
    case 'turn_end': content = <span className="text-stone-400 italic">Turn ended: {entry.name}</span>; break; 
    case 'hp_change': const isDamage = entry.delta < 0; content = (<span className={isDamage ? 'text-red-700' : 'text-green-700'}><strong>{entry.name}</strong> {isDamage ? `took ${Math.abs(entry.delta)} DMG` : `healed ${entry.delta} HP`}</span>); break; 
    case 'wp_change': const isSpend = entry.delta < 0; content = (<span className="text-blue-700"><strong>{entry.name}</strong> {isSpend ? `spent ${Math.abs(entry.delta)} WP` : `recovered ${entry.delta} WP`}</span>); break; 
    case 'monster_attack': content = (<div className="bg-orange-50 p-2 rounded border border-orange-100"><span className="text-orange-800 font-medium flex items-center gap-1"><Sword size={12}/> {entry.name}: {entry.attack?.name || 'Attack'}</span><div className="text-xs text-stone-600 mt-1 italic">Rolled {entry.roll}</div></div>); break; 
    case 'attack_resolve': content = (<span className="text-stone-700"><Crosshair size={12} className="inline mr-1"/><strong>{entry.attacker}</strong> dealt {entry.damage} damage to <strong>{entry.target}</strong></span>); break;
    default: content = <span>{entry.message || JSON.stringify(entry)}</span>; 
  } 
  return (<div className="flex gap-2 text-sm py-1 border-b border-stone-100 last:border-0"><time className="text-xs text-stone-300 font-mono mt-0.5 w-10 shrink-0">{formatTime(entry.ts)}</time><div className="flex-grow">{content}</div></div>); 
}

function CombatLogView({ log }: { log: any[] }) { 
  if (!log || log.length === 0) { return <p className="text-sm text-gray-500 mt-2 px-1">No events have been logged yet.</p>; } 
  return (<div className="space-y-1 divide-y divide-gray-100">{log.slice().reverse().map((entry, index) => (<LogEntry key={index} entry={entry} />))}</div>); 
}

// --- MODAL: ATTACK RESOLUTION ---
interface AttackResolutionModalProps { isOpen: boolean; onClose: () => void; attacker: EncounterCombatant; targets: EncounterCombatant[]; attackName?: string; onConfirm: (targetId: string, damage: number) => void; }

function AttackResolutionModal({ isOpen, onClose, attacker, targets, attackName, onConfirm }: AttackResolutionModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [damage, setDamage] = useState<string>('');

  if (!isOpen) return null;

  const isAttackerMonster = !!attacker.monster_id;

  // DEDUPLICATE TARGETS (Collapse multi-turn monsters into one entry)
  const uniqueTargets = useMemo(() => {
    const seen = new Set<string>();
    return targets.filter(t => {
      // Players are usually unique by definition of ID
      if (!t.monster_id) return true; 

      // For monsters, group by ID + Base Name (stripping " (Act N)")
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
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center"><div><h3 className="text-lg font-bold font-serif flex items-center gap-2"><Sword className="w-5 h-5 text-red-400"/> Resolve Action</h3><p className="text-xs text-stone-400">{attacker.display_name} is acting{attackName ? ` using ${attackName}` : ''}</p></div><button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24}/></button></div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-stone-500 uppercase mb-2 flex items-center gap-1"><Target size={12}/> Select Target</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {sortedTargets.map(t => { 
                const isFoe = (isAttackerMonster && !t.monster_id) || (!isAttackerMonster && !!t.monster_id); 
                const isDead = t.current_hp === 0; 
                // Clean name for display (Remove " (Act 1)")
                const displayName = t.monster_id ? t.display_name.replace(/ \(Act \d+\)$/, '') : t.display_name;
                
                return (
                  <div key={t.id} onClick={() => !isDead && setSelectedTargetId(t.id)} className={`p-3 rounded border flex justify-between items-center cursor-pointer transition-all ${selectedTargetId === t.id ? 'ring-2 ring-red-500 border-red-500 bg-red-50' : 'bg-white border-stone-200 hover:border-stone-400'} ${isDead ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <div>
                      <span className={`font-bold ${isFoe ? 'text-red-700' : 'text-blue-700'}`}>{displayName}</span>
                      <div className="text-xs text-stone-500">{isFoe ? 'Enemy' : 'Ally'} • HP: {t.current_hp}/{t.max_hp}</div>
                    </div>
                    {selectedTargetId === t.id && <Target className="text-red-600 w-5 h-5 animate-pulse" />}
                  </div>
                ); 
              })}
            </div>
          </div>
          <div><h4 className="text-xs font-bold text-stone-500 uppercase mb-2">Damage Amount</h4><div className="flex gap-2"><input type="number" autoFocus placeholder="0" className="flex-grow p-3 text-lg font-bold border rounded shadow-sm focus:ring-2 focus:ring-red-500 outline-none" value={damage} onChange={(e) => setDamage(e.target.value)} /></div><p className="text-xs text-stone-400 mt-1">Enter negative number to heal.</p></div>
        </div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" Icon={Sword} disabled={!selectedTargetId || !damage} onClick={() => selectedTargetId && onConfirm(selectedTargetId, parseInt(damage))}>Apply</Button></div>
      </div>
    </div>
  );
}

function InitiativeDrawModal({ isOpen, onClose, combatants, onApply }: any) {
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  useEffect(() => { if (isOpen) { const init:any={}; combatants.forEach((c:any) => { if (c.initiative_roll) init[c.id] = String(c.initiative_roll); }); setManualValues(init); } }, [isOpen, combatants]);
  const handleDraw = () => {
    const updates:any[] = []; const taken:any[] = [];
    combatants.forEach((c:any) => { const val = parseInt(manualValues[c.id]); if (!isNaN(val)) { taken.push(val); updates.push({ id: c.id, initiative_roll: val }); } });
    if (combatants.length - updates.length > 0) {
      const deck = generateDeck(combatants.length, taken);
      combatants.forEach((c:any) => { if (!updates.find(u => u.id === c.id)) { const card = deck.pop(); if(card) updates.push({ id: c.id, initiative_roll: card }); } });
    }
    onApply(updates);
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center"><h3 className="text-lg font-bold font-serif flex items-center gap-2"><Dices className="w-5 h-5"/> Draw Initiative</h3><button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24}/></button></div>
        <div className="p-3 bg-blue-50 text-blue-900 text-sm border-b border-blue-100">Enter manual values for characters keeping their card (e.g. <strong>Veteran</strong> talent). Leave blank to draw from deck.</div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-2">{combatants.map((c:any) => (<div key={c.id} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm"><span className="font-bold text-stone-800">{c.display_name}</span><input type="number" min="1" max="10" placeholder="Auto" className={`w-20 px-2 py-1 text-center border rounded font-mono font-bold ${manualValues[c.id] ? 'bg-yellow-50 border-yellow-400 text-yellow-900' : 'bg-white'}`} value={manualValues[c.id] || ''} onChange={(e) => setManualValues(prev => ({...prev, [c.id]: e.target.value}))} /></div>))}</div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" Icon={Dices} onClick={handleDraw}>Draw & Apply</Button></div>
      </div>
    </div>
  );
}

function AddCombatantsModal({ isOpen, onClose, availablePartyMembers, allMonsters, onAddParty, onAddMonster }: any) {
  const [tab, setTab] = useState<'party' | 'monsters'>('party');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [monsterCount, setMonsterCount] = useState(1);
  const [monsterCustomName, setMonsterCustomName] = useState('');
  if (!isOpen) return null;
  const filteredMonsters = allMonsters ? allMonsters.filter((m:any) => m.name.toLowerCase().includes(monsterSearch.toLowerCase()) || (m.category && m.category.toLowerCase().includes(monsterSearch.toLowerCase()))).slice(0, 20) : [];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-50 flex justify-between items-center"><h3 className="text-xl font-bold font-serif text-stone-800">Add Combatants</h3><button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={24}/></button></div>
        <div className="flex border-b"><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'party' ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('party')}>Party Members</button><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'monsters' ? 'bg-white border-b-2 border-orange-600 text-orange-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('monsters')}>Monsters & NPCs</button></div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50/50">
          {tab === 'party' && (<div className="space-y-2">{availablePartyMembers.length === 0 ? <p className="text-center text-stone-400 py-8 italic">All party members added.</p> : availablePartyMembers.map((char:any) => (<div key={char.id} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700"><User size={16} /></div><span className="font-bold text-stone-800">{char.name}</span></div><Button size="sm" onClick={() => onAddParty(char.id)} Icon={PlusCircle}>Add</Button></div>))}</div>)}
          {tab === 'monsters' && (<div className="flex flex-col h-full gap-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4"/><input type="text" placeholder="Search monsters..." className="w-full pl-9 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-orange-500 outline-none" value={monsterSearch} onChange={(e) => setMonsterSearch(e.target.value)} autoFocus/></div><div className="flex-grow overflow-hidden flex flex-col md:flex-row gap-4"><div className="flex-1 overflow-y-auto border rounded bg-white divide-y">{filteredMonsters.map((m:any) => (<div key={m.id} className={`p-3 cursor-pointer hover:bg-orange-50 ${selectedMonsterId === m.id ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`} onClick={() => setSelectedMonsterId(m.id)}><p className="font-bold text-sm">{m.name}</p><p className="text-[10px] text-stone-500">{m.category}</p></div>))}</div>{selectedMonsterId && (<div className="w-full md:w-64 bg-white p-4 border rounded shadow-sm flex flex-col gap-3 flex-shrink-0 h-fit"><h4 className="font-bold text-stone-800 border-b pb-2">{allMonsters.find((m:any) => m.id === selectedMonsterId)?.name}</h4><div><label className="text-[10px] font-bold text-stone-500 uppercase">Count</label><input type="number" min="1" className="w-full p-1.5 border rounded text-sm" value={monsterCount} onChange={(e) => setMonsterCount(Math.max(1, parseInt(e.target.value) || 1))}/></div><div><label className="text-[10px] font-bold text-stone-500 uppercase">Name (Opt)</label><input type="text" placeholder="e.g. Boss" className="w-full p-1.5 border rounded text-sm" value={monsterCustomName} onChange={(e) => setMonsterCustomName(e.target.value)}/></div><Button className="w-full mt-2" onClick={() => { onAddMonster(selectedMonsterId, monsterCount, monsterCustomName); setMonsterCount(1); setMonsterCustomName(''); }} Icon={PlusCircle}>Add to Fight</Button></div>)}</div></div>)}
        </div>
        <div className="p-3 border-t bg-stone-50 flex justify-end"><Button onClick={onClose} variant="secondary">Done</Button></div>
      </div>
    </div>
  );
}

function ActiveCombatantSpotlight({ combatant, monsterData, currentAttack, onRollAttack, onEndTurn, onOpenAttackModal }: { combatant: EncounterCombatant, monsterData?: MonsterData, currentAttack?: MonsterAttack | null, onRollAttack: () => void, onEndTurn: () => void, onOpenAttackModal: () => void }) {
  const isMonster = !!combatant.monster_id;
  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-blue-500 overflow-hidden mb-6 relative animate-in fade-in slide-in-from-top-2">
      <div className="bg-blue-600 text-white px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="bg-white text-blue-800 font-bold font-serif w-8 h-8 flex items-center justify-center rounded shadow">{combatant.initiative_roll ?? '-'}</div><div><h3 className="font-bold text-lg leading-none">{combatant.display_name}</h3><span className="text-xs text-blue-100 uppercase tracking-wider font-semibold">Current Turn</span></div></div>
        <Button size="sm" variant="secondary" onClick={onEndTurn} Icon={RotateCcw} title="End turn and automatically flip next card">End Turn (Flip)</Button>
      </div>
      <div className="p-4">
        {isMonster && monsterData ? (
          <div className="space-y-4">
            {monsterData.stats && <StatsTableView stats={monsterData.stats} />}
            {monsterData.effectsSummary && (<div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm"><span className="text-xs font-bold text-yellow-800 uppercase block mb-1">Traits & Effects</span><MarkdownDiceRenderer text={monsterData.effectsSummary} contextLabel={monsterData.name} /></div>)}
            <div className="bg-stone-50 rounded-lg border border-stone-200 p-3">
              {currentAttack ? (
                <div className="animate-in fade-in"><div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-stone-400 uppercase">Active Action (Rolled)</span></div><h4 className="font-bold text-lg text-red-700 mb-1">{currentAttack.name}</h4><AttackDescriptionRenderer description={currentAttack.description} attackName={currentAttack.name} /><div className="mt-3 pt-2 border-t border-stone-200 flex justify-end gap-2"><Button size="xs" variant="outline" Icon={Dices} onClick={onRollAttack}>Reroll</Button><Button size="xs" variant="danger" Icon={Crosshair} onClick={onOpenAttackModal}>Resolve / Apply</Button></div></div>
              ) : (<div className="text-center py-4"><p className="text-stone-500 text-sm mb-3 italic">No attack selected.</p><Button size="md" variant="danger" Icon={Sword} onClick={onRollAttack} className="w-full justify-center shadow-md">Roll Monster Attack</Button></div>)}
            </div>
          </div>
        ) : (<div className="text-center py-6 text-stone-500 flex flex-col items-center gap-3"><p className="italic">It's a player's turn.</p><Button size="sm" variant="outline" Icon={Crosshair} onClick={onOpenAttackModal}>Record Player Attack</Button></div>)}
      </div>
    </div>
  );
}

function DragonbaneCombatantCard({ combatant, isSelected, isSwapSource, onSelect, onSwapRequest, onFlipCard, onSaveStats, statsState, setStatsState, monsterData, onRemove, isDM }: any) {
  const isMonster = !!combatant.monster_id;
  const hasActed = combatant.has_acted || false; 
  const initValue = combatant.initiative_roll ?? '-';
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = !isMonster && combatant.current_hp === 0;
  const hpVal = statsState.current_hp ?? '';
  const wpVal = statsState.current_wp ?? '';

  return (
    <div className={`relative flex items-center gap-3 p-2 pr-3 rounded-lg border shadow-sm transition-all cursor-pointer overflow-hidden ${isDefeated ? 'bg-stone-200 border-stone-400 opacity-80' : hasActed ? 'bg-stone-100 border-stone-200 opacity-60 grayscale' : isSelected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-md'} ${isSwapSource ? 'ring-2 ring-purple-500 bg-purple-50 animate-pulse' : ''}`} onClick={() => onSelect(combatant.id)}>
      {isDefeated && (<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"><span className="text-stone-400/20 font-black text-4xl uppercase -rotate-12 select-none">Defeated</span></div>)}
      <div className={`relative z-10 flex-shrink-0 w-10 h-14 rounded flex items-center justify-center shadow-sm border transition-colors ${isDefeated ? 'bg-red-100 border-red-300 text-red-800' : hasActed ? 'bg-stone-200 border-stone-300 text-stone-400' : 'bg-white border-stone-800 text-stone-900'}`}><span className="font-serif font-bold text-xl">{initValue}</span></div>
      <div className="relative z-10 flex-grow min-w-0">
        <div className="flex justify-between items-start mb-1">
          <div className="min-w-0 flex items-center gap-2">
             <p className={`font-bold truncate leading-tight ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{combatant.display_name}</p>
             <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">{isMonster ? (monsterData?.name || 'Monster') : 'Player'}</span>
             {isMonster && isDM && (<LinkIcon size={10} className="text-stone-300" title="HP synced across all action cards" />)}
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <div className={`flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm ${combatant.current_hp === 0 ? 'ring-2 ring-red-500 border-red-500' : ''}`}><div className={`px-1.5 py-1 ${combatant.current_hp === 0 ? 'bg-red-100' : 'bg-stone-50'} border-r border-stone-200`}><Heart className={`w-3 h-3 ${combatant.current_hp === 0 ? 'text-red-500' : 'text-red-600'}`} /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" value={hpVal} onChange={(e) => setStatsState({ ...statsState, current_hp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} /><div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{combatant.max_hp}</div></div>
            <div className="flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm"><div className="px-1.5 py-1 bg-stone-50 border-r border-stone-200"><Zap className="w-3 h-3 text-blue-600" /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" value={wpVal} onChange={(e) => setStatsState({ ...statsState, current_wp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} />{combatant.max_wp != null && <div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{combatant.max_wp}</div>}</div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 h-6">
           {isDying && (<div className="flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100"><Skull size={10} className="text-red-500" /><span className="text-[10px] font-bold text-red-700 uppercase">Dying</span></div>)}
           {isDefeated && (<div className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-700 text-white"><Skull size={10} /><span className="text-[10px] font-bold uppercase">Defeated</span></div>)}
           <div className={`flex items-center gap-1 transition-opacity ${hasActed ? 'opacity-50 hover:opacity-100' : ''}`} onClick={e => e.stopPropagation()}>
              {!hasActed && !isDefeated && (<button className={`p-1 rounded transition-colors ${isSwapSource ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50'}`} title="Swap Initiative (Wait)" onClick={() => onSwapRequest(combatant.id)}><ArrowUpDown size={14} /></button>)}
              {!isDefeated && <button className={`p-1 rounded transition-colors ${hasActed ? 'text-stone-400 hover:bg-stone-200' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'}`} title={hasActed ? "Unflip Card" : "Flip Card (End Turn/Reaction)"} onClick={() => onFlipCard(combatant.id, hasActed)}>{hasActed ? <RotateCcw size={14} /> : <ShieldAlert size={14} />}</button>}
              {isDM && (<button className={`p-1 rounded transition-colors flex items-center gap-1 ${isDefeated ? 'bg-red-600 text-white hover:bg-red-700 px-2 shadow-sm' : 'text-stone-300 hover:text-red-600 hover:bg-red-50'}`} onClick={() => onRemove(combatant.id)} title="Remove from Encounter"><Trash2 size={14} />{isDefeated && <span className="text-[10px] font-bold uppercase">Remove Corpse</span>}</button>)}
           </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---

export function PartyEncounterView({ partyId, partyMembers, isDM }: PartyEncounterViewProps) {
  const queryClient = useQueryClient();
  const { toggleDiceRoller } = useDice();

  // STATE
  const [newEncounterName, setNewEncounterName] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'create'>('details');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const [showEncounterList, setShowEncounterList] = useState(false);
  const [isEditingEncounter, setIsEditingEncounter] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editingStats, setEditingStats] = useState<Record<string, EditableCombatantStats>>({});
  const [currentMonsterAttacks, setCurrentMonsterAttacks] = useState<Record<string, MonsterAttack | null>>({});
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [temporaryNotes, setTemporaryNotes] = useState('');
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

  const { data: allEncounters, isLoading: loadingEnc } = useQuery<Encounter[]>({ queryKey: ['allEncounters', partyId], queryFn: () => fetchAllEncountersForParty(partyId), enabled: !!partyId });
  const { data: allMonsters } = useQuery<MonsterData[]>({ queryKey: ['allMonsters'], queryFn: fetchAllMonsters });
  
  const currentEncounterId = useMemo(() => selectedEncounterId || allEncounters?.[0]?.id || null, [selectedEncounterId, allEncounters]);
  const { data: encounterDetails } = useQuery<Encounter | null>({ queryKey: ['encounterDetails', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterDetails(currentEncounterId) : Promise.resolve(null)), enabled: !!currentEncounterId });
  const { data: combatantsData } = useQuery<EncounterCombatant[]>({ queryKey: ['encounterCombatants', currentEncounterId], queryFn: () => (currentEncounterId ? fetchEncounterCombatants(currentEncounterId) : Promise.resolve([])), enabled: !!currentEncounterId });
  
  // ACTIVATE REALTIME HOOK
  useEncounterRealtime(currentEncounterId);

  // DERIVED
  const monstersById = useMemo(() => new Map((allMonsters ?? []).map((m) => [m.id, m] as const)), [allMonsters]);
  const combatants = useMemo(() => (combatantsData?.slice().sort((a, b) => { const ia = a.initiative_roll ?? 1000; const ib = b.initiative_roll ?? 1000; if (ia !== ib) return ia - ib; return (a.display_name ?? '').localeCompare(b.display_name ?? ''); }) || []), [combatantsData]);
  const activeCombatant = useMemo(() => combatants.find(c => c.id === selectedActorId), [combatants, selectedActorId]);
  const activeCombatantMonsterData = useMemo(() => activeCombatant?.monster_id ? monstersById.get(activeCombatant.monster_id) : null, [activeCombatant, monstersById]);
  const availableParty = useMemo(() => partyMembers.filter(m => !combatants.some(c => c.character_id === m.id)), [partyMembers, combatants]);

  useEffect(() => { if (!loadingEnc && (!allEncounters || allEncounters.length === 0)) setViewMode('create'); }, [allEncounters, loadingEnc]);
  useEffect(() => { if(encounterDetails) setEditedName(encounterDetails.name); }, [encounterDetails]);
  
  // Sync editable stats when server data changes
  useEffect(() => { 
    if (!combatants) return; 
    const init: any = {}; 
    combatants.forEach(c => { 
      init[c.id] = { 
        current_hp: String(c.current_hp ?? 0), 
        current_wp: c.max_wp != null ? String(c.current_wp ?? c.max_wp) : String(c.current_wp ?? ''), 
        initiative_roll: String(c.initiative_roll || '') 
      }; 
    }); 
    setEditingStats(init); 
  }, [combatants]);
  
  // SMART NEXT ACTOR
  useEffect(() => { 
    if (encounterDetails?.status === 'active' && combatants.length > 0) {
      const currentSelected = combatants.find(c => c.id === selectedActorId);
      if (!selectedActorId || (currentSelected && (currentSelected.has_acted || (currentSelected.monster_id && currentSelected.current_hp === 0)))) {
        // Auto-select next actor: must not have acted, must not be defeated
        const next = combatants.find(c => !c.has_acted && !(c.monster_id && c.current_hp === 0));
        if (next) setSelectedActorId(next.id);
      }
    }
  }, [combatants, encounterDetails, selectedActorId]);

  // CLEANUP SELECTION
  useEffect(() => {
    if (selectedActorId && !combatants.find(c => c.id === selectedActorId)) setSelectedActorId(null);
  }, [combatants, selectedActorId]);

  // MUTATIONS
  const createEncounterMu = useMutation({ mutationFn: (name: string) => createEncounter(partyId, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters'] }); setSelectedEncounterId(newEnc.id); setViewMode('details'); } });
  const deleteEncounterMu = useMutation({ mutationFn: deleteEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allEncounters'] }) });
  const duplicateEncounterMu = useMutation({ mutationFn: ({id, name}:any) => duplicateEncounter(id, name), onSuccess: (newEnc) => { queryClient.invalidateQueries({ queryKey: ['allEncounters'] }); setSelectedEncounterId(newEnc.id); } });
  const updateEncounterMu = useMutation({ mutationFn: ({id, updates}:any) => updateEncounter(id, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterDetails'] }); setIsEditingEncounter(false); } });
  const addCharacterMu = useMutation({ mutationFn: addCharacterToEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const addMonsterMu = useMutation({ mutationFn: addMonsterToEncounter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const removeCombatantMu = useMutation({ mutationFn: removeCombatant, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const updateCombatantMu = useMutation({ mutationFn: ({id, updates}:any) => updateCombatant(id, updates), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }) });
  const swapInitiativeMu = useMutation({ mutationFn: swapInitiative, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }); setSwapSourceId(null); } });
  const appendLogMu = useMutation({ mutationFn: (entry: any) => appendEncounterLog(currentEncounterId!, entry), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['encounterDetails'] }) });
  
  const startEncounterMu = useMutation({ mutationFn: () => startEncounter(currentEncounterId!), onSuccess: () => { queryClient.invalidateQueries(); setIsInitModalOpen(true); } });
  const endEncounterMu = useMutation({ mutationFn: endEncounter, onSuccess: () => queryClient.invalidateQueries() });
  const nextRoundMu = useMutation({ mutationFn: async () => { await nextRound(currentEncounterId!); if(combatantsData) await Promise.all(combatantsData.map(c => updateCombatant(c.id, { has_acted: false }))); }, onSuccess: () => { appendLogMu.mutate({ type: 'round_advanced', ts: Date.now(), round: (encounterDetails?.current_round ?? 0) + 1 }); setSelectedActorId(null); setIsInitModalOpen(true); queryClient.invalidateQueries(); } });

  // HANDLERS
  const handleSaveStats = (id: string) => {
    const stats = editingStats[id];
    const c = combatants.find(x => x.id === id);
    if (!stats || !c) return;
    
    const nh = parseInt(stats.current_hp);
    const nw = parseInt(stats.current_wp);
    const updates: any = {};
    let siblings = [c];

    // If monster, find linked siblings (same monster type, different cards)
    if (c.monster_id && combatantsData) {
      siblings = getSiblings(c, combatantsData);
    }

    if (!isNaN(nh) && nh !== c.current_hp) {
      updates.current_hp = nh;
      appendLogMu.mutate({ type: 'hp_change', ts: Date.now(), who: id, name: c.display_name, delta: nh - (c.current_hp || 0) });
    }
    if (!isNaN(nw) && nw !== c.current_wp) {
       updates.current_wp = nw;
       appendLogMu.mutate({ type: 'wp_change', ts: Date.now(), who: id, name: c.display_name, delta: nw - (c.current_wp || 0) });
    }
    
    if (Object.keys(updates).length > 0) {
      // Update ALL siblings to keep them in sync
      siblings.forEach(sib => updateCombatantMu.mutate({ id: sib.id, updates }));
    }
  };
  
  const handleRemove = (id: string) => {
    const c = combatants.find(x => x.id === id);
    if (c && c.monster_id && combatantsData) {
      // If removing a monster, remove ALL cards (siblings) associated with that entity
      const siblings = getSiblings(c, combatantsData);
      siblings.forEach(sib => removeCombatantMu.mutate(sib.id));
    } else {
      removeCombatantMu.mutate(id);
    }
  };

  const handleRollMonsterAttack = (id: string, m: MonsterData) => {
    if (!m.attacks?.length) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    const attack = m.attacks.find(a => a.roll_values.split(',').includes(String(roll)));
    if (attack) {
      setCurrentMonsterAttacks(p => ({ ...p, [id]: attack }));
      appendLogMu.mutate({ type: 'monster_attack', ts: Date.now(), who: id, name: m.name, roll, attack: { name: attack.name } });
    }
  };

  const handleInitApply = async (updates: {id:string, initiative_roll:number}[]) => { await Promise.all(updates.map(u => updateCombatant(u.id, { ...u, has_acted: false }))); setIsInitModalOpen(false); queryClient.invalidateQueries({ queryKey: ['encounterCombatants'] }); appendLogMu.mutate({ type: 'generic', ts: Date.now(), message: 'Initiative drawn.' }); };

  const handleFlip = (id: string, current: boolean) => {
    updateCombatantMu.mutate({ id, updates: { has_acted: !current } });
  };
  
  const handleAttackConfirm = (targetId: string, dmg: number) => {
    if (!activeCombatant) return;
    const target = combatants.find(c => c.id === targetId);
    if (!target) return;
    
    const newHp = Math.max(0, target.current_hp - dmg);
    
    // Use shared handler to ensure synced updates
    const updates: any = { current_hp: newHp };
    let siblings = [target];
    if (target.monster_id && combatantsData) {
      siblings = getSiblings(target, combatantsData);
    }

    siblings.forEach(sib => updateCombatantMu.mutate({ id: sib.id, updates }));
    appendLogMu.mutate({ type: 'attack_resolve', ts: Date.now(), attacker: activeCombatant.display_name, target: target.display_name, damage: dmg });
    setIsAttackModalOpen(false);
  };

  if (!isDM) return <div className="p-8 text-center text-stone-500">Only the DM can manage encounters.</div>;
  if (loadingEnc) return <LoadingSpinner />;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 sticky top-2 z-30">
        <div><h2 className="text-2xl font-bold font-serif text-stone-900">{encounterDetails ? encounterDetails.name : 'Encounters'}</h2>{encounterDetails && (<div className="flex items-center gap-3 text-sm mt-1"><span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider ${encounterDetails.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{encounterDetails.status}</span>{encounterDetails.status === 'active' && (<span className="font-mono font-bold text-stone-600">Round {encounterDetails.current_round}</span>)}</div>)}</div>
        <div className="flex items-center gap-2">
          {viewMode === 'details' && (<><Button variant="ghost" Icon={PlusCircle} onClick={() => setViewMode('create')}>New</Button><Button onClick={() => setShowEncounterList(true)} Icon={List} variant="secondary">List</Button>{encounterDetails?.status === 'planning' && <Button variant="primary" Icon={Play} onClick={() => startEncounterMu.mutate()}>Start</Button>}{encounterDetails?.status === 'active' && (<><Button variant="primary" Icon={SkipForward} onClick={() => nextRoundMu.mutate()}>Next Round</Button><Button variant="outline" Icon={Square} onClick={() => endEncounterMu.mutate(currentEncounterId!)}>End</Button></>)}</>)}
        </div>
      </header>

      {viewMode === 'create' ? (
         <div className="bg-white p-8 rounded-xl shadow-sm max-w-md mx-auto text-center"><h3 className="text-xl font-bold mb-4">Start a New Encounter</h3><input className="w-full p-3 border rounded-lg mb-4" placeholder="Name" value={newEncounterName} onChange={e => setNewEncounterName(e.target.value)}/><div className="flex justify-center gap-3"><Button variant="primary" onClick={() => createEncounterMu.mutate(newEncounterName)}>Create</Button><Button variant="ghost" onClick={() => setViewMode('details')}>Cancel</Button></div></div>
      ) : !encounterDetails ? (
        <div className="text-center py-12 text-stone-400">No encounter selected.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-1 h-fit lg:sticky lg:top-24">
             <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden"><div className="p-3 bg-stone-50 border-b border-stone-200"><h4 className="font-bold text-stone-600 text-sm uppercase">Combat Log</h4></div><div className="h-64 lg:h-[calc(100vh-300px)] overflow-y-auto p-3 bg-white"><CombatLogView log={encounterDetails.log || []} /></div></div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200"><textarea className="w-full text-sm p-2 border rounded bg-yellow-50/50 min-h-[100px]" placeholder="DM Notes..." value={temporaryNotes} onChange={e => setTemporaryNotes(e.target.value)}/><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(true)} Icon={Edit3}>Edit Encounter</Button></div></div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {swapSourceId && (<div className="bg-purple-600 text-white p-3 rounded-lg shadow-md flex justify-between items-center animate-pulse"><span className="font-bold flex items-center gap-2"><ArrowUpDown/> Select swap target...</span><Button size="sm" variant="secondary" onClick={() => setSwapSourceId(null)}>Cancel</Button></div>)}
            {isEditingEncounter && (<div className="bg-white p-4 rounded-xl shadow mb-4 border border-blue-200"><h4 className="font-bold mb-2">Edit Details</h4><input className="w-full mb-2 p-2 border rounded" value={editedName} onChange={e => setEditedName(e.target.value)}/><div className="flex gap-2"><Button size="sm" onClick={() => updateEncounterMu.mutate({id: currentEncounterId, updates: {name: editedName}})}>Save</Button><Button size="sm" variant="ghost" onClick={() => setIsEditingEncounter(false)}>Cancel</Button></div></div>)}
            {encounterDetails.status === 'active' && activeCombatant && (<ActiveCombatantSpotlight combatant={activeCombatant} monsterData={activeCombatantMonsterData || undefined} currentAttack={currentMonsterAttacks[activeCombatant.id]} onRollAttack={() => activeCombatantMonsterData && handleRollMonsterAttack(activeCombatant.id, activeCombatantMonsterData)} onEndTurn={() => handleFlip(activeCombatant.id, false)} onOpenAttackModal={() => setIsAttackModalOpen(true)} />)}
            <div className="bg-stone-100/50 p-4 rounded-xl border border-stone-200">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-stone-500 uppercase tracking-wider text-sm">Initiative Track</h3><div className="flex gap-2">{encounterDetails.status === 'active' && <Button size="sm" variant="outline" Icon={RefreshCw} onClick={() => setIsInitModalOpen(true)}>Re-Draw</Button>}<Button size="sm" variant="outline" Icon={UserPlus} onClick={() => setIsAddModalOpen(true)}>Add</Button></div></div>
              <div className="space-y-2">{combatants.length === 0 && <p className="text-center py-8 text-stone-400 italic">No combatants added.</p>}{combatants.map(c => (<DragonbaneCombatantCard key={c.id} combatant={c} monsterData={monstersById.get(c.monster_id || '')} isSelected={selectedActorId === c.id} isSwapSource={swapSourceId === c.id} onSelect={setSelectedActorId} onSwapRequest={(id) => swapSourceId ? swapInitiativeMu.mutate({id1: swapSourceId, id2: id}) : setSwapSourceId(id)} onFlipCard={handleFlip} onSaveStats={handleSaveStats} onRemove={(id) => removeCombatantMu.mutate(id)} statsState={editingStats[c.id] || { current_hp: '', current_wp: '' }} setStatsState={(v:any) => setEditingStats(prev => ({...prev, [c.id]: v}))} isDM={isDM} />))}</div>
            </div>
          </div>
        </div>
      )}
      <AddCombatantsModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} partyMembers={partyMembers} availablePartyMembers={availableParty} allMonsters={allMonsters || []} onAddParty={(id) => addCharacterMu.mutate({ encounterId: currentEncounterId!, characterId: id, initiativeRoll: null })} onAddMonster={(id, count, name) => { const m = monstersById.get(id); const ferocity = m?.stats?.FEROCITY || 1; for(let i=1; i<=count; i++) { const base = count > 1 ? `${name || m?.name} ${i}` : (name || m?.name); for(let f=1; f<=ferocity; f++) { addMonsterMu.mutate({ encounterId: currentEncounterId!, monsterId: id, customName: ferocity > 1 ? `${base} (Act ${f})` : base, initiativeRoll: null }); } } }} />
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
      {showEncounterList && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl space-y-4 max-h-[80vh] flex flex-col"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">All Encounters</h3><Button variant="ghost" size="sm" onClick={() => setShowEncounterList(false)} Icon={XCircle}>Close</Button></div><div className="overflow-y-auto space-y-2 border-t pt-4">{(allEncounters ?? []).map(enc => (<div key={enc.id} className={`flex items-center justify-between p-3 rounded-md ${currentEncounterId === enc.id ? 'bg-blue-100' : 'bg-gray-50'}`}><div><p className="font-semibold">{enc.name}</p><p className="text-sm text-gray-600 capitalize">Status: {enc.status}</p></div><div className="flex items-center gap-2"><Button size="sm" onClick={() => setSelectedEncounterId(enc.id)} disabled={currentEncounterId === enc.id}>Select</Button><Button size="sm" variant="outline" Icon={Copy} onClick={() => duplicateEncounterMu.mutate({id: enc.id, name: enc.name})}>Copy</Button><Button size="sm" variant="danger" Icon={Trash2} onClick={() => deleteEncounterMu.mutate(enc.id)}>Del</Button></div></div>))}</div></div></div>)}
    </div>
  );
}
