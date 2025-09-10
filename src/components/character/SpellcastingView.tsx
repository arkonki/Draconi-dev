import React, { useState, useMemo, useEffect } from 'react';
import { Spell as DetailedSpell } from '../../types/magic';
import { Character, AttributeName, DiceType } from '../../types/character';
import { Sparkles, Dices, BookOpen, Wand2, Minus, Plus, CheckSquare, Square, Filter, Zap, Clock, Target, Calendar, AlertCircle, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { useSpells } from '../../hooks/useSpells';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useDice } from '../dice/DiceContext';

// --- (Explanation Dictionaries are unchanged) ---
const requirementExplanations: Record<string, string> = { 'Word': 'The spell is activated with a chant or power word...', 'Gesture': 'The spell is activated by making specific hand movements.', 'Focus': 'The spell is activated with an item held in your hand...', 'Ingredient': 'The spell is activated using a certain ingredient...' };
const durationExplanations: Record<string, string> = { 'Instant': 'The effect occurs instantly and has no lasting effect.', 'Round': 'The effect lasts until your turn in the next round.', 'Stretch': 'The effect lasts for one stretch of time.', 'Shift': 'The effect lasts until the end of the current shift.', 'Concentration': 'The effect ceases if you perform another action, take damage, or fail a WIL roll...' };

// --- NEW: Helper functions for dice calculations are restored ---
const isValidDiceType = (s: string): s is DiceType => {
    return ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(s.toLowerCase());
}

const getScaledDice = (diceString: string | null | undefined, level: number): { display: string; roller: DiceType[] } => {
  if (!diceString) return { display: '', roller: [] };
  const match = diceString.trim().match(/(\d+)?d(\d+)/i);
  if (!match) return { display: diceString, roller: [] };

  const baseNumDice = match[1] ? parseInt(match[1], 10) : 1;
  const dieSize = `d${match[2]}`;

  if (!isValidDiceType(dieSize)) return { display: diceString, roller: [] };

  const scaledNumDice = baseNumDice + (level - 1);
  const display = `${scaledNumDice}D${match[2]}`;
  const roller = Array(scaledNumDice).fill(dieSize);
  
  return { display, roller };
};

