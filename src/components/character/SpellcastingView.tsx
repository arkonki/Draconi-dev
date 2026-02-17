import React, { useState, useMemo } from 'react';
import { Spell as DetailedSpell } from '../../types/magic';
import { Character, AttributeName, DiceType } from '../../types/character';
import { Sparkles, Dices, BookOpen, Minus, Plus, CheckSquare, Square, Filter, Zap, Clock, Target, AlertCircle, X } from 'lucide-react';
import { useSpells } from '../../hooks/useSpells';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useDice } from '../dice/useDice';
import type { RollHistoryEntry } from '../dice/diceTypes';
import { sendMessage } from '../../lib/api/chat';

// --- CONFIGURATION ---
const requirementExplanations: Record<string, string> = {
    'Word': 'The spell is activated with a chant or power word.',
    'Gesture': 'The spell is activated by making specific hand movements.',
    'Focus': 'The spell is activated with an item held in your hand.',
    'Ingredient': 'The spell is activated using a certain ingredient.' 
};

const durationExplanations: Record<string, string> = { 
    'Instant': 'The effect occurs instantly and has no lasting effect.', 
    'Round': 'The effect lasts until your turn in the next round.', 
    'Stretch': 'The effect lasts for one stretch of time (15 mins).', 
    'Shift': 'The effect lasts until the end of the current shift (6 hours).', 
    'Concentration': 'The effect ceases if you perform another action, take damage, or fail a WIL roll.' 
};

// --- HELPER FUNCTIONS ---
const isValidDiceType = (s: string): s is DiceType => ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(s.toLowerCase());

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

const getBaseChance = (value: number): number => { if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; };
const calculateFallbackLevel = (character: Character, skillName: string): number => { 
    const attribute: AttributeName = 'WIL'; 
    const isTrained = character.trainedSkills?.includes(skillName) ?? false; 
    const baseValue = character.attributes?.[attribute] ?? 10; 
    const baseChance = getBaseChance(baseValue); 
    return isTrained ? baseChance * 2 : baseChance; 
};

