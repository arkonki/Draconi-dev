import React, { useState, useEffect, useCallback } from 'react';
import { useDice, DiceType, DiceRollResult, RollHistoryEntry } from './DiceContext';
import { Dices, X, Check, AlertTriangle, Info, Trash2, History, Star, ShieldOff, Skull, HeartPulse, ShieldQuestion, GraduationCap } from 'lucide-react';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore'; // Import store

// Dice SVGs (simplified placeholders - replace with actual SVGs or components)
const DiceIcon = ({ type }: { type: DiceType }) => (
  <span className="font-mono px-1 border rounded bg-gray-100 text-xs">{type}</span>
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
  // Correctly destructure markSkillInSession from the store
  const { markSkillInSession } = useCharacterSheetStore(); // Get action from store

  const [results, setResults] = useState<DiceRollResult[]>([]);
  const [boonResults, setBoonResults] = useState<DiceRollResult[]>([]); // For Boon/Bane second roll
  const [finalOutcome, setFinalOutcome] = useState<number | string | null>(null);
  const [isCritical, setIsCritical] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean | undefined>(undefined); // Undefined = N/A
  const [showHistory, setShowHistory] = useState(false);

  const isSkillCheck = currentConfig?.rollMode === 'skillCheck';
  const isDeathRoll = currentConfig?.rollMode === 'deathRoll';
  const isRallyRoll = currentConfig?.rollMode === 'rallyRoll';
  const isRecoveryRoll = currentConfig?.rollMode === 'recoveryRoll';
  const isAdvancementRoll = currentConfig?.rollMode === 'advancementRoll';

  const handleRoll = useCallback(() => {
    if (dicePool.length === 0) return;

    const currentResults: DiceRollResult[] = dicePool.map(type => ({ type, value: rollDie(type) }));
    let currentBoonResults: DiceRollResult[] = [];
    let finalValue: number | string = currentResults.reduce((sum, r) => sum + r.value, 0);
    let crit = false;
    let success: boolean | undefined = undefined;
    let skillName = currentConfig?.skillName; // Get skill name from config

    // Handle Boon/Bane (only applies if a single d20 is rolled)
    if ((isBoonActive || isBaneActive) && dicePool.length === 1 && dicePool[0] === 'd20') {
      currentBoonResults = [{ type: 'd20', value: rollDie('d20') }];
      const firstRoll = currentResults[0].value;
      const secondRoll = currentBoonResults[0].value;

      if (isBoonActive) {
        finalValue = Math.min(firstRoll, secondRoll); // Boon: take the lower roll
      } else { // isBaneActive
        finalValue = Math.max(firstRoll, secondRoll); // Bane: take the higher roll
      }
    } else if (dicePool.length === 1 && dicePool[0] === 'd20') {
      finalValue = currentResults[0].value; // Single d20 roll value
    }
    // Else: finalValue remains the sum for multiple dice

    // Determine Criticals and Success/Failure for specific roll types
    if (dicePool.length === 1 && dicePool[0] === 'd20') {
      const rollValue = typeof finalValue === 'number' ? finalValue : currentResults[0].value; // Use the determined value (after boon/bane)

      // Dragon/Demon for D20 rolls (Skill, Death, Rally, Advancement)
      if (rollValue === 1) {
        crit = true;
        finalValue = "Dragon!";
        success = true; // Dragon is always success (except maybe death roll?)
      } else if (rollValue === 20) {
        crit = true;
        finalValue = "Demon!";
        success = false; // Demon is always failure
      }

      // Check success against target value if applicable (and not already crit fail)
      if (currentConfig?.targetValue !== undefined && !crit) {
         // Skill/Rally/Advancement: Roll <= Target is success
         if (isSkillCheck || isRallyRoll || isAdvancementRoll) {
            success = rollValue <= currentConfig.targetValue;
         }
         // Death Roll: Roll <= Target is success (but 1 is crit success, 20 is crit fail handled above)
         else if (isDeathRoll) {
             success = rollValue <= currentConfig.targetValue;
             // Override crit flags specifically for death roll interpretation
             if (rollValue === 1) { crit = true; finalValue = "Dragon!"; success = true; } // 2 successes
             if (rollValue === 20) { crit = true; finalValue = "Demon!"; success = false; } // 2 failures
         }
      }

      // Mark skill in store if it was a skill check and rolled 1 or 20
      if (isSkillCheck && skillName && (rollValue === 1 || rollValue === 20)) {
        markSkillInSession(skillName);
      }

    } else if (isRecoveryRoll && dicePool.length === 1 && dicePool[0] === 'd6') {
        // Recovery roll is just the value
        finalValue = currentResults[0].value;
        success = undefined; // Not a success/fail roll
        crit = false;
    }


    setResults(currentResults);
    setBoonResults(currentBoonResults);
    setFinalOutcome(finalValue);
    setIsCritical(crit);
    setIsSuccess(success);

    // Add to history
    const historyEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'> = {
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
      skillName: skillName, // Include skill name in history
    };
    addRollToHistory(historyEntry);

    // Call the onRollComplete callback if provided
    if (currentConfig?.onRollComplete) {
      currentConfig.onRollComplete(historyEntry);
    }

  }, [dicePool, isBoonActive, isBaneActive, currentConfig, addRollToHistory, markSkillInSession]);

  // Reset results when modal is closed or dice pool changes significantly
  useEffect(() => {
    if (!showDiceRoller) {
      setResults([]);
      setBoonResults([]);
      setFinalOutcome(null);
      setIsCritical(false);
      setIsSuccess(undefined);
      setShowHistory(false); // Close history view when modal closes
    }
  }, [showDiceRoller]);

  useEffect(() => {
    // Clear results if pool/boon/bane changes before rolling
    setResults([]);
    setBoonResults([]);
    setFinalOutcome(null);
    setIsCritical(false);
    setIsSuccess(undefined);
  }, [dicePool, isBoonActive, isBaneActive]);


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

  const getIconForMode = () => {
    if (isDeathRoll) return <Skull className="w-5 h-5 mr-2 text-red-500" />;
    if (isRallyRoll) return <ShieldQuestion className="w-5 h-5 mr-2 text-yellow-500" />;
    if (isRecoveryRoll) return <HeartPulse className="w-5 h-5 mr-2 text-green-500" />;
    if (isAdvancementRoll) return <GraduationCap className="w-5 h-5 mr-2 text-blue-500" />;
    if (isSkillCheck) return <Star className="w-5 h-5 mr-2 text-purple-500" />;
    return <Dices className="w-5 h-5 mr-2" />;
  }

  // Disable adding/removing dice for specific modes
  const controlsDisabled = isDeathRoll || isRallyRoll || isRecoveryRoll || isAdvancementRoll;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center">
            {getIconForMode()}
            {getModalTitle()}
          </h2>
          <button onClick={() => toggleDiceRoller()} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-grow">
          {showHistory ? (
            // History View
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
                      <p>Outcome: <span className="font-semibold">{entry.finalOutcome}</span>
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
            // Dice Roller View
            <>
              {/* Dice Pool Display */}
              <div className="mb-4 p-3 border rounded bg-gray-50 min-h-[50px] flex flex-wrap gap-2 items-center">
                {dicePool.length === 0 ? (
                  <span className="text-gray-500 italic">Dice pool is empty</span>
                ) : (
                  dicePool.map((die, index) => (
                    <button
                      key={index}
                      onClick={() => !controlsDisabled && removeLastDie(die)}
                      className={`px-2 py-1 border rounded shadow-sm flex items-center ${controlsDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-white hover:bg-red-50 hover:border-red-300'}`}
                      title={controlsDisabled ? undefined : `Remove ${die}`}
                      disabled={controlsDisabled}
                    >
                      <DiceIcon type={die} />
                      {!controlsDisabled && <X className="w-3 h-3 ml-1 text-red-500" />}
                    </button>
                  ))
                )}
              </div>

              {/* Dice Buttons */}
              {!controlsDisabled && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                  {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as DiceType[]).map(die => (
                    <Button key={die} onClick={() => addDie(die)} variant="outline" size="sm">
                      <DiceIcon type={die} />
                    </Button>
                  ))}
                </div>
              )}

              {/* Boon/Bane Toggle (only for d20) */}
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

              {/* Results Display */}
              {results.length > 0 && (
                <div className="mt-4 p-3 border rounded bg-blue-50 border-blue-200 text-center">
                  <p className="text-sm text-blue-700 mb-1">
                    Rolled: {results.map(r => r.value).join(', ')}
                    {boonResults.length > 0 && ` | Boon/Bane: ${boonResults.map(r => r.value).join(', ')}`}
                  </p>
                  <p className={`text-2xl font-bold ${isCritical ? 'text-purple-600' : 'text-blue-900'}`}>
                    {finalOutcome}
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

        {/* Footer */}
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