const SpellDetailPane = ({ spell, onClose }: { spell: DetailedSpell | null; onClose: () => void; }) => {
  if (!spell) return null;
  const foundRequirements = Object.keys(requirementExplanations).filter(key => spell.requirement?.includes(key));
  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-25 z-50" onClick={onClose} aria-hidden="true" />
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${spell ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center border-b pb-4"><h3 className="text-2xl font-bold text-gray-800">{spell.name}</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button></div>
          <div className="overflow-y-auto mt-4 flex-grow space-y-6 text-gray-700">
            <div><h4 className="font-semibold text-gray-800 mb-1">Description</h4><p className="text-sm italic border-l-4 border-gray-200 pl-4 py-1">{spell.description}</p></div>
            {spell.requirement && (<div><h4 className="font-semibold text-gray-800 mb-2">Requirements</h4><div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-2">{foundRequirements.length > 0 ? (foundRequirements.map(key => (<p key={key}><strong>{key}:</strong> {requirementExplanations[key]}</p>))) : (<p>{spell.requirement}</p>)}</div></div>)}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Properties</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b py-2"><span className="font-medium">Rank</span><span>{spell.rank === 0 ? 'Trick' : spell.rank}</span></div>
                <div className="flex justify-between border-b py-2"><span className="font-medium">WP Cost</span><span>{spell.willpowerCost}</span></div>
                {spell.dice && <div className="flex justify-between border-b py-2"><span className="font-medium">Dice</span><span>{spell.dice}</span></div>}
                <div className="border-b py-2"><div className="flex justify-between"><span className="font-medium">Casting Time</span><span>{spell.castingTime}</span></div></div>
                <div className="border-b py-2"><div className="flex justify-between"><span className="font-medium">Range</span><span>{spell.range}</span></div></div>
                <div className="border-b py-2"><div className="flex justify-between"><span className="font-medium">Duration</span><span>{spell.duration}</span></div>{durationExplanations[spell.duration] && (<blockquote className="mt-2 text-xs italic text-gray-500 border-l-4 pl-3">{durationExplanations[spell.duration]}</blockquote>)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

interface SpellcastingViewProps { onClose: () => void; }
type ActiveTab = 'prepared' | 'grimoire';
type RankFilter = 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const getBaseChance = (value: number): number => { if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; };
const calculateFallbackLevel = (character: Character, skillName: string): number => { const attribute: AttributeName = 'WIL'; const isTrained = character.trainedSkills?.includes(skillName) ?? false; const baseValue = character.attributes?.[attribute] ?? 10; const baseChance = getBaseChance(baseValue); return isTrained ? baseChance * 2 : baseChance; };

export function SpellcastingView({ onClose }: SpellcastingViewProps) {
  const [castError, setCastError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [castingSpellId, setCastingSpellId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('prepared');
  const [selectedRankFilter, setSelectedRankFilter] = useState<RankFilter>('all');
  const [infoPaneSpell, setInfoPaneSpell] = useState<DetailedSpell | null>(null);

  const { toggleDiceRoller } = useDice();
  const { character, updateCharacterData, isSaving, setActiveStatusMessage } = useCharacterSheetStore();
  const { learnedSpells, characterSchoolName, loading: spellsLoading, error: spellsError } = useSpells(character?.id);

  const intValue = character?.attributes?.INT ?? 10;
  const preparationLimit = getBaseChance(intValue);
  const preparedSpellIds = useMemo(() => new Set(character?.prepared_spells ?? []), [character?.prepared_spells]);
  const preparedRankedSpellCount = useMemo(() => learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)).length, [learnedSpells, preparedSpellIds]);
  const canPrepareMore = preparedRankedSpellCount < preparationLimit;

  const handleTogglePrepare = async (spellId: string, currentIsPrepared: boolean) => { setPrepError(null); if (!character) return; const currentPrepared = character.prepared_spells ?? []; let updatedPrepared: string[]; if (currentIsPrepared) { updatedPrepared = currentPrepared.filter(id => id !== spellId); } else { if (!canPrepareMore) { setPrepError(`Preparation limit reached (${preparationLimit} based on INT ${intValue}).`); return; } updatedPrepared = [...currentPrepared, spellId]; } try { await updateCharacterData({ prepared_spells: updatedPrepared }); } catch (err) { setPrepError(err instanceof Error ? err.message : 'Failed to update preparation'); } };
  const { preparedSpellsList, grimoireSpellsList } = useMemo(() => { const tricks = learnedSpells.filter(spell => spell.rank === 0); const preparedRankedSpells = learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)); const prepared = [...tricks, ...preparedRankedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)); const grimoire = learnedSpells.filter(spell => spell.rank > 0).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)); return { preparedSpellsList: prepared, grimoireSpellsList: grimoire }; }, [learnedSpells, preparedSpellIds]);
  const availableRanks = useMemo(() => Array.from(new Set(learnedSpells.map(spell => spell.rank))).sort((a, b) => a - b), [learnedSpells]);
  const rankFilters = useMemo(() => { const filters: { label: string; value: RankFilter }[] = [{ label: 'All', value: 'all' }]; availableRanks.forEach(rank => { if (rank === 0) filters.push({ label: 'Trick', value: 0 }); else if (rank >= 1 && rank <= 9) filters.push({ label: `Rank ${rank}`, value: rank as RankFilter }); }); return filters; }, [availableRanks]);
  const spellsToDisplay = useMemo(() => { const baseList = activeTab === 'prepared' ? preparedSpellsList : grimoireSpellsList; if (selectedRankFilter === 'all') return baseList; return baseList.filter(spell => spell.rank === selectedRankFilter); }, [activeTab, preparedSpellsList, grimoireSpellsList, selectedRankFilter]);
  const { actualMagicSkillName, magicSkillValue, isMagicSkillAffected } = useMemo(() => { if (!character) { return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false }; } const KNOWN_MAGIC_SKILLS = ['Animism', 'Elementalism', 'Mentalism', 'Symbolism']; const skillLevels = character.skill_levels || {}; const trainedSkills = character.trainedSkills || []; const characterSkills = new Set([...trainedSkills, ...Object.keys(skillLevels)]); let determinedSkillName = KNOWN_MAGIC_SKILLS.find(skill => characterSkills.has(skill)); if (!determinedSkillName && characterSkills.has('General Magic')) { determinedSkillName = 'General Magic'; } if (determinedSkillName) { const storedLevel = skillLevels[determinedSkillName]; const finalSkillValue = storedLevel !== undefined ? storedLevel : calculateFallbackLevel(character, determinedSkillName); const isAffected = character.conditions?.scared ?? false; return { actualMagicSkillName: determinedSkillName, magicSkillValue: finalSkillValue, isMagicSkillAffected: isAffected }; } return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false }; }, [character]);

  if (!character) return null;

  const handleCastSpell = async (spell: DetailedSpell, selectedLevel: number, fromGrimoire: boolean) => { setCastingSpellId(spell.id); setCastError(null); try { const currentWP = character.current_wp ?? character.attributes.WIL; const baseWpCost = Number(spell.willpowerCost ?? 0); const isPowerLevelSpell = spell.powerLevel === 'yes'; const actualWpCost = isPowerLevelSpell ? baseWpCost + (selectedLevel - 1) * 2 : baseWpCost; if (currentWP < actualWpCost) throw new Error(`Insufficient WP (Need ${actualWpCost}, Have ${currentWP})`); await updateCharacterData({ current_wp: currentWP - actualWpCost }); let statusMessage = `Casted ${spell.name}${isPowerLevelSpell ? ` (Lvl ${selectedLevel})` : ''} for ${actualWpCost} WP.`; if (fromGrimoire) { statusMessage += ' (Casting time is doubled.)'; } setActiveStatusMessage(statusMessage); } catch (err) { setCastError(err instanceof Error ? err.message : 'Failed to cast spell'); } finally { setCastingSpellId(null); } };
  const handleMagicSkillClick = () => { if (!actualMagicSkillName || magicSkillValue === null) return; toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: magicSkillValue, description: `${actualMagicSkillName} Check`, requiresBane: isMagicSkillAffected, skillName: actualMagicSkillName }); };
  
  const SpellRow = ({ spell }: { spell: DetailedSpell }) => {
    const isPrepared = preparedSpellIds.has(spell.id);
    const isTrick = spell.rank === 0;
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    const [level, setLevel] = useState(1);
    const baseWpCost = Number(spell.willpowerCost ?? 0);
    const actualWpCost = isPowerLevelSpell ? baseWpCost + (level - 1) * 2 : baseWpCost;
    const insufficientWp = (character.current_wp ?? character.attributes.WIL) < actualWpCost;
    const isReactionSpell = spell.castingTime === 'Reaction';
    const scaledDice = getScaledDice(spell.dice, level);

    const handleLevelChange = (delta: number) => { setLevel(current => Math.max(1, Math.min(3, current + delta))); };
    const handleDiceRoll = () => { if (scaledDice.roller.length === 0) return; toggleDiceRoller({ initialDice: scaledDice.roller, description: `Roll for ${spell.name} (${scaledDice.display})`, rollMode: 'generic' }); };
    
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border-b bg-white hover:bg-gray-50/50 last:border-b-0">
        <div className="flex-grow">
          <div className="flex items-center justify-between"><button onClick={() => setInfoPaneSpell(spell)} className="text-left"><h3 className="font-semibold text-gray-800 hover:text-blue-600 transition-colors">{spell.name}</h3></button><span className={`text-xs font-medium px-2 py-1 rounded-full ${isTrick ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-800'}`}>{isTrick ? 'Trick' : `Rank ${spell.rank}`}</span></div>
          <div className="mt-2 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <div className="flex items-center gap-1.5" title="Casting Time"><Clock size={12} /> {spell.castingTime}</div>
            <div className="flex items-center gap-1.5" title="Range"><Target size={12} /> {spell.range}</div>
            <div className="flex items-center gap-1.5" title="Duration"><Calendar size={12} /> {spell.duration}</div>
            <div className="flex items-center gap-1.5 font-medium text-gray-600" title="Willpower Point Cost"><Zap size={12} /> {actualWpCost} WP {isPowerLevelSpell && level > 1 && `(L${level})`}</div>
            {spell.dice && (<button onClick={handleDiceRoll} className="flex items-center gap-1.5 font-medium text-purple-600 hover:text-purple-800 transition-colors" title={`Roll ${scaledDice.display}`}><Dices size={12} /> {scaledDice.display}</button>)}
          </div>
          {spell.requirement && (<div className="mt-2 text-xs flex items-center gap-1.5 text-amber-800"><AlertCircle size={12} className="flex-shrink-0"/><span>Requirement: {spell.requirement}</span></div>)}
        </div>
        <div className="flex-shrink-0 mt-4 sm:mt-0 sm:ml-4">{activeTab === 'grimoire' ? (<div className="flex items-center justify-end gap-2 w-48">{isPowerLevelSpell ? (<div className="flex items-center gap-1"><Button variant="outline" size="xs" onClick={() => handleLevelChange(-1)} disabled={level <= 1 || !!castingSpellId || isSaving || isReactionSpell} className="px-2" title="Decrease level"><Minus size={14} /></Button><Button variant="secondary" size="xs" onClick={() => handleCastSpell(spell, level, true)} disabled={isReactionSpell || !!castingSpellId || isSaving || insufficientWp} className="flex-grow min-w-[70px]" title={isReactionSpell ? "Reaction spells must be prepared" : `Cast Lvl ${level} from grimoire (double time)`}>{castingSpellId === spell.id ? '' : `Cast Lvl ${level}`}</Button><Button variant="outline" size="xs" onClick={() => handleLevelChange(1)} disabled={level >= 3 || !!castingSpellId || isSaving || isReactionSpell} className="px-2" title="Increase level"><Plus size={14} /></Button></div>) : (<Button variant="secondary" size="xs" onClick={() => handleCastSpell(spell, 1, true)} disabled={isReactionSpell || !!castingSpellId || isSaving || insufficientWp} className="w-full" title={isReactionSpell ? "Reaction spells must be prepared" : "Cast from grimoire (double time)"}>Cast</Button>)}<button onClick={() => handleTogglePrepare(spell.id, isPrepared)} disabled={!isPrepared && !canPrepareMore || isSaving} className="disabled:opacity-50 disabled:cursor-not-allowed" title={isPrepared ? "Unprepare" : canPrepareMore ? "Prepare" : `Limit reached`}>{isPrepared ? <CheckSquare className="w-5 h-5 text-blue-600 hover:text-blue-800" /> : <Square className={`w-5 h-5 ${canPrepareMore ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300'}`} />}</button></div>) : (<div className="flex items-center justify-end gap-1 w-40">{isPowerLevelSpell ? (<><Button variant="outline" size="xs" onClick={() => handleLevelChange(-1)} disabled={level <= 1 || !!castingSpellId || isSaving} className="px-2" title="Decrease level"><Minus size={14} /></Button><Button variant="primary" size="xs" onClick={() => handleCastSpell(spell, level, false)} loading={castingSpellId === spell.id || isSaving} disabled={!!castingSpellId || isSaving || insufficientWp} className="flex-grow min-w-[70px]" title={insufficientWp ? `Need ${actualWpCost} WP` : `Cast Lvl ${level}`}>{castingSpellId === spell.id ? '' : `Cast Lvl ${level}`}</Button><Button variant="outline" size="xs" onClick={() => handleLevelChange(1)} disabled={level >= 3 || !!castingSpellId || isSaving} className="px-2" title="Increase level"><Plus size={14} /></Button></>) : (<Button variant="primary" size="xs" onClick={() => handleCastSpell(spell, 1, false)} loading={castingSpellId === spell.id || isSaving} disabled={!!castingSpellId || isSaving || insufficientWp} className="w-full" title={insufficientWp ? `Need ${actualWpCost} WP` : `Cast ${spell.name}`}>{castingSpellId === spell.id ? '' : 'Cast'}</Button>)}</div>)}</div>
      </div>
    );
  };

  if (spellsLoading) { return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 shadow-xl"><LoadingSpinner /><p className="text-center mt-2 text-gray-600">Loading spells...</p></div></div>; }

  return (
    <div className="fixed inset-0 z-40">
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={() => setInfoPaneSpell(null)}>
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b bg-gray-50">
             <div className="flex justify-between items-start mb-2"><div><h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 mb-1"><Sparkles className="w-6 h-6 text-purple-600" />Spellcasting</h2><div className="flex items-center gap-4 text-sm text-gray-600"><span>WP: <strong className="font-semibold">{character.current_wp ?? character.attributes.WIL}</strong> / {character.attributes.WIL}</span>{actualMagicSkillName && magicSkillValue !== null && ( <div className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded transition-colors ${isMagicSkillAffected ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'}`} onClick={handleMagicSkillClick} title={`Click to roll ${actualMagicSkillName} (Target ≤ ${magicSkillValue})`}><Dices className="w-3.5 h-3.5" /> <span className="font-medium">{actualMagicSkillName}:</span> <span>{magicSkillValue}</span> {isMagicSkillAffected && <span className="text-xs font-semibold">(Bane)</span>}</div> )}</div></div><button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none focus:outline-none mt-[-4px]">&times;</button></div>
            {castError && (<div className="my-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{castError}</div>)}
            {prepError && (<div className="my-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">{prepError}</div>)}
            <div className="border-b border-gray-200"><nav className="-mb-px flex space-x-4"><button onClick={() => { setActiveTab('prepared'); setSelectedRankFilter('all'); }} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${activeTab === 'prepared' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Wand2 size={16} /> Prepared ({preparedSpellsList.length})</button><button onClick={() => { setActiveTab('grimoire'); setSelectedRankFilter('all'); }} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${activeTab === 'grimoire' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><BookOpen size={16} /> Grimoire ({grimoireSpellsList.length})</button><div className="flex-grow"></div><div className="py-3 px-1 text-sm text-gray-500">Slots: <span className="font-medium">{preparedRankedSpellCount}/{preparationLimit}</span></div></nav></div>
             {rankFilters.length > 1 && ( <div className="pt-3 flex items-center gap-2 flex-wrap"> <span className="text-sm font-medium text-gray-600 flex items-center gap-1 mr-1 shrink-0"><Filter size={14} /> Filter:</span> {rankFilters.map(filter => (<Button key={filter.value} variant={selectedRankFilter === filter.value ? 'primary' : 'outline'} size="xs" onClick={() => setSelectedRankFilter(filter.value)} className={`px-2 py-0.5 ${selectedRankFilter === filter.value ? '' : 'text-gray-600 bg-white hover:bg-gray-50'}`}>{filter.label}</Button>))} </div> )}
          </div>
          <div className="overflow-y-auto flex-grow bg-gray-100"><div className="border-t">{spellsToDisplay.length > 0 ? ( spellsToDisplay.map((spell) => (<SpellRow key={spell.id} spell={spell} />)) ) : ( <div className="text-center py-10 text-gray-500"><p>No spells match the current filter.</p></div> )}</div></div>
          <div className="p-3 border-t bg-gray-50 flex justify-end"><Button variant="outline" onClick={onClose} disabled={!!castingSpellId || isSaving}>Close</Button></div>
        </div>
      </div>
      <SpellDetailPane spell={infoPaneSpell} onClose={() => setInfoPaneSpell(null)} />
    </div>
  );
}