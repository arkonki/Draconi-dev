// src/components/dice/DiceRollerModal.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDice, DiceType, DiceRollResult } from './DiceContext';
import { Dices, X, History, Trash2, Star, ShieldOff, Skull, HeartPulse, ShieldQuestion, GraduationCap, Zap, Moon } from 'lucide-react';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';

const DiceIcon = ({ type }: { type: DiceType }) => (
  <span className="font-semibold text-xs uppercase">{type}</span>
);

const DICE_VALUES: Record<DiceType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

function rollDie(type: DiceType): number {
  return Math.floor(Math.random() * DICE_VALUES[type]) + 1;
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
  );
}

export function DiceRollerModal() {
  const { showDiceRoller, toggleDiceRoller, currentConfig, dicePool, addDie, removeLastDie, clearDicePool, isBoonActive, isBaneActive, setBoon, setBane, addRollToHistory, rollHistory, clearHistory } = useDice();

  const { markSkillThisSession, performRest, setInitiativeForCombatant } = useCharacterSheetStore();

  const [results, setResults] = useState<DiceRollResult[]>([]);
  const [boonResults, setBoonResults] = useState<DiceRollResult[]>([]);
  const [finalOutcome, setFinalOutcome] = useState<number | string | null>(null);
  const [isCritical, setIsCritical] = useState(false);
  const [isSuccess, setIsSuccess] = useState<boolean | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const [modifierCount, setModifierCount] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [displayedOutcome, setDisplayedOutcome] = useState<string | number>('...');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const rollMode = currentConfig?.rollMode;
  const isSkillCheck = rollMode === 'skillCheck';
  const isDeathRoll = rollMode === 'deathRoll';
  const isRallyRoll = rollMode === 'rallyRoll';
  const isRecoveryRoll = rollMode === 'recoveryRoll';
  const isAdvancementRoll = rollMode === 'advancementRoll';
  const isInitiative = rollMode === 'initiative';
  const isRest = rollMode === 'rest';

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  useEffect(() => {
    if (!isBoonActive && !isBaneActive) setModifierCount(1);
  }, [isBoonActive, isBaneActive]);

  const handleBoonClick = () => {
    if (isBaneActive) { setBane(false); setBoon(true); setModifierCount(1); }
    else if (isBoonActive) { if (modifierCount < 3) setModifierCount(p => p + 1); else { setBoon(false); setModifierCount(1); } }
    else { setBoon(true); setModifierCount(1); }
  };

  const handleBaneClick = () => {
    if (isBoonActive) { setBoon(false); setBane(true); setModifierCount(1); }
    else if (isBaneActive) { if (modifierCount < 3) setModifierCount(p => p + 1); else { setBane(false); setModifierCount(1); } }
    else { setBane(true); setModifierCount(1); }
  };

  const handleRoll = useCallback(() => {
    if (dicePool.length === 0) return;

    setIsRolling(true);
    setResults([]);
    setBoonResults([]);
    setFinalOutcome(null);
    setIsCritical(false);
    setIsSuccess(undefined);

    // 1. Calculate Results Immediately
    const currentResults: DiceRollResult[] = dicePool.map(type => ({ type, value: rollDie(type) }));
    let currentBoonResults: DiceRollResult[] = [];
    let finalValue: number | string = currentResults.reduce((sum, r) => sum + r.value, 0);
    let numericFinalValue: number = Number(finalValue); 
    let crit = false;
    let success: boolean | undefined = undefined;
    const skillName = currentConfig?.skillName;

    // --- LOGIC: Dragonbane D20 ---
    if (dicePool.length === 1 && dicePool[0] === 'd20') {
      if (isBoonActive || isBaneActive) {
        for (let i = 0; i < modifierCount; i++) currentBoonResults.push({ type: 'd20', value: rollDie('d20') });
        const allRolls = [currentResults[0].value, ...currentBoonResults.map(r => r.value)];
        numericFinalValue = isBoonActive ? Math.min(...allRolls) : Math.max(...allRolls);
        finalValue = numericFinalValue;
      } else {
        numericFinalValue = currentResults[0].value;
        finalValue = numericFinalValue;
      }
      
      const val = numericFinalValue;

      // ---------------------------------------------------------
      // SMART LOGIC: Differentiate between Skill Check & Advancement
      // ---------------------------------------------------------
      
      if (isAdvancementRoll) {
        // === ADVANCEMENT ROLL ===
        // Success: Roll > Skill Level
        // Dragon (1): Failure (1 is never > skill).
        // Demon (20): Success (20 is always > skill).
        
        if (currentConfig?.targetValue !== undefined) {
             success = val > currentConfig.targetValue;
        }
        
        // We do NOT treat 1/20 as "Dragon/Demon" labels here, 
        // because seeing "Dragon!" (usually good) on a 1 (Failure) is confusing.
        finalValue = val; 

      } else {
        // === STANDARD SKILL CHECK / RALLY / DEATH ===
        // Success: Roll <= Skill Level
        // Dragon (1): Critical Success
        // Demon (20): Critical Failure

        if (val === 1) { 
            crit = true; 
            finalValue = "Dragon!"; 
            success = true; 
        } else if (val === 20) { 
            crit = true; 
            finalValue = "Demon!"; 
            success = false; 
        } else if (currentConfig?.targetValue !== undefined) {
            if (isSkillCheck || isRallyRoll || isDeathRoll) {
                success = val <= currentConfig.targetValue;
            }
        }
      }
    } 
    // --- LOGIC: Recovery / Rest ---
    else if ((isRecoveryRoll || isRest) && dicePool.every(d => d === 'd6')) {
        numericFinalValue = currentResults.reduce((acc, curr) => acc + curr.value, 0);
        finalValue = numericFinalValue;
    }

    // 2. Animation Loop
    let shuffleCount = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      shuffleCount++;
      setDisplayedOutcome(Math.floor(Math.random() * (dicePool[0] === 'd20' ? 20 : 6)) + 1); 
      
      // --- ANIMATION FINISH ---
      if (shuffleCount > 8) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        setIsRolling(false);
        setResults(currentResults);
        setBoonResults(currentBoonResults);
        setFinalOutcome(finalValue);
        setDisplayedOutcome(finalValue);
        setIsCritical(crit);
        setIsSuccess(success);

        // --- SIDE EFFECTS (STORE UPDATES) ---
        // 1. Skill Marking (Dragon/Demon) - ONLY for standard checks
        if (isSkillCheck && skillName && (numericFinalValue === 1 || numericFinalValue === 20)) {
            markSkillThisSession(skillName);
        }

        // 2. Initiative
        if (isInitiative && currentConfig?.combatantId) {
            setInitiativeForCombatant(currentConfig.combatantId, numericFinalValue);
        }

        // 3. Resting
        if (isRest && currentConfig?.restType) {
            if (currentConfig.restType === 'round') {
                performRest('round', 0, numericFinalValue); 
            } else if (currentConfig.restType === 'stretch') {
                performRest('stretch', numericFinalValue, 0); 
            }
        }

        // Log History
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

        if (currentConfig?.onRollComplete) currentConfig.onRollComplete(historyEntryData);
        if (currentConfig?.onRoll) currentConfig.onRoll({ total: numericFinalValue });
      }
    }, 60);

  }, [dicePool, isBoonActive, isBaneActive, modifierCount, currentConfig, addRollToHistory, markSkillThisSession, performRest, setInitiativeForCombatant, rollMode, isSkillCheck, isAdvancementRoll, isInitiative, isRest, isRallyRoll, isDeathRoll, isRecoveryRoll]);

  useEffect(() => {
    if (!showDiceRoller) {
      setResults([]); setBoonResults([]); setFinalOutcome(null); setDisplayedOutcome('...');
      setIsCritical(false); setIsSuccess(undefined); setShowHistory(false); setIsRolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [showDiceRoller]);

  if (!showDiceRoller) return null;

  const getModalTitle = () => {
    if (currentConfig?.description) return currentConfig.description;
    if (isDeathRoll) return "Death Save (d20 vs CON)";
    if (isRallyRoll) return "Rally Roll (d20 vs WIL)";
    if (isRecoveryRoll) return "Recovery Roll (1d6 HP)";
    if (isAdvancementRoll) return "Advancement Roll";
    if (isSkillCheck) return "Skill Check";
    if (isInitiative) return "Initiative Roll";
    if (isRest) return "Resting Roll";
    return "Dice Roller";
  }

  const getIconForMode = () => {
    if (isDeathRoll) return <Skull className="w-5 h-5" />;
    if (isRallyRoll) return <ShieldQuestion className="w-5 h-5" />;
    if (isRecoveryRoll) return <HeartPulse className="w-5 h-5" />;
    if (isAdvancementRoll) return <GraduationCap className="w-5 h-5" />;
    if (isInitiative) return <Zap className="w-5 h-5" />;
    if (isRest) return <Moon className="w-5 h-5" />;
    return <Dices className="w-5 h-5" />;
  }

  const controlsDisabled = isRolling || isDeathRoll || isRallyRoll || isRecoveryRoll || isAdvancementRoll || isInitiative || isRest;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] border border-gray-200 overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center text-lg font-bold text-gray-800">
          <div className="flex items-center gap-2 text-indigo-700">
            {getIconForMode()} {getModalTitle()}
          </div>
          <button onClick={() => toggleDiceRoller()} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-grow flex flex-col">
          {showHistory ? (
            <div className="animate-in slide-in-from-right-4 duration-200">
              <div className="flex justify-between items-center mb-3 border-b pb-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Roll History</h3>
                <Button onClick={clearHistory} variant="danger" size="xs" disabled={rollHistory.length === 0}>
                  <Trash2 className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
              <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {rollHistory.map(entry => (
                    <li key={entry.id} className="text-sm p-2 rounded bg-gray-50 border border-gray-100">
                      <div className="flex justify-between font-bold text-gray-700 mb-1">
                         <span>{entry.description}</span>
                         <span className={entry.isSuccess ? "text-green-600" : entry.isSuccess === false ? "text-red-600" : ""}>{String(entry.finalOutcome)}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex justify-between">
                         <span>{entry.dicePool.join('+')} {entry.isBoon && '(Boon)'}{entry.isBane && '(Bane)'}</span>
                         {entry.isCritical && <span className="text-purple-600 font-bold">CRITICAL</span>}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Dice Pool Display */}
              <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 min-h-[80px] flex flex-wrap gap-2 items-center justify-center">
                {dicePool.length === 0 ? (
                  <span className="text-gray-400 text-sm font-medium">Add dice to roll...</span>
                ) : (
                  dicePool.map((die, index) => (
                    <button key={index} onClick={() => !controlsDisabled && removeLastDie()} disabled={controlsDisabled} className={`w-12 h-12 rounded-lg flex items-center justify-center shadow-sm transition-all transform hover:scale-105 ${controlsDisabled ? 'bg-gray-200 cursor-not-allowed opacity-50' : 'bg-white border border-gray-200 hover:border-red-300 hover:text-red-500'}`}>
                      <DiceIcon type={die} />
                    </button>
                  ))
                )}
              </div>

              {/* Controls */}
              {!controlsDisabled && (
                <div className="grid grid-cols-6 gap-2 mb-6">
                  {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as DiceType[]).map(die => (
                    <Button key={die} onClick={() => addDie(die)} variant="outline" size="sm" disabled={isRolling} className="h-10 font-mono text-xs">{die}</Button>
                  ))}
                </div>
              )}

              {/* BOON / BANE */}
              {dicePool.length === 1 && dicePool[0] === 'd20' && !controlsDisabled && (
                <div className="flex justify-center gap-4 mb-6">
                  <button onClick={handleBoonClick} className={`relative flex items-center justify-center w-32 py-2 rounded-lg border-2 font-bold text-sm transition-all duration-200 ${isBoonActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-105' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-400 hover:text-emerald-600'}`}>
                    <Star className={`w-4 h-4 mr-2 ${isBoonActive ? 'fill-white' : ''}`} /> Boon {isBoonActive && modifierCount > 1 && `x${modifierCount}`}
                  </button>
                  <button onClick={handleBaneClick} className={`relative flex items-center justify-center w-32 py-2 rounded-lg border-2 font-bold text-sm transition-all duration-200 ${isBaneActive ? 'bg-rose-600 border-rose-600 text-white shadow-md scale-105' : 'bg-white border-gray-200 text-gray-500 hover:border-rose-400 hover:text-rose-600'}`}>
                    <ShieldOff className="w-4 h-4 mr-2" /> Bane {isBaneActive && modifierCount > 1 && `x${modifierCount}`}
                  </button>
                </div>
              )}

              {/* Result Display */}
              {(isRolling || finalOutcome !== null) && (
                <div className={`mt-auto mb-2 p-6 rounded-xl text-center transition-all duration-300 transform ${isRolling ? 'bg-gray-100 scale-95 opacity-80' : 'bg-indigo-50 border-2 border-indigo-100 scale-100 opacity-100 shadow-inner'}`}>
                   <div className={`text-5xl font-black mb-2 ${isCritical ? 'text-purple-600 animate-bounce' : isRolling ? 'text-gray-400 blur-sm' : 'text-indigo-900'}`}>{displayedOutcome}</div>
                   {!isRolling && (
                     <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Smart Target Display */}
                        {currentConfig?.targetValue !== undefined && !isCritical && (
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                                {isAdvancementRoll ? `Need > ${currentConfig.targetValue}` : `Target: ${currentConfig.targetValue}`}
                            </p>
                        )}

                        {isSuccess === true && !isCritical && <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-bold"><Star size={14} className="fill-current" /> Success</div>}
                        {isSuccess === false && !isCritical && <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold"><X size={14} /> Failure</div>}
                        
                        {boonResults.length > 0 && <p className="text-xs text-indigo-400 mt-2">Rolls: [{results[0].value}, {boonResults.map(b => b.value).join(', ')}] <span className="font-semibold">{isBoonActive ? 'Took Lowest' : 'Took Highest'}</span></p>}
                     </div>
                   )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-between items-center bg-gray-50">
          <div>
            <Button onClick={() => setShowHistory(!showHistory)} variant="ghost" size="sm" className="text-gray-500 hover:text-gray-800"><History className="w-4 h-4 mr-1" /> {showHistory ? 'Roller' : 'History'}</Button>
            {!showHistory && !controlsDisabled && dicePool.length > 0 && <Button onClick={clearDicePool} variant="ghost" size="sm" className="ml-2 text-red-400 hover:text-red-600">Clear</Button>}
          </div>
          {!showHistory && <Button onClick={handleRoll} disabled={dicePool.length === 0 || isRolling} size="lg" className={`w-32 shadow-lg transition-all ${isRolling ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}`}>{isRolling ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : <><Dices className="w-5 h-5 mr-2" /> Roll</>}</Button>}
        </div>
      </div>
    </div>
  );
}