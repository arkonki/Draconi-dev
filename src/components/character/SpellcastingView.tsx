// src/components/character/SpellcastingView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { Spell as DetailedSpell } from '../../types/magic';
import { Character, AttributeName } from '../../types/character';
import { Sparkles, AlertCircle, Clock, Target, Calendar, Zap, Dices, BookOpen, Wand2, Minus, Plus, CheckSquare, Square, Filter } from 'lucide-react';
import { Button } from '../shared/Button';
import { useSpells } from '../../hooks/useSpells';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useDice } from '../dice/DiceContext';

interface SpellcastingViewProps {
  onClose: () => void;
}

type ActiveTab = 'prepared' | 'grimoire';
type RankFilter = 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// --- Helper functions ---
const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const calculateFallbackLevel = (character: Character, skillName: string): number => {
    const attribute: AttributeName = 'WIL'; // Magic skills use WIL
    const isTrained = character.trainedSkills?.includes(skillName) ?? false;
    const baseValue = character.attributes?.[attribute] ?? 10;
    const baseChance = getBaseChance(baseValue);
    return isTrained ? baseChance * 2 : baseChance;
};
// --- End Helper Functions ---

export function SpellcastingView({ onClose }: SpellcastingViewProps) {
  const [castError, setCastError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [castingSpellId, setCastingSpellId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('prepared');
  const [powerLevels, setPowerLevels] = useState<Record<string, number>>({});
  const [selectedRankFilter, setSelectedRankFilter] = useState<RankFilter>('all');
  const { toggleDiceRoller } = useDice();

  const {
    character,
    updateCharacterData,
    isSaving,
    setActiveStatusMessage
  } = useCharacterSheetStore();

  const {
    learnedSpells,
    characterSchoolName,
    loading: spellsLoading,
    error: spellsError,
  } = useSpells(character?.id);

  const intValue = character?.attributes?.INT ?? 10;
  const preparationLimit = getBaseChance(intValue);
  const preparedSpellIds = useMemo(() => new Set(character?.prepared_spells ?? []), [character?.prepared_spells]);
  const preparedRankedSpellCount = useMemo(() => {
      return learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)).length;
  }, [learnedSpells, preparedSpellIds]);
  const canPrepareMore = preparedRankedSpellCount < preparationLimit;

  // --- FIX: Added comprehensive logging to the entire function ---
  const handleTogglePrepare = async (spellId: string, currentIsPrepared: boolean) => {
    const spellBeingToggled = learnedSpells.find(s => s.id === spellId);
    const action = currentIsPrepared ? 'Unprepare' : 'Prepare';
    
    console.log(`[SpellcastingView - Prepare] START: Initiating toggle for spell "${spellBeingToggled?.name || 'Unknown'}". Action: ${action}`);

    setPrepError(null);
    if (!character) {
      console.error("[SpellcastingView - Prepare] FAILED: Character object is not available.");
      return;
    }

    const currentPrepared = character.prepared_spells ?? [];
    let updatedPrepared: string[];

    if (currentIsPrepared) {
      updatedPrepared = currentPrepared.filter(id => id !== spellId);
    } else {
      if (!canPrepareMore) {
        const errorMessage = `Preparation limit reached (${preparationLimit} based on INT ${intValue}).`;
        console.warn(`[SpellcastingView - Prepare] FAILED (UI Rule): ${errorMessage}`);
        setPrepError(errorMessage);
        return;
      }
      updatedPrepared = [...currentPrepared, spellId];
    }
    
    const payload = { prepared_spells: updatedPrepared };
    console.log(`[SpellcastingView - Prepare] BEFORE_SAVE: Calling updateCharacterData with payload:`, payload);

    try {
      await updateCharacterData(payload);
      console.log(`[SpellcastingView - Prepare] SUCCESS: updateCharacterData promise resolved for spell "${spellBeingToggled?.name || 'Unknown'}".`);
    } catch (err) {
      console.error(
        `[SpellcastingView - Prepare] FAILED (catch block): Caught an error during update for spell "${spellBeingToggled?.name || 'Unknown'}".`,
        {
          wasTryingTo: action.toLowerCase(),
          intendedUpdatePayload: payload,
          originalError: err,
        }
      );
      setPrepError(err instanceof Error ? err.message : 'Failed to update preparation');
    } finally {
      console.log(`[SpellcastingView - Prepare] END: Finished toggle attempt for spell "${spellBeingToggled?.name || 'Unknown'}".`);
    }
  };
  // --- End of Fix ---

  const { preparedSpellsList, grimoireSpellsList } = useMemo(() => {
    const tricks = learnedSpells.filter(spell => spell.rank === 0);
    const preparedRankedSpells = learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id));
    const prepared = [...tricks, ...preparedRankedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    const grimoire = [...learnedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return { preparedSpellsList: prepared, grimoireSpellsList: grimoire };
  }, [learnedSpells, preparedSpellIds]);

  const availableRanks = useMemo(() => {
    const ranks = new Set(learnedSpells.map(spell => spell.rank));
    return Array.from(ranks).sort((a, b) => a - b);
  }, [learnedSpells]);

  const rankFilters = useMemo(() => {
    const filters: { label: string; value: RankFilter }[] = [{ label: 'All', value: 'all' }];
    availableRanks.forEach(rank => {
      if (rank === 0) filters.push({ label: 'Trick', value: 0 });
      else if (rank >= 1 && rank <= 9) filters.push({ label: `Rank ${rank}`, value: rank as RankFilter });
    });
    return filters;
  }, [availableRanks]);

  const spellsToDisplay = useMemo(() => {
    const baseList = activeTab === 'prepared' ? preparedSpellsList : grimoireSpellsList;
    if (selectedRankFilter === 'all') return baseList;
    return baseList.filter(spell => spell.rank === selectedRankFilter);
  }, [activeTab, preparedSpellsList, grimoireSpellsList, selectedRankFilter]);

  const { actualMagicSkillName, magicSkillValue, isMagicSkillAffected } = useMemo(() => {
    if (!character || !characterSchoolName) {
      return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false };
    }

    const KNOWN_MAGIC_SKILLS = ['Animism', 'Elementalism', 'Mentalism', 'Symbolism', 'General Magic'];
    const skillLevels = character.skill_levels || {};
    const characterSkills = new Set([...(character.trainedSkills || []), ...Object.keys(skillLevels)]);

    let determinedSkillName: string | null = null;
    if (characterSchoolName === 'Animism' && characterSkills.has('Animism')) {
      determinedSkillName = 'Animism';
    } else if (characterSchoolName === 'Elementalism' && characterSkills.has('Elementalism')) {
      determinedSkillName = 'Elementalism';
    } else if (characterSchoolName === 'Mentalism' && characterSkills.has('Mentalism')) {
      determinedSkillName = 'Mentalism';
    } else {
      determinedSkillName = KNOWN_MAGIC_SKILLS.find(skill => characterSkills.has(skill)) ?? null;
      if (!determinedSkillName && characterSkills.has(characterSchoolName)) {
        determinedSkillName = characterSchoolName;
      }
    }

    if (determinedSkillName) {
      const storedLevel = skillLevels[determinedSkillName];
      const finalSkillValue = storedLevel !== undefined ? storedLevel : calculateFallbackLevel(character, determinedSkillName);
      const isAffected = character.conditions?.scared ?? false;
      return { actualMagicSkillName: determinedSkillName, magicSkillValue: finalSkillValue, isMagicSkillAffected: isAffected };
    }

    console.warn(`[SpellcastingView] Could not determine actual magic skill for school '${characterSchoolName}'.`);
    return { actualMagicSkillName: null, magicSkillValue: null, isMagicSkillAffected: false };
  }, [character, characterSchoolName]);

  useEffect(() => {
    const initialLevels: Record<string, number> = {};
    learnedSpells.forEach(spell => {
      if (spell.powerLevel === 'yes') {
        initialLevels[spell.id] = powerLevels[spell.id] || 1;
      }
    });
    setPowerLevels(initialLevels);
  }, [learnedSpells]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!character) return null;

  const handleCastSpell = async (spell: DetailedSpell) => {
    setCastingSpellId(spell.id);
    setCastError(null);
    try {
      const currentWP = character.current_wp ?? character.attributes.WIL;
      const baseWpCost = Number(spell.willpowerCost ?? 0);
      const selectedLevel = powerLevels[spell.id] || 1;
      const isPowerLevelSpell = spell.powerLevel === 'yes';
      const actualWpCost = isPowerLevelSpell ? baseWpCost + (selectedLevel - 1) * 2 : baseWpCost;

      if (currentWP < actualWpCost) {
        throw new Error(`Insufficient Willpower Points (Need ${actualWpCost}, Have ${currentWP})`);
      }

      const newWP = currentWP - actualWpCost;
      await updateCharacterData({ current_wp: newWP });
      setActiveStatusMessage(`Casted ${spell.name}${isPowerLevelSpell ? ` (Lvl ${selectedLevel})` : ''} for ${actualWpCost} WP.`);
    } catch (err) {
      console.error("Error casting spell:", err);
      setCastError(err instanceof Error ? err.message : 'Failed to cast spell');
    } finally {
      setCastingSpellId(null);
    }
  };

  const handlePowerLevelChange = (spellId: string, delta: number) => {
    setPowerLevels(prev => {
      const currentLevel = prev[spellId] || 1;
      const newLevel = Math.max(1, Math.min(3, currentLevel + delta));
      return { ...prev, [spellId]: newLevel };
    });
  };

  const handleMagicSkillClick = () => {
    if (!actualMagicSkillName || magicSkillValue === null) return;
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: magicSkillValue,
      description: `${actualMagicSkillName} Check`,
      requiresBane: isMagicSkillAffected,
      skillName: actualMagicSkillName,
    });
  };

  const SpellCard = ({ spell, isPreparedView }: { spell: DetailedSpell, isPreparedView: boolean }) => {
    const isPrepared = preparedSpellIds.has(spell.id);
    const isTrick = spell.rank === 0;
    const canTogglePrep = !isTrick && (isPrepared || canPrepareMore);
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    const selectedLevel = powerLevels[spell.id] || 1;
    const baseWpCost = Number(spell.willpowerCost ?? 0);
    const actualWpCost = isPowerLevelSpell ? baseWpCost + (selectedLevel - 1) * 2 : baseWpCost;
    const insufficientWp = (character.current_wp ?? character.attributes.WIL) < actualWpCost;

    let rankLabel = `Rank ${spell.rank}`;
    let rankBgColor = 'bg-amber-100', rankTextColor = 'text-amber-800', rankBorderColor = 'border-amber-200';
    if (spell.rank === 0) {
      rankLabel = 'Trick';
      rankBgColor = 'bg-gray-100'; rankTextColor = 'text-gray-800'; rankBorderColor = 'border-gray-300';
    } else if (spell.rank <= 1) {
      rankBgColor = 'bg-blue-100'; rankTextColor = 'text-blue-800'; rankBorderColor = 'border-blue-200';
    } else if (spell.rank <= 3) {
      rankBgColor = 'bg-purple-100'; rankTextColor = 'text-purple-800'; rankBorderColor = 'border-purple-200';
    }

    return (
      <div className={`bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between ${!isPreparedView && !isTrick ? 'opacity-70' : ''}`}>
        <div>
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base text-gray-900">{spell.name}</h3>
            {!isPreparedView && (
              <div className="ml-2 flex-shrink-0">
                {isTrick ? (
                  <CheckSquare className="w-5 h-5 text-green-500" title="Tricks are always prepared" />
                ) : (
                  <button
                    onClick={() => handleTogglePrepare(spell.id, isPrepared)}
                    disabled={!canTogglePrep || isSaving}
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isPrepared ? "Unprepare" : canPrepareMore ? "Prepare" : `Limit reached (${preparationLimit})`}
                  >
                    {isPrepared
                      ? <CheckSquare className="w-5 h-5 text-blue-600 hover:text-blue-800" />
                      : <Square className={`w-5 h-5 ${canPrepareMore ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300'}`} />
                    }
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${rankBgColor} ${rankTextColor} border ${rankBorderColor}`}>
              {rankLabel}
            </span>
            <div className="flex items-center gap-1">
              <Zap size={14} className="text-gray-400" />
              <span>{actualWpCost} WP{isPowerLevelSpell && selectedLevel > 1 && <span className="text-xs text-blue-600"> (Lvl {selectedLevel})</span>}</span>
            </div>
          </div>
          <div className="text-xs text-gray-600 space-y-2 mb-4">
            {spell.requirement && (
              <p className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200"><span className="font-medium">Requirement:</span> {spell.requirement}</p>
            )}
            <p className="whitespace-normal break-words"><span className="font-medium">Description:</span> {spell.description || 'No description.'}</p>
            <hr className="my-2" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-500">
              <div className="flex items-center gap-1"><Clock size={12} /> {spell.castingTime}</div>
              <div className="flex items-center gap-1"><Target size={12} /> {spell.range}</div>
              <div className="flex items-center gap-1"><Calendar size={12} /> {spell.duration}</div>
              <div className="flex items-center gap-1"><Zap size={12} /> {baseWpCost} WP {isPowerLevelSpell ? '(Base)' : ''}</div>
            </div>
          </div>
        </div>
        {isPreparedView && (
          <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex items-center justify-center gap-1">
              {isPowerLevelSpell ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => handlePowerLevelChange(spell.id, -1)} disabled={selectedLevel <= 1 || !!castingSpellId || isSaving} className="px-2" title="Decrease level"><Minus size={14} /></Button>
                  <Button variant="primary" size="sm" onClick={() => handleCastSpell(spell)} loading={castingSpellId === spell.id || isSaving} disabled={!!castingSpellId || isSaving || insufficientWp} className="flex-grow min-w-[80px]" title={insufficientWp ? `Need ${actualWpCost} WP` : `Cast Lvl ${selectedLevel}`}>{castingSpellId === spell.id ? '' : `Cast Lvl ${selectedLevel}`}</Button>
                  <Button variant="primary" size="sm" onClick={() => handlePowerLevelChange(spell.id, 1)} disabled={selectedLevel >= 3 || !!castingSpellId || isSaving} className="px-2" title="Increase level"><Plus size={14} /></Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => handleCastSpell(spell)} loading={castingSpellId === spell.id || isSaving} disabled={!!castingSpellId || isSaving || insufficientWp} className="w-full" title={insufficientWp ? `Need ${actualWpCost} WP` : `Cast ${spell.name}`}>{castingSpellId === spell.id ? '' : 'Cast'}</Button>
              )}
            </div>
          </div>
        )}
        {!isPreparedView && !isTrick && (
          <div className="mt-auto pt-3 text-center text-xs text-gray-400 italic">
            {isPrepared ? 'Prepared' : 'Prepare in Grimoire'}
          </div>
        )}
      </div>
    );
  };

  if (spellsLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <LoadingSpinner /><p className="text-center mt-2 text-gray-600">Loading spells...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="p-6 border-b bg-gray-50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800 mb-1"><Sparkles className="w-6 h-6 text-purple-600" />Spellcasting</h2>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                 <span>Current WP: <strong className="font-semibold">{character.current_wp ?? character.attributes.WIL}</strong> / {character.attributes.WIL}</span>
                 {actualMagicSkillName && magicSkillValue !== null && (
                   <div
                     className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded transition-colors ${isMagicSkillAffected ? 'text-red-700 bg-red-50 hover:bg-red-100 ring-1 ring-red-200' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200'}`}
                     onClick={handleMagicSkillClick}
                     title={`Click to roll ${actualMagicSkillName} (Target ≤ ${magicSkillValue}${isMagicSkillAffected ? ', Bane' : ''})`}
                   >
                     <Dices className="w-3.5 h-3.5" />
                     <span className="font-medium">{actualMagicSkillName}:</span>
                     <span>{magicSkillValue}</span>
                     {isMagicSkillAffected && <span className="text-xs font-semibold">(Bane)</span>}
                   </div>
                 )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none focus:outline-none mt-[-4px]">&times;</button>
          </div>

          {castError && (<div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg"><h4 className="font-medium text-red-800 text-sm">Casting Error</h4><p className="text-xs text-red-700">{castError}</p></div>)}
          {prepError && (<div className="mb-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"><h4 className="font-medium text-yellow-800 text-sm">Preparation Error</h4><p className="text-xs text-yellow-700">{prepError}</p></div>)}
          {spellsError && (<div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg"><h4 className="font-medium text-red-800 text-sm">Spell Data Error</h4><p className="text-xs text-red-700">{spellsError}</p></div>)}

          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6">
              <button onClick={() => { setActiveTab('prepared'); setSelectedRankFilter('all'); }} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${activeTab === 'prepared' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><Wand2 size={16} /> Prepared ({preparedSpellsList.length})</button>
              <button onClick={() => { setActiveTab('grimoire'); setSelectedRankFilter('all'); }} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${activeTab === 'grimoire' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><BookOpen size={16} /> Grimoire ({learnedSpells.length})</button>
              <div className="flex-grow"></div>
              <div className="py-3 px-1 text-sm text-gray-500">Preparation Slots: <span className="font-medium">{preparedRankedSpellCount} / {preparationLimit}</span> (INT {intValue})</div>
            </nav>
          </div>

          {learnedSpells.length > 0 && rankFilters.length > 1 && (
            <div className="pt-4 flex items-center gap-2 flex-wrap">
               <span className="text-sm font-medium text-gray-600 flex items-center gap-1 mr-1 shrink-0"><Filter size={14} /> Filter:</span>
               {rankFilters.map(filter => (<Button key={filter.value} variant={selectedRankFilter === filter.value ? 'primary' : 'outline'} size="xs" onClick={() => setSelectedRankFilter(filter.value)} className={`px-2.5 py-1 ${selectedRankFilter === filter.value ? '' : 'text-gray-600 bg-white hover:bg-gray-50'}`}>{filter.label}</Button>))}
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-grow p-6 bg-gray-50">
          {spellsToDisplay.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {spellsToDisplay.map((spell) => (<SpellCard key={spell.id} spell={spell} isPreparedView={activeTab === 'prepared'} />))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500">
              {spellsLoading && <p>Loading spells...</p>}
              {!spellsLoading && spellsError && <p>Could not load spell details.</p>}
              {!spellsLoading && !spellsError && (
                <>
                  {activeTab === 'prepared' && preparedSpellsList.length === 0 && <p>No spells prepared. Go to the Grimoire tab. Tricks are always prepared.</p>}
                  {activeTab === 'grimoire' && grimoireSpellsList.length === 0 && <p>Character has not learned any spells.</p>}
                  {spellsToDisplay.length === 0 && <p>No spells match the selected rank filter.</p>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
           <Button variant="outline" onClick={onClose} disabled={!!castingSpellId || isSaving}>Close</Button>
        </div>
      </div>
    </div>
  );
}
