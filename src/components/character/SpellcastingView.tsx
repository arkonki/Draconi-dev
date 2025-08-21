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
    // --- DEBUG LOG ---
    console.log(`[SpellcastingView - Fallback] Skill: ${skillName}, Trained: ${isTrained}, Base Attr (${attribute}): ${baseValue}, Base Chance: ${baseChance}, Final Fallback: ${isTrained ? baseChance * 2 : baseChance}`);
    // --- END DEBUG LOG ---
    return isTrained ? baseChance * 2 : baseChance;
};

const parseSkillLevels = (skillLevelsData: any): Record<string, number> => {
  if (typeof skillLevelsData === 'string') {
    try {
      const parsed = JSON.parse(skillLevelsData);
      return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
    } catch (e) {
      console.error("Error parsing skill_levels JSON:", e);
      return {};
    }
  } else if (typeof skillLevelsData === 'object' && skillLevelsData !== null) {
    return skillLevelsData;
  }
  return {};
};
// --- End Helper Functions ---

export function SpellcastingView({ onClose }: SpellcastingViewProps) {
  const [castError, setCastError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [castingSpellId, setCastingSpellId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('prepared');
  const [powerLevels, setPowerLevels] = useState<Record<string, number>>({}); // { spellId: level }
  const [selectedRankFilter, setSelectedRankFilter] = useState<RankFilter>('all');
  const { toggleDiceRoller } = useDice();

  const {
    character,
    updateCharacterData,
    isSaving,
    setActiveStatusMessage // Get the action to set status messages
  } = useCharacterSheetStore();

  const {
    learnedSpells,
    characterSchoolName, // This might be "Animist" (from magic_schools table)
    loading: spellsLoading,
    error: spellsError,
  } = useSpells(character?.id);

  // --- Preparation Logic ---
  const intValue = character?.attributes?.INT ?? 10;
  const preparationLimit = getBaseChance(intValue);
  const preparedSpellIds = useMemo(() => new Set(character?.prepared_spells ?? []), [character?.prepared_spells]);
  const preparedRankedSpellCount = useMemo(() => {
      return learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id)).length;
  }, [learnedSpells, preparedSpellIds]);
  const canPrepareMore = preparedRankedSpellCount < preparationLimit;

  const handleTogglePrepare = async (spellId: string, currentIsPrepared: boolean) => {
    setPrepError(null);
    if (!character) return;

    const currentPrepared = character.prepared_spells ?? [];
    let updatedPrepared: string[];

    if (currentIsPrepared) {
      updatedPrepared = currentPrepared.filter(id => id !== spellId);
    } else {
      if (!canPrepareMore) {
        setPrepError(`Preparation limit reached (${preparationLimit} spells based on INT ${intValue}).`);
        return;
      }
      updatedPrepared = [...currentPrepared, spellId];
    }

    try {
      await updateCharacterData({ prepared_spells: updatedPrepared });
    } catch (err) {
      console.error("Error updating prepared spells:", err);
      setPrepError(err instanceof Error ? err.message : 'Failed to update preparation');
    }
  };
  // --- End Preparation Logic ---

  // --- Spell Lists for Tabs ---
  const { preparedSpellsList, grimoireSpellsList } = useMemo(() => {
    const tricks = learnedSpells.filter(spell => spell.rank === 0);
    const preparedRankedSpells = learnedSpells.filter(spell => spell.rank > 0 && preparedSpellIds.has(spell.id));
    const prepared = [...tricks, ...preparedRankedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    const grimoire = [...learnedSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return { preparedSpellsList: prepared, grimoireSpellsList: grimoire };
  }, [learnedSpells, preparedSpellIds]);
  // --- End Spell Lists ---

  // --- Dynamic Rank Filters ---
  const availableRanks = useMemo(() => {
    const ranks = new Set<number>();
    learnedSpells.forEach(spell => ranks.add(spell.rank));
    return Array.from(ranks).sort((a, b) => a - b);
  }, [learnedSpells]);

  const rankFilters = useMemo(() => {
    const filters: { label: string; value: RankFilter }[] = [{ label: 'All', value: 'all' }];
    availableRanks.forEach(rank => {
      if (rank === 0) {
        filters.push({ label: 'Trick', value: 0 });
      } else if (rank >= 1 && rank <= 9) { // Only include ranks 1-9
        filters.push({ label: `Rank ${rank}`, value: rank as RankFilter });
      }
    });
    return filters;
  }, [availableRanks]);
  // --- End Dynamic Rank Filters ---

  // --- Filtered Spell List ---
  const spellsToDisplay = useMemo(() => {
    const baseList = activeTab === 'prepared' ? preparedSpellsList : grimoireSpellsList;
    if (selectedRankFilter === 'all') {
      return baseList;
    }
    const numericFilter = typeof selectedRankFilter === 'number' ? selectedRankFilter : -1;
    return baseList.filter(spell => spell.rank === numericFilter);
  }, [activeTab, preparedSpellsList, grimoireSpellsList, selectedRankFilter]);
  // --- End Filtered Spell List ---

  // --- Magic Skill Calculation ---
  const magicSchoolDisplayName = characterSchoolName; // Name from the spell's school (e.g., "Animist")
  let actualMagicSkillName: string | null = null; // The name used in skills (e.g., "Animism")
  let magicSkillValue: number | null = null;
  let isMagicSkillAffected = false;

  // List of known magic skill names (expand as needed)
  const KNOWN_MAGIC_SKILLS = ['Animism', 'Elementalism', 'Symbolism', 'General Magic']; // Add other relevant magic skills

  if (character && magicSchoolDisplayName) {
      // Attempt to find the corresponding actual skill name in the character's skills
      const characterSkills = new Set([
          ...(character.trainedSkills ?? []),
          ...Object.keys(character.skill_levels ?? {})
      ]);

      // Simple direct mapping for known cases (can be expanded)
      if (magicSchoolDisplayName === 'Animist' && characterSkills.has('Animism')) {
          actualMagicSkillName = 'Animism';
      } else if (magicSchoolDisplayName === 'Elementalist' && characterSkills.has('Elementalism')) {
          actualMagicSkillName = 'Elementalism';
      } else {
          // Fallback: Check if any known magic skill is present
          actualMagicSkillName = KNOWN_MAGIC_SKILLS.find(skill => characterSkills.has(skill)) ?? null;
          if (!actualMagicSkillName && characterSkills.has(magicSchoolDisplayName)) {
             // If the display name itself is a skill the character has (e.g., "General Magic")
             actualMagicSkillName = magicSchoolDisplayName;
          }
      }

		// --- DEBUG LOG ---
      console.log(`[SpellcastingView - Calc] Character ID: ${character.id}`);
      console.log(`[SpellcastingView - Calc] Derived School Name (Display Hint): ${magicSchoolDisplayName}`);
      console.log(`[SpellcastingView - Calc] Determined Actual Magic Skill Name: ${actualMagicSkillName}`);
      console.log(`[SpellcastingView - Calc] Character Skills Set:`, characterSkills);
      // --- END DEBUG LOG ---

      if (actualMagicSkillName) {
          const parsedSkillLevels = parseSkillLevels(character.skill_levels);
          const storedLevel = parsedSkillLevels?.[actualMagicSkillName]; // Use actual skill name
          const isTrainedCheck = character.trainedSkills?.includes(actualMagicSkillName) ?? false; // Use actual skill name

          // --- DEBUG LOG ---
          console.log(`[SpellcastingView - Calc] Trained Skills Array:`, character.trainedSkills);
          console.log(`[SpellcastingView - Calc] Is ${actualMagicSkillName} Trained?: ${isTrainedCheck}`);
          console.log(`[SpellcastingView - Calc] Parsed Skill Levels:`, parsedSkillLevels);
          console.log(`[SpellcastingView - Calc] Stored Level for ${actualMagicSkillName}: ${storedLevel}`);
          // --- END DEBUG LOG ---

          if (storedLevel !== undefined) {
              magicSkillValue = storedLevel;
              console.log(`[SpellcastingView - Calc] Using stored level: ${magicSkillValue}`);
          } else {
              // Fallback should ideally only trigger if skill is trained but level isn't stored (unlikely)
              console.log(`[SpellcastingView - Calc] No stored level found for ${actualMagicSkillName}, calculating fallback...`);
              magicSkillValue = calculateFallbackLevel(character, actualMagicSkillName); // Use actual skill name
          }

          isMagicSkillAffected = character.conditions?.scared ?? false; // WIL condition
          console.log(`[SpellcastingView - Calc] Final Magic Skill Value: ${magicSkillValue}, Affected by Bane: ${isMagicSkillAffected}`);

      } else {
          console.warn(`[SpellcastingView - Calc] Could not determine actual magic skill name for character based on school '${magicSchoolDisplayName}'.`);
          // Handle case where no known magic skill is found? Maybe fallback to WIL base? Or show error?
          // For now, skill value remains null.
      }

  } else {
      console.log(`[SpellcastingView - Calc] Skipping calculation: Character or Derived School Name missing. Name: ${magicSchoolDisplayName}`);
  }
  // --- End Magic Skill Calculation ---

  // Initialize power levels
  useEffect(() => {
    const initialLevels: Record<string, number> = {};
    learnedSpells.forEach(spell => {
      if (spell.powerLevel === 'yes') {
        initialLevels[spell.id] = powerLevels[spell.id] || 1;
      }
    });
    setPowerLevels(initialLevels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnedSpells]); // Rerun when learned spells change

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
        setCastError(`Insufficient Willpower Points (Need ${actualWpCost}, Have ${currentWP})`);
        setCastingSpellId(null);
        return;
      }

      const newWP = currentWP - actualWpCost;
      await updateCharacterData({ current_wp: newWP });

      // Set status message on successful cast
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
      const newLevel = Math.max(1, Math.min(3, currentLevel + delta)); // Assuming max power level is 3
      return { ...prev, [spellId]: newLevel };
    });
  };

  const handleMagicSkillClick = () => {
    // Use actualMagicSkillName here
    if (!actualMagicSkillName || magicSkillValue === null) return;
    toggleDiceRoller({
      initialDice: ['d20'],
      rollMode: 'skillCheck',
      targetValue: magicSkillValue,
      description: `${actualMagicSkillName} Check`, // Use actual skill name
      requiresBane: isMagicSkillAffected,
      skillName: actualMagicSkillName, // Use actual skill name
    });
  };

  // --- Spell Card Component ---
  const SpellCard = ({ spell, isPreparedView }: { spell: DetailedSpell, isPreparedView: boolean }) => {
    const isPrepared = preparedSpellIds.has(spell.id);
    const isTrick = spell.rank === 0;
    const canTogglePrep = !isTrick && (isPrepared || canPrepareMore);
    const isPowerLevelSpell = spell.powerLevel === 'yes';
    const selectedLevel = powerLevels[spell.id] || 1;
    const baseWpCost = Number(spell.willpowerCost ?? 0);
    const actualWpCost = isPowerLevelSpell ? baseWpCost + (selectedLevel - 1) * 2 : baseWpCost;
    const insufficientWp = (character.current_wp ?? character.attributes.WIL) < actualWpCost;

    // Determine rank label and styling
    let rankLabel = `Rank ${spell.rank}`;
    let rankBgColor = 'bg-amber-100';
    let rankTextColor = 'text-amber-800';
    let rankBorderColor = 'border-amber-200';

    if (spell.rank === 0) {
      rankLabel = 'Trick';
      rankBgColor = 'bg-gray-100';
      rankTextColor = 'text-gray-800';
      rankBorderColor = 'border-gray-300';
    } else if (spell.rank <= 1) {
      rankBgColor = 'bg-blue-100';
      rankTextColor = 'text-blue-800';
      rankBorderColor = 'border-blue-200';
    } else if (spell.rank <= 3) {
      rankBgColor = 'bg-purple-100';
      rankTextColor = 'text-purple-800';
      rankBorderColor = 'border-purple-200';
    } // Higher ranks keep the amber color

    return (
      <div className={`bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between ${!isPreparedView && !isTrick ? 'opacity-70' : ''}`}>
        {/* Card Content */}
        <div>
          {/* Header: Name & Prep Toggle */}
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base text-gray-900 flex items-center gap-1.5">
              {spell.name}
            </h3>
            {/* Preparation Toggle (Grimoire View Only) */}
            {!isPreparedView && (
              <div className="ml-2 flex-shrink-0">
                {isTrick ? (
                  <CheckSquare className="w-5 h-5 text-green-500" title="Tricks are always prepared" />
                ) : (
                  <button
                    onClick={() => handleTogglePrepare(spell.id, isPrepared)}
                    disabled={!canTogglePrep || isSaving}
                    className={`disabled:opacity-50 disabled:cursor-not-allowed ${isSaving ? 'animate-pulse' : ''}`}
                    title={isPrepared ? "Click to unprepare" : canPrepareMore ? "Click to prepare" : `Preparation limit reached (${preparationLimit})`}
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

          {/* Rank & WP Cost */}
          <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${rankBgColor} ${rankTextColor} border ${rankBorderColor}`}>
              {rankLabel}
            </span>
            <div className="flex items-center gap-1">
              <Zap size={14} className="text-gray-400" />
              <span>
                {actualWpCost} WP
                {isPowerLevelSpell && selectedLevel > 1 && <span className="text-xs text-blue-600"> (Lvl {selectedLevel})</span>}
              </span>
            </div>
          </div>

          {/* Spell Details */}
          <div className="text-xs text-gray-600 space-y-2 mb-4">
            {spell.requirement && (
              <p className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200"><span className="font-medium">Requirement:</span> {spell.requirement}</p>
            )}
            <p className="whitespace-normal break-words"><span className="font-medium">Description:</span> {spell.description || 'No description available.'}</p>
            <hr className="border-gray-200 my-2" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-500">
              <div className="flex items-center gap-1"><Clock size={12} /> {spell.castingTime}</div>
              <div className="flex items-center gap-1"><Target size={12} /> {spell.range}</div>
              <div className="flex items-center gap-1"><Calendar size={12} /> {spell.duration}</div>
              <div className="flex items-center gap-1"><Zap size={12} /> {baseWpCost} WP {isPowerLevelSpell ? '(Base)' : ''}</div>
            </div>
          </div>

        </div>

        {/* Action Buttons (Prepared View Only) */}
        {isPreparedView && (
          <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex items-center justify-center gap-1">
              {isPowerLevelSpell ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => handlePowerLevelChange(spell.id, -1)} disabled={selectedLevel <= 1 || castingSpellId !== null || isSaving} className="px-2" aria-label="Decrease power level" title="Decrease power level"> <Minus size={14} /> </Button>
                  <Button variant="primary" size="sm" onClick={() => handleCastSpell(spell)} loading={castingSpellId === spell.id || isSaving} disabled={castingSpellId !== null || isSaving || insufficientWp} className="flex-grow min-w-[80px]" title={insufficientWp ? `Insufficient WP (Need ${actualWpCost})` : `Cast ${spell.name} at Level ${selectedLevel}`}> {castingSpellId === spell.id ? '' : `Cast Lvl ${selectedLevel}`} </Button>
                  <Button variant="primary" size="sm" onClick={() => handlePowerLevelChange(spell.id, 1)} disabled={selectedLevel >= 3 || castingSpellId !== null || isSaving} className="px-2" aria-label="Increase power level" title="Increase power level"> <Plus size={14} /> </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => handleCastSpell(spell)} loading={castingSpellId === spell.id || isSaving} disabled={castingSpellId !== null || isSaving || insufficientWp} className="w-full" title={insufficientWp ? `Insufficient WP (Need ${actualWpCost})` : `Cast ${spell.name}`}> {castingSpellId === spell.id ? '' : 'Cast'} </Button>
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
  // --- End Spell Card Component ---


  if (spellsLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <LoadingSpinner />
          <p className="text-center mt-2 text-gray-600">Loading spell details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="p-6 border-b bg-gray-50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800 mb-1">
                <Sparkles className="w-6 h-6 text-purple-600" />
                Spellcasting
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                 <span>Current WP: <strong className="font-semibold">{character.current_wp ?? character.attributes.WIL}</strong> / {character.attributes.WIL}</span>
                 {actualMagicSkillName && magicSkillValue !== null && ( // Use actualMagicSkillName
                   <div
                     className={`flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded transition-colors ${
                       isMagicSkillAffected
                         ? 'text-red-700 bg-red-50 hover:bg-red-100 ring-1 ring-red-200'
                         : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200'
                     }`}
                     onClick={handleMagicSkillClick}
                     title={`Click to roll ${actualMagicSkillName} (Target ≤ ${magicSkillValue}${isMagicSkillAffected ? ', Bane' : ''})`} // Use actualMagicSkillName
                   >
                     <Dices className="w-3.5 h-3.5" />
                     <span className="font-medium">{actualMagicSkillName}:</span> {/* Use actualMagicSkillName */}
                     <span>{magicSkillValue}</span>
                     {isMagicSkillAffected && <span className="text-xs font-semibold">(Bane)</span>}
                   </div>
                 )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none focus:outline-none mt-[-4px]" aria-label="Close">&times;</button>
          </div>

          {/* Error Messages */}
          {castError && ( <div className="mb-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"><AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-red-800 text-sm">Casting Error</h4><p className="text-xs text-red-700">{castError}</p></div></div> )}
          {prepError && ( <div className="mb-2 flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"><AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-yellow-800 text-sm">Preparation Error</h4><p className="text-xs text-yellow-700">{prepError}</p></div></div> )}
          {spellsError && ( <div className="mb-2 flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"><AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-yellow-800 text-sm">Spell Data Error</h4><p className="text-xs text-yellow-700">{spellsError}</p></div></div> )}

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button
                onClick={() => { setActiveTab('prepared'); setSelectedRankFilter('all'); }} // Reset filter on tab change
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${
                  activeTab === 'prepared'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Wand2 size={16} /> Prepared ({preparedSpellsList.length})
              </button>
              <button
                onClick={() => { setActiveTab('grimoire'); setSelectedRankFilter('all'); }} // Reset filter on tab change
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${
                  activeTab === 'grimoire'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <BookOpen size={16} /> Grimoire ({learnedSpells.length})
              </button>
              <div className="flex-grow"></div>
               <div className="py-3 px-1 text-sm text-gray-500">
                 Preparation Slots: <span className="font-medium">{preparedRankedSpellCount} / {preparationLimit}</span> (INT {intValue})
               </div>
            </nav>
          </div>

          {/* Dynamic Rank Filter Buttons */}
          {learnedSpells.length > 0 && rankFilters.length > 1 && ( // Only show filters if there are spells and more than just 'All'
            <div className="pt-4 flex items-center gap-2 flex-wrap">
               <span className="text-sm font-medium text-gray-600 flex items-center gap-1 mr-1 shrink-0"><Filter size={14} /> Filter:</span>
               {rankFilters.map(filter => (
                 <Button
                   key={filter.value}
                   variant={selectedRankFilter === filter.value ? 'primary' : 'outline'}
                   size="xs"
                   onClick={() => setSelectedRankFilter(filter.value)}
                   className={`px-2.5 py-1 ${selectedRankFilter === filter.value ? '' : 'text-gray-600 bg-white hover:bg-gray-50'}`}
                 >
                   {filter.label}
                 </Button>
               ))}
            </div>
          )}

        </div>

        {/* Spell Grid */}
        <div className="overflow-y-auto flex-grow p-6 bg-gray-50">
          {spellsToDisplay.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {spellsToDisplay.map((spell) => (
                <SpellCard key={spell.id} spell={spell} isPreparedView={activeTab === 'prepared'} />
              ))}
            </div>
          ) : (
            // Empty State
            <div className="text-center py-10 text-gray-500">
              {spellsLoading && <p>Loading spells...</p>}
              {!spellsLoading && spellsError && <p>Could not load spell details.</p>}
              {!spellsLoading && !spellsError && (
                <>
                  {activeTab === 'prepared' && preparedSpellsList.length === 0 && <p>No spells prepared. Go to the Grimoire tab to prepare spells. Tricks are always prepared.</p>}
                  {activeTab === 'grimoire' && grimoireSpellsList.length === 0 && <p>Character has not learned any spells.</p>}
                  {(activeTab === 'prepared' && preparedSpellsList.length > 0 && spellsToDisplay.length === 0) && <p>No prepared spells match the selected rank filter.</p>}
                  {(activeTab === 'grimoire' && grimoireSpellsList.length > 0 && spellsToDisplay.length === 0) && <p>No learned spells match the selected rank filter.</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
           <Button variant="outline" onClick={onClose} disabled={castingSpellId !== null || isSaving}>Close</Button>
        </div>
      </div>
    </div>
  );
}