// --- COMPONENT: SPELL DETAIL SLIDER ---
const SpellDetailPane = ({ spell, onClose }: { spell: DetailedSpell | null; onClose: () => void; }) => {
  if (!spell) return null;

  const foundRequirements = Object.keys(requirementExplanations).filter(key => spell.requirement?.includes(key));

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
        aria-label="Close spell details"
      />
      <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col pointer-events-auto border-l border-stone-200 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b bg-stone-50 flex justify-between items-start">
            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Spell Details</div>
                <h3 className="text-2xl font-serif font-bold text-stone-900 leading-none">{spell.name}</h3>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors p-2 -m-2 rounded-full touch-manipulation"><X size={24} /></button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6 bg-white">
            
            {/* Description Box */}
            <div className="prose prose-stone prose-sm max-w-none text-stone-600 leading-relaxed italic border-l-4 border-stone-300 pl-4">
                {spell.description}
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="block text-xs font-bold text-stone-400 uppercase">Rank</span>
                    <span className="font-medium text-stone-800">{spell.rank === 0 ? 'Trick' : `Rank ${spell.rank}`}</span>
                </div>
                <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="block text-xs font-bold text-stone-400 uppercase">Cost</span>
                    <span className="font-medium text-stone-800">{spell.willpowerCost} WP</span>
                </div>
                <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="block text-xs font-bold text-stone-400 uppercase">Time</span>
                    <span className="font-medium text-stone-800">{spell.castingTime}</span>
                </div>
                <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="block text-xs font-bold text-stone-400 uppercase">Range</span>
                    <span className="font-medium text-stone-800">{spell.range}</span>
                </div>
                {spell.dice && (
                    <div className="col-span-2 p-3 bg-purple-50 rounded border border-purple-100">
                        <span className="block text-xs font-bold text-purple-400 uppercase">Damage / Effect</span>
                        <span className="font-bold text-purple-800 flex items-center gap-2"><Dices size={14}/> {spell.dice}</span>
                    </div>
                )}
            </div>

            {/* Requirements Section */}
            {spell.requirement && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                <h4 className="text-xs font-bold text-amber-800 uppercase mb-3 flex items-center gap-2">
                    <AlertCircle size={14}/> Requirements
                </h4>
                <div className="space-y-2 text-sm text-amber-900">
                  {foundRequirements.length > 0 ? (
                    foundRequirements.map(key => {
                      let explanation = requirementExplanations[key];
                      // Parse specific ingredient
                      if (key === 'Ingredient' && spell.requirement) {
                        const ingredientMatch = spell.requirement.match(/Ingredient\s*\(([^)]+)\)/i);
                        if (ingredientMatch && ingredientMatch[1]) {
                          explanation = `Requires: ${ingredientMatch[1]}.`;
                        }
                      }
                      return (
                          <div key={key} className="flex gap-2 items-start">
                              <span className="font-bold whitespace-nowrap">{key}:</span>
                              <span className="opacity-90">{explanation}</span>
                          </div>
                      );
                    })
                  ) : <p>{spell.requirement}</p>}
                </div>
              </div>
            )}

            {/* Duration Explanation */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="text-xs font-bold text-blue-800 uppercase mb-1 flex items-center gap-2"><Clock size={14}/> Duration: {spell.duration}</h4>
                <p className="text-xs text-blue-700 opacity-90">{durationExplanations[spell.duration] || "See description."}</p>
            </div>

        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
interface SpellcastingViewProps { onClose: () => void; }
type ActiveTab = 'prepared' | 'grimoire';
type RankFilter = 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type RollCompletionData = Omit<RollHistoryEntry, 'id' | 'timestamp'>;
type DragonCastChoice = 'double' | 'free' | 'extra';
type PendingDragonCast = {
  spell: DetailedSpell;
  selectedLevel: number;
  fromGrimoire: boolean;
  actualWpCost: number;
  rollValue: number | string;
  skillName: string;
  skillValue: number;
};

export function SpellcastingView({ onClose }: SpellcastingViewProps) {
  const [castError, setCastError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [castingSpellId, setCastingSpellId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('prepared');
  const [selectedRankFilter, setSelectedRankFilter] = useState<RankFilter>('all');
  const [infoPaneSpell, setInfoPaneSpell] = useState<DetailedSpell | null>(null);
  const [nextCastHasBane, setNextCastHasBane] = useState(false);
  const [pendingDragonCast, setPendingDragonCast] = useState<PendingDragonCast | null>(null);

  const { toggleDiceRoller } = useDice();
  const { character, updateCharacterData, isSaving, setActiveStatusMessage } = useCharacterSheetStore();
  const { learnedSpells, loading: spellsLoading } = useSpells(character?.id);

  // Logic
  const intValue = character?.attributes?.INT ?? 10;
  const preparationLimit = getBaseChance(intValue);
  const preparedSpellIds = useMemo(() => new Set(character?.prepared_spells ?? []), [character?.prepared_spells]);
  const preparedRankedSpellCount = useMemo(() => learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)).length, [learnedSpells, preparedSpellIds]);
  const canPrepareMore = preparedRankedSpellCount < preparationLimit;

  const { preparedSpellsList, grimoireSpellsList } = useMemo(() => { 
      const tricks = learnedSpells.filter(spell => spell.rank === 0); 
      const preparedRankedSpells = learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)); 
      const prepared = [...tricks, ...preparedRankedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)); 
      const grimoire = learnedSpells.filter(spell => spell.rank > 0).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)); 
      return { preparedSpellsList: prepared, grimoireSpellsList: grimoire }; 
  }, [learnedSpells, preparedSpellIds]);

  const availableRanks = useMemo(() => Array.from(new Set(learnedSpells.map(spell => spell.rank))).sort((a, b) => a - b), [learnedSpells]);
  
  const spellsToDisplay = useMemo(() => { 
      const baseList = activeTab === 'prepared' ? preparedSpellsList : grimoireSpellsList; 
      if (selectedRankFilter === 'all') return baseList; 
      return baseList.filter(spell => spell.rank === selectedRankFilter); 
  }, [activeTab, preparedSpellsList, grimoireSpellsList, selectedRankFilter]);

  const { actualMagicSkillName, magicSkillValue, isMagicSkillAffected } = useMemo(() => { 
      if (!character) return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false }; 
      const KNOWN_MAGIC_SKILLS = ['Animism', 'Elementalism', 'Mentalism', 'Symbolism']; 
      const skillLevels = character.skill_levels || {}; 
      const trainedSkills = character.trainedSkills || []; 
      const characterSkills = new Set([...trainedSkills, ...Object.keys(skillLevels)]); 
      let determinedSkillName = KNOWN_MAGIC_SKILLS.find(skill => characterSkills.has(skill)); 
      if (!determinedSkillName && characterSkills.has('General Magic')) determinedSkillName = 'General Magic'; 
      if (determinedSkillName) { 
          const storedLevel = skillLevels[determinedSkillName]; 
          const finalSkillValue = storedLevel !== undefined ? storedLevel : calculateFallbackLevel(character, determinedSkillName); 
          const isAffected = character.conditions?.scared ?? false; 
          return { actualMagicSkillName: determinedSkillName, magicSkillValue: finalSkillValue, isMagicSkillAffected: isAffected }; 
      } 
      return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false }; 
  }, [character]);

  if (!character) return null;

  const logCombatEvent = async (content: string) => {
    if (!character.party_id || !character.user_id) return;
    try {
      await sendMessage(character.party_id, character.user_id, content);
    } catch (error) {
      console.error('Failed to send spell combat log message:', error);
    }
  };

  // Handlers
  const handleTogglePrepare = async (spellId: string, currentIsPrepared: boolean) => { 
      setPrepError(null); if (!character) return; 
      const currentPrepared = character.prepared_spells ?? []; 
      let updatedPrepared: string[]; 
      if (currentIsPrepared) { updatedPrepared = currentPrepared.filter(id => id !== spellId); } 
      else { 
          if (!canPrepareMore) { setPrepError(`Limit reached (${preparationLimit}).`); return; } 
          updatedPrepared = [...currentPrepared, spellId]; 
      } 
      try { await updateCharacterData({ prepared_spells: updatedPrepared }); } 
      catch (err) { setPrepError(err instanceof Error ? err.message : 'Failed.'); } 
  };

  const getWpCost = (spell: DetailedSpell, selectedLevel: number) => {
    const baseWpCost = Number(spell.willpowerCost ?? 0);
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    return isPowerLevelSpell ? baseWpCost + (selectedLevel - 1) * 2 : baseWpCost;
  };

  const spendWillpower = async (wpCost: number) => {
    const latestCharacter = useCharacterSheetStore.getState().character ?? character;
    const currentWP = latestCharacter.current_wp ?? latestCharacter.attributes.WIL;
    if (currentWP < wpCost) throw new Error(`Need ${wpCost} WP`);
    await updateCharacterData({ current_wp: currentWP - wpCost });
  };

  const executeSpellCast = async (
    spell: DetailedSpell,
    selectedLevel: number,
    fromGrimoire: boolean,
    options?: { wpSpent?: number; dragonChoice?: DragonCastChoice | null }
  ) => {
    const actualWpCost = getWpCost(spell, selectedLevel);
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    const wpSpent = options?.wpSpent ?? actualWpCost;
    const dragonChoice = options?.dragonChoice ?? null;

    let statusMessage = `Casted ${spell.name}${isPowerLevelSpell ? ` (Lvl ${selectedLevel})` : ''} for ${wpSpent} WP.`;
    if (dragonChoice === 'free') statusMessage = `Casted ${spell.name}${isPowerLevelSpell ? ` (Lvl ${selectedLevel})` : ''} with Dragon surge for 0 WP.`;
    if (dragonChoice === 'double') statusMessage += ' Dragon effect: doubled damage/range.';
    if (dragonChoice === 'extra') statusMessage += ' Dragon effect: cast another spell immediately with bane.';
    if (fromGrimoire) statusMessage += ' (Double time)';
    setActiveStatusMessage(statusMessage);

    if (spell.dice) {
      const scaledDice = getScaledDice(spell.dice, selectedLevel);
      const rollerDice = dragonChoice === 'double' ? [...scaledDice.roller, ...scaledDice.roller] : scaledDice.roller;
      if (rollerDice.length > 0) {
        const diceLabel = dragonChoice === 'double' ? `${scaledDice.display} x2` : scaledDice.display;
        setTimeout(() => {
          toggleDiceRoller({
            initialDice: rollerDice,
            description: `Casting ${spell.name} (Level ${selectedLevel})${dragonChoice === 'double' ? ` [Dragon: ${diceLabel}]` : ''}`,
            rollMode: 'generic'
          });
        }, 100);
      }
    }
  };

  const handleResolveDragonChoice = async (choice: DragonCastChoice) => {
    if (!pendingDragonCast) return;
    const { spell, selectedLevel, fromGrimoire, actualWpCost, rollValue, skillName, skillValue } = pendingDragonCast;
    setPendingDragonCast(null);
    setCastError(null);
    setCastingSpellId(spell.id);
    try {
      const spendWp = choice !== 'free';
      if (spendWp) {
        await spendWillpower(actualWpCost);
      }
      if (choice === 'extra') {
        setNextCastHasBane(true);
      }
      await executeSpellCast(spell, selectedLevel, fromGrimoire, {
        wpSpent: spendWp ? actualWpCost : 0,
        dragonChoice: choice
      });

      const dragonEffectText =
        choice === 'double'
          ? 'Effect chosen: doubled damage/range and target needs a Dragon to resist/parry/dodge.'
          : choice === 'free'
            ? 'Effect chosen: no WP cost.'
            : 'Effect chosen: immediate follow-up cast available with bane.';
      await logCombatEvent(
        `✨ **Cast ${spell.name}** Dragon success (${rollValue} vs ${skillName} ${skillValue}), cast at level ${selectedLevel}. ${dragonEffectText}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed.';
      if (message.startsWith('Need')) {
        const latestCharacter = useCharacterSheetStore.getState().character ?? character;
        const haveWp = latestCharacter.current_wp ?? latestCharacter.attributes.WIL;
        setCastError(`Dragon cast aborted: ${message.replace('Need', 'Need at least')} (you have ${haveWp}). No WP spent.`);
      } else {
        setCastError(`Dragon cast resolution failed for ${spell.name}.`);
      }
      await logCombatEvent(`✨ **Cast ${spell.name}** Dragon resolution failed.`);
    } finally {
      setCastingSpellId(null);
    }
  };

  const handleCastSpell = async (spell: DetailedSpell, selectedLevel: number, fromGrimoire: boolean) => {
    setCastError(null);
    const actualWpCost = getWpCost(spell, selectedLevel);

    // Tricks skip spellcasting check and cast directly.
    if (spell.rank === 0) {
      setCastingSpellId(spell.id);
      try {
        await spendWillpower(actualWpCost);
        await executeSpellCast(spell, selectedLevel, fromGrimoire, { wpSpent: actualWpCost });
        await logCombatEvent(`✨ **Cast ${spell.name}** succeeded at level ${selectedLevel} (${actualWpCost} WP).`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed.';
        if (message.startsWith('Need')) {
          const haveWp = character.current_wp ?? character.attributes.WIL;
          setCastError(`Cannot cast ${spell.name}: ${message.replace('Need', 'Need at least')} (you have ${haveWp}).`);
        } else {
          setCastError(`Casting ${spell.name} failed. Please try again.`);
        }
      } finally {
        setCastingSpellId(null);
      }
      return;
    }

    if (!actualMagicSkillName || magicSkillValue === null) {
      setCastError(`Cannot cast ${spell.name}: no magic skill is available. No WP spent.`);
      return;
    }

    // Pre-check WP before opening the casting check modal.
    const currentWP = character.current_wp ?? character.attributes.WIL;
    if (currentWP < actualWpCost) {
      setCastError(`Cannot cast ${spell.name}: need ${actualWpCost} WP, you have ${currentWP}.`);
      return;
    }

    const usesDragonBane = nextCastHasBane;
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: magicSkillValue,
      skillName: actualMagicSkillName,
      requiresBane: isMagicSkillAffected || usesDragonBane,
      description: `Casting Check: ${spell.name} (${actualMagicSkillName})`,
      onRollComplete: async (resultEntry: RollCompletionData) => {
        try {
          setCastingSpellId(spell.id);
          if (usesDragonBane) {
            setNextCastHasBane(false);
          }
          const rollValue = resultEntry.results?.[0]?.value;
          if (!resultEntry.isSuccess) {
            await spendWillpower(actualWpCost);
            const isDemon = resultEntry.isCritical === true;
            const failureMessage = isDemon
              ? `Casting check failed with a Demon for ${spell.name} (${rollValue ?? '?'} vs ${actualMagicSkillName} ${magicSkillValue}). Spell has no effect, ${actualWpCost} WP spent, cannot push, and mishap risk is in play.`
              : `Casting check failed for ${spell.name} (${rollValue ?? '?'} vs ${actualMagicSkillName} ${magicSkillValue}). Spell has no effect and ${actualWpCost} WP was spent.`;
            setCastError(failureMessage);
            await logCombatEvent(
              `✨ **Cast ${spell.name}** failed (${rollValue ?? '?'} vs ${actualMagicSkillName} ${magicSkillValue}). No effect; ${actualWpCost} WP spent.${isDemon ? ' Demon rolled: cannot push and mishap risk applies.' : ''}`
            );
            return;
          }

          if (resultEntry.isCritical) {
            setPendingDragonCast({
              spell,
              selectedLevel,
              fromGrimoire,
              actualWpCost,
              rollValue: rollValue ?? '?',
              skillName: actualMagicSkillName,
              skillValue: magicSkillValue
            });
            setCastError(`Dragon rolled for ${spell.name}! Choose a Dragon effect to resolve the cast.`);
            await logCombatEvent(
              `✨ **Cast ${spell.name}** Dragon success (${rollValue ?? '?'} vs ${actualMagicSkillName} ${magicSkillValue}). Waiting for Dragon effect choice.`
            );
            return;
          }

          await spendWillpower(actualWpCost);
          await executeSpellCast(spell, selectedLevel, fromGrimoire, { wpSpent: actualWpCost });
          await logCombatEvent(`✨ **Cast ${spell.name}** check succeeded (${rollValue ?? '?'} vs ${actualMagicSkillName} ${magicSkillValue}), cast at level ${selectedLevel} for ${actualWpCost} WP.`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed.';
          if (message.startsWith('Need')) {
            const latestCharacter = useCharacterSheetStore.getState().character ?? character;
            const haveWp = latestCharacter.current_wp ?? latestCharacter.attributes.WIL;
            setCastError(`Cast aborted: ${message.replace('Need', 'Need at least')} (you have ${haveWp}).`);
          } else {
            setCastError(`Casting ${spell.name} failed after a successful check.`);
          }
          await logCombatEvent(`✨ **Cast ${spell.name}** encountered an error after check success.`);
        } finally {
          toggleDiceRoller();
          setCastingSpellId(null);
        }
      }
    });
  };

  const handleMagicSkillClick = () => { 
      if (!actualMagicSkillName || magicSkillValue === null) return; 
      toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: magicSkillValue, description: `${actualMagicSkillName} Check`, requiresBane: isMagicSkillAffected, skillName: actualMagicSkillName }); 
  };

  // --- ROW COMPONENT ---
  const SpellRow = ({ spell }: { spell: DetailedSpell }) => {
    const isPrepared = preparedSpellIds.has(spell.id);
    const isTrick = spell.rank === 0;
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    const [level, setLevel] = useState(1);
    const baseWpCost = Number(spell.willpowerCost ?? 0);
    const actualWpCost = isPowerLevelSpell ? baseWpCost + (level - 1) * 2 : baseWpCost;
    const insufficientWp = (character.current_wp ?? character.attributes.WIL) < actualWpCost;
    const isReactionSpell = spell.castingTime === 'Reaction';
    const scaledDice = getScaledDice(spell.dice, level); // Just for display

    const handleLevelChange = (delta: number) => setLevel(c => Math.max(1, Math.min(3, c + delta)));

    return (
      <div className="flex flex-col sm:flex-row sm:items-center p-3 sm:p-4 border-b border-stone-100 hover:bg-stone-50 transition-colors group">
        {/* Icon / Rank */}
        <div className="mr-4 hidden sm:flex flex-col items-center justify-center w-12 h-12 bg-stone-100 rounded-lg text-stone-500">
           {isTrick ? <Sparkles size={20} /> : <span className="font-serif font-bold text-lg">{spell.rank}</span>}
        </div>

        {/* Main Info */}
        <button
          type="button"
          className="flex-grow min-w-0 cursor-pointer text-left bg-transparent rounded-md touch-manipulation min-h-[44px]"
          onClick={() => setInfoPaneSpell(spell)}
        >
          <div className="flex items-center gap-2 mb-1">
             <h3 className="font-bold text-stone-800 group-hover:text-indigo-700 transition-colors truncate">{spell.name}</h3>
             {isReactionSpell && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 rounded">Reaction</span>}
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
            <div className="flex items-center gap-1" title="Casting Time"><Clock size={12}/> {spell.castingTime}</div>
            <div className="flex items-center gap-1" title="Range"><Target size={12}/> {spell.range}</div>
            <div className="flex items-center gap-1 font-medium text-indigo-600"><Zap size={12}/> {actualWpCost} WP</div>
            {spell.dice && (
                // Display only, clicking cast now handles it
                <span className="flex items-center gap-1 font-bold text-purple-600 bg-purple-50 px-1.5 rounded">
                   <Dices size={12}/> {scaledDice.display}
                </span>
            )}
          </div>
        </button>

        {/* Actions */}
        <div className="mt-3 sm:mt-0 flex items-center gap-3 sm:border-l sm:border-stone-200 sm:pl-4 w-full sm:w-auto justify-between sm:justify-start">
            {activeTab === 'grimoire' && (
               <button 
                  onClick={(e) => { e.stopPropagation(); handleTogglePrepare(spell.id, isPrepared); }} 
                  disabled={!isPrepared && !canPrepareMore || isSaving}
                  className={`p-2.5 min-w-[44px] min-h-[44px] rounded-lg transition-all touch-manipulation ${isPrepared ? 'bg-blue-100 text-blue-700' : 'text-stone-300 hover:bg-stone-100 hover:text-stone-500'}`}
                  title={isPrepared ? "Unprepare" : "Prepare Spell"}
               >
                  {isPrepared ? <CheckSquare size={20}/> : <Square size={20}/>}
               </button>
            )}
            
            {/* Cast Button Group */}
            <div className="flex items-center bg-stone-100 rounded-lg p-0.5 shadow-inner">
               {isPowerLevelSpell && (
                   <button disabled={level<=1} onClick={(e)=>{e.stopPropagation(); handleLevelChange(-1)}} className="p-2 text-stone-400 hover:text-stone-700 disabled:opacity-30 touch-manipulation"><Minus size={16}/></button>
               )}
               
	               <button 
	                  onClick={(e) => { e.stopPropagation(); handleCastSpell(spell, level, activeTab === 'grimoire'); }} 
	                  disabled={!!castingSpellId || !!pendingDragonCast || isSaving || insufficientWp || (isReactionSpell && activeTab === 'grimoire')}
	                  className={`
	                    px-4 py-2 min-h-[44px] text-xs sm:text-sm font-bold uppercase rounded-md shadow-sm transition-all min-w-[84px] flex items-center justify-center gap-1.5 touch-manipulation
	                    ${insufficientWp 
                        ? 'bg-stone-200 text-stone-400 cursor-not-allowed' 
                        : 'bg-white text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 border border-indigo-100'
                    }
                  `}
               >
                  {castingSpellId === spell.id ? <LoadingSpinner size="sm"/> : (
                      <>
                        {spell.dice && <Dices size={12} />}
                        {isPowerLevelSpell ? `Lvl ${level}` : 'Cast'}
                      </>
                  )}
               </button>
               
               {isPowerLevelSpell && (
                   <button disabled={level>=3} onClick={(e)=>{e.stopPropagation(); handleLevelChange(1)}} className="p-2 text-stone-400 hover:text-stone-700 disabled:opacity-30 touch-manipulation"><Plus size={16}/></button>
               )}
            </div>
        </div>
      </div>
    );
  };

  if (spellsLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close spellbook"
      />
      
      <div className="relative bg-white w-full max-w-4xl h-[100dvh] sm:h-[85vh] rounded-none sm:rounded-xl shadow-2xl flex flex-col overflow-hidden border-0 sm:border border-stone-200 animate-in zoom-in-95 duration-200">
         
         {/* Header */}
         <div className="p-4 sm:p-6 border-b border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="min-w-0">
               <h2 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-2">
                  <Sparkles className="text-purple-600"/> Spellbook
               </h2>
               <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-sm text-stone-600">
                  <div className="flex items-center gap-1 bg-white px-2 py-1.5 min-h-[40px] rounded border border-stone-200 shadow-sm">
                     <Zap size={14} className="text-indigo-500"/>
                     <span className="font-bold">{character.current_wp ?? character.attributes.WIL}</span>
                     <span className="text-stone-400">/</span>
                     <span>{character.attributes.WIL} WP</span>
                  </div>
                  
                  {actualMagicSkillName && (
                     <button 
                        onClick={handleMagicSkillClick}
                        className={`flex items-center gap-1 px-2 py-1.5 min-h-[40px] rounded border shadow-sm transition-colors touch-manipulation ${isMagicSkillAffected ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}
                     >
                        <Dices size={14}/>
                        <span className="font-bold">{actualMagicSkillName}</span>
                        <span className="bg-white/50 px-1.5 rounded text-xs">{magicSkillValue}</span>
                     </button>
                  )}
               </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-stone-200 rounded-full text-stone-400 transition-colors touch-manipulation self-end sm:self-auto"><X/></button>
         </div>

         {/* Alerts */}
	         {(castError || prepError) && (
	            <div className={`px-4 sm:px-6 py-2 text-xs font-bold text-center ${castError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
	               {castError || prepError}
	            </div>
	         )}
	         {nextCastHasBane && !pendingDragonCast && (
	            <div className="px-4 sm:px-6 py-2 text-xs font-bold text-center bg-violet-100 text-violet-800">
	               Dragon effect active: your next spellcasting check will roll with bane.
	            </div>
	         )}
	         {pendingDragonCast && (
	            <div className="px-4 sm:px-6 py-3 bg-emerald-50 border-b border-emerald-200">
	               <p className="text-xs sm:text-sm font-bold text-emerald-800 mb-2">
	                  Dragon on {pendingDragonCast.spell.name}: choose how to resolve the cast.
	               </p>
	               <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
	                  <button
	                     type="button"
	                     onClick={() => handleResolveDragonChoice('double')}
	                     className="px-3 py-2 min-h-[44px] rounded-md bg-white border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 touch-manipulation"
	                  >
	                     Double damage/range
	                  </button>
	                  <button
	                     type="button"
	                     onClick={() => handleResolveDragonChoice('free')}
	                     className="px-3 py-2 min-h-[44px] rounded-md bg-white border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 touch-manipulation"
	                  >
	                     No WP cost
	                  </button>
	                  <button
	                     type="button"
	                     onClick={() => handleResolveDragonChoice('extra')}
	                     className="px-3 py-2 min-h-[44px] rounded-md bg-white border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100 touch-manipulation"
	                  >
	                     Extra cast with bane
	                  </button>
	               </div>
	            </div>
	         )}

         {/* Tabs & Filters */}
         <div className="bg-white px-4 sm:px-6 py-2 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-stone-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
               <button onClick={() => setActiveTab('prepared')} className={`px-4 py-2 min-h-[40px] text-sm font-bold rounded-md transition-all whitespace-nowrap touch-manipulation ${activeTab === 'prepared' ? 'bg-white text-indigo-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                  Prepared ({preparedSpellsList.length})
               </button>
               <button onClick={() => setActiveTab('grimoire')} className={`px-4 py-2 min-h-[40px] text-sm font-bold rounded-md transition-all whitespace-nowrap touch-manipulation ${activeTab === 'grimoire' ? 'bg-white text-indigo-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                  Grimoire ({grimoireSpellsList.length})
               </button>
            </div>
            
            {availableRanks.length > 0 && (
               <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
                  <Filter size={14} className="text-stone-400"/>
                  <button onClick={() => setSelectedRankFilter('all')} className={`text-xs px-3 py-2 min-h-[36px] rounded border whitespace-nowrap touch-manipulation ${selectedRankFilter === 'all' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}>All</button>
                  {availableRanks.map(r => (
                     <button key={r} onClick={() => setSelectedRankFilter(r as RankFilter)} className={`text-xs px-3 py-2 min-h-[36px] rounded border whitespace-nowrap touch-manipulation ${selectedRankFilter === r ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}>
                        {r === 0 ? 'T' : `R${r}`}
                     </button>
                  ))}
               </div>
            )}
         </div>

         {/* Spell List */}
         <div className="flex-grow overflow-y-auto bg-stone-50/30">
            {spellsToDisplay.length > 0 ? (
               <div className="divide-y divide-stone-100">
                  {spellsToDisplay.map(spell => <SpellRow key={spell.id} spell={spell} />)}
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                  <BookOpen size={48} className="mb-4 opacity-20"/>
                  <p>No spells found.</p>
               </div>
            )}
         </div>

         {/* Footer */}
         <div className="p-3 border-t bg-stone-50 text-center text-xs text-stone-400 font-medium">
            Prep Limit: {preparedRankedSpellCount} / {preparationLimit} • Tricks don't count against limit
         </div>
      </div>

      {/* Detail Panel Overlay */}
      <SpellDetailPane spell={infoPaneSpell} onClose={() => setInfoPaneSpell(null)} />
    </div>
  );
}
