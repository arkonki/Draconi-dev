import React, { useState, useEffect, useCallback } from 'react';
import { useDice, DiceType, DiceRollResult, RollHistoryEntry } from './DiceContext';
import { Dices, X, History, Trash2, Star, ShieldOff, Skull, HeartPulse, ShieldQuestion, GraduationCap } from 'lucide-react';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';

// FIXED: DiceIcon component now renders the die type text for clarity.
const DiceIcon = ({ type }: { type: DiceType }) => (
  <span className="font-semibold text-xs uppercase">{type}</span>
);

const DICE_VALUES: Record<DiceType, number> = {
  d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20,
};

function rollDie(type: DiceType): number {
  return Math.floor(Math.random() * DICE_VALUES[type]) + 1;
}

export function DiceRollerModal() {
  const {
    showDiceRoller,
    toggleDiceRoller,
    currentConfig,
    dicePool,
    addDie,
    removeLastDie,
    clearDicePool,
    isBoonActive,
    isBaneActive,
    setBoon,
    setBane,
    addRollToHistory,
    rollHistory,
    clearHistory,
  } = useDice();
  const { markSkillInSession } = useCharacterSheetStore();

  const [results, setResults] = useState<DiceRollResult[]>([]);
  const [boonResults, setBoonResults] = useState<DiceRollResult[]>([]);
  const [finalOutcome, setFinalOutcome] = useState<number | string | null>(null);
  const [isCritical, setIsCritical] = useState(false);
  const [isSuccess, setIsSuccess] = useState<boolean | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);

  const isSkillCheck = currentConfig?.rollMode === 'skillCheck';
  const isDeathRoll = currentConfig?.rollMode === 'deathRoll';
  const isRallyRoll = currentConfig?.rollMode === 'rallyRoll';
  const isRecoveryRoll = currentConfig?.rollMode === 'recoveryRoll';
  const isAdvancementRoll = currentConfig?.rollMode === 'advancementRoll';

  const handleRoll = useCallback(() => {
    if (dicePool.length === 0) return;

    // Clear previous results when a new roll is made
    setResults([]);
    setBoonResults([]);
    setFinalOutcome(null);
    setIsCritical(false);
    setIsSuccess(undefined);

    const currentResults: DiceRollResult[] = dicePool.map(type => ({ type, value: rollDie(type) }));
    let currentBoonResults: DiceRollResult[] = [];
    let finalValue: number | string = currentResults.reduce((sum, r) => sum + r.value, 0);
    // FIXED: Store the numeric result before it's potentially turned into a string.
    let numericFinalValue: number = finalValue; 
    let crit = false;
    let success: boolean | undefined = undefined;
    let skillName = currentConfig?.skillName;

    if ((isBoonActive || isBaneActive) && dicePool.length === 1 && dicePool[0] === 'd20') {
      currentBoonResults = [{ type: 'd20', value: rollDie('d20') }];
      const firstRoll = currentResults[0].value;
      const secondRoll = currentBoonResults[0].value;
      // In a roll-under system, Boon is the MINIMUM value, Bane is the MAXIMUM.
      numericFinalValue = isBoonActive ? Math.min(firstRoll, secondRoll) : Math.max(firstRoll, secondRoll);
      finalValue = numericFinalValue;
    } else if (dicePool.length === 1 && dicePool[0] === 'd20') {
      numericFinalValue = currentResults[0].value;
      finalValue = numericFinalValue;
    }

    if (dicePool.length === 1 && dicePool[0] === 'd20') {
      const rollValue = numericFinalValue;
      if (rollValue === 1) { crit = true; finalValue = "Dragon!"; success = true; }
      if (rollValue === 20) { crit = true; finalValue = "Demon!"; success = false; }

      if (currentConfig?.targetValue !== undefined && !crit) {
        if (isSkillCheck || isRallyRoll || isAdvancementRoll || isDeathRoll) {
          success = rollValue <= currentConfig.targetValue;
        }
      }

      if (isSkillCheck && skillName && (rollValue === 1 || rollValue === 20)) {
        markSkillInSession(skillName);
      }
    } else if (isRecoveryRoll && dicePool.length === 1 && dicePool[0] === 'd6') {
      numericFinalValue = currentResults[0].value;
      finalValue = numericFinalValue;
      success = undefined;
      crit = false;
    }

    setResults(currentResults);
    setBoonResults(currentBoonResults);
    setFinalOutcome(finalValue);
    setIsCritical(crit);
    setIsSuccess(success);

    const historyEntryData = {
      description: currentConfig?.description || `${dicePool.join(', ')} Roll`,
      dicePool: [...dicePool],
      results: currentResults,
      boonResults: currentBoonResults.length > 0 ? currentBoonResults : undefined,
      finalOutcome: finalValue,
      isBoon: isBoonActive,
      isBane: isBaneActive,
      targetValue: currentConfig?.targetValue,
      isSuccess: success,
      isCritical: crit,
      skillName: skillName,
    };
    addRollToHistory(historyEntryData);

    // Call callbacks
    if (currentConfig?.onRollComplete) {
      currentConfig.onRollComplete(historyEntryData);
    }
    // FIXED: Always pass the numeric value to the onRoll callback.
    if (currentConfig?.onRoll) {
      currentConfig.onRoll({ total: numericFinalValue });
    }
  }, [dicePool, isBoonActive, isBaneActive, currentConfig, addRollToHistory, markSkillInSession, isRecoveryRoll, isSkillCheck, isRallyRoll, isAdvancementRoll, isDeathRoll]);

  useEffect(() => {
    if (!showDiceRoller) {
      setResults([]);
      setBoonResults([]);
      setFinalOutcome(null);
      setIsCritical(false);
      setIsSuccess(undefined);
      setShowHistory(false);
    }
  }, [showDiceRoller]);

  // FIXED: Removed the aggressive useEffect that cleared results on any dice pool change.
  
  if (!showDiceRoller) return null;

  const getModalTitle = () => {
    if (currentConfig?.description) return currentConfig.description;
    if (isDeathRoll) return "Death Save (d20 vs CON)";
    if (isRallyRoll) return "Rally Roll (d20 vs WIL, Bane)";
    if (isRecoveryRoll) return "Recovery Roll (1d6 HP)";
    if (isAdvancementRoll) return "Advancement Roll (d20 vs Skill)";
    if (isSkillCheck) return "Skill Check (d20 vs Skill)";
    return "Dice Roller";
  }

  // FIXED: Populated the function with appropriate icons.
  const getIconForMode = () => {
    if (isDeathRoll) return <Skull className="w-5 h-5" />;
    if (isRallyRoll) return <ShieldQuestion className="w-5 h-5" />;
    if (isRecoveryRoll) return <HeartPulse className="w-5 h-5" />;
    if (isAdvancementRoll) return <GraduationCap className="w-5 h-5" />;
    if (isSkillCheck) return <Dices className="w-5 h-5" />;
    return <Dices className="w-5 h-5" />;
  }

  const controlsDisabled = isDeathRoll || isRallyRoll || isRecoveryRoll || isAdvancementRoll;

  return (
    // FIXED: Added the main modal wrapper, backdrop, and container.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        
        {/* FIXED: Added a structured header with a title and close button. */}
        <div className="p-4 border-b flex justify-between items-center text-lg font-semibold">
          <div className="flex items-center gap-2">
            {getIconForMode()} {getModalTitle()}
          </div>
          <button onClick={() => toggleDiceRoller()} className="text-gray-500 hover:text-gray-800">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-grow">
          {showHistory ? (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-md font-semibold">Roll History</h3>
                <Button onClick={clearHistory} variant="danger" size="xs" disabled={rollHistory.length === 0}>
                  <Trash2 className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
              {rollHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No rolls yet.</p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {rollHistory.map(entry => (
                    <li key={entry.id} className="text-xs border-b pb-1">
                      <p className="font-medium">{entry.description}</p>
                      <p>Pool: {entry.dicePool.join(', ')} {entry.isBoon ? '(Boon)' : ''}{entry.isBane ? '(Bane)' : ''}</p>
                      <p>Rolls: {entry.results.map(r => r.value).join(', ')} {entry.boonResults ? `| Boon/Bane: ${entry.boonResults.map(r => r.value).join(', ')}` : ''}</p>
                      <p>Outcome: <span className="font-semibold">{String(entry.finalOutcome)}</span>
                         {entry.targetValue !== undefined && ` (vs ${entry.targetValue})`}
                         {entry.isSuccess === true && <span className="text-green-600 ml-1">(Success)</span>}
                         {entry.isSuccess === false && <span className="text-red-600 ml-1">(Failure)</span>}
                         {entry.isCritical && <span className="text-purple-600 ml-1">(Critical!)</span>}
                      </p>
                      {entry.skillName && <p className="text-gray-500">Skill: {entry.skillName}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 border rounded bg-gray-50 min-h-[50px] flex flex-wrap gap-2 items-center">
                {dicePool.length === 0 ? (
                  <span className="text-gray-500 italic">Dice pool is empty</span>
                ) : (
                  dicePool.map((die, index) => (
                    <button
                      key={index}
                      // FIXED: The argument to removeLastDie is unnecessary and has been removed.
                      onClick={() => !controlsDisabled && removeLastDie()}
                      className={`px-2 py-1 border rounded shadow-sm flex items-center ${controlsDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-white hover:bg-red-50 hover:border-red-300'}`}
                      title={controlsDisabled ? undefined : `Remove last die`}
                      disabled={controlsDisabled}
                    >
                      <DiceIcon type={die} />
                      {!controlsDisabled && <X className="w-3 h-3 ml-1 text-red-500" />}
                    </button>
                  ))
                )}
              </div>

              {!controlsDisabled && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                  {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as DiceType[]).map(die => (
                    <Button key={die} onClick={() => addDie(die)} variant="outline" size="sm" className="flex justify-center items-center">
                      <DiceIcon type={die} />
                    </Button>
                  ))}
                </div>
              )}

              {dicePool.length === 1 && dicePool[0] === 'd20' && !controlsDisabled && (
                <div className="flex justify-center gap-4 mb-4">
                  <Button
                    onClick={() => setBoon(!isBoonActive)}
                    variant={isBoonActive ? "success" : "outline"}
                    size="sm"
                    className={`flex items-center ${isBoonActive ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
                  >
                    <Star className={`w-4 h-4 mr-1 ${isBoonActive ? 'text-white' : 'text-green-500'}`} /> Boon
                  </Button>
                  <Button
                    onClick={() => setBane(!isBaneActive)}
                    variant={isBaneActive ? "danger" : "outline"}
                    size="sm"
                    className={`flex items-center ${isBaneActive ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
                  >
                    <ShieldOff className={`w-4 h-4 mr-1 ${isBaneActive ? 'text-white' : 'text-red-500'}`} /> Bane
                  </Button>
                </div>
              )}

              {results.length > 0 && (
                <div className="mt-4 p-3 border rounded bg-blue-50 border-blue-200 text-center">
                  <p className="text-sm text-blue-700 mb-1">
                    Rolled: {results.map(r => r.value).join(', ')}
                    {boonResults.length > 0 && ` | Boon/Bane: ${boonResults.map(r => r.value).join(', ')}`}
                  </p>
                  <p className={`text-2xl font-bold ${isCritical ? 'text-purple-600' : 'text-blue-900'}`}>
                    {String(finalOutcome)}
                  </p>
                  {currentConfig?.targetValue !== undefined && !isCritical && (
                    <p className="text-sm text-gray-600">(Target: {currentConfig.targetValue})</p>
                  )}
                  {isSuccess === true && !isCritical && (
                    <p className="text-green-600 font-semibold mt-1">Success!</p>
                  )}
                  {isSuccess === false && !isCritical && (
                    <p className="text-red-600 font-semibold mt-1">Failure!</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t flex justify-between items-center bg-gray-50">
          <div>
            <Button onClick={() => setShowHistory(!showHistory)} variant="secondary" size="sm">
              <History className="w-4 h-4 mr-1" /> {showHistory ? 'Roller' : 'History'}
            </Button>
            {!showHistory && !controlsDisabled && (
              <Button onClick={clearDicePool} variant="ghost" size="sm" className="ml-2 text-red-600 hover:bg-red-100" disabled={dicePool.length === 0}>
                <Trash2 className="w-4 h-4 mr-1" /> Clear Pool
              </Button>
            )}
          </div>
          {!showHistory && (
            <Button onClick={handleRoll} disabled={dicePool.length === 0} size="lg">
              <Dices className="w-5 h-5 mr-2" /> Roll
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
