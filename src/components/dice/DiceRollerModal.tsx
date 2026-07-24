import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom'; 
import { useAuth } from '../../contexts/useAuth';
import { DiceType, DiceRollResult, RollHistoryEntry, PostRollAction } from './DiceContext';
import { useDice } from './useDice';
// 1. IMPORT NOTIFICATIONS
import { useNotifications } from '../../contexts/useNotifications';
import { 
  Dices, X, History, Trash2, Star, ShieldOff, Skull, HeartPulse, 
  ShieldQuestion, GraduationCap, Zap, Moon, Share, ArrowRightCircle,
  AlertTriangle, CheckCircle2, CircleHelp, RotateCcw
} from 'lucide-react';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import {
  getAvailablePushRollConditions,
  getPushRollAvailability,
  PUSH_ROLL_CONDITIONS,
  type PushRollConditionKey,
} from './pushRoll';

const DiceIcon = ({ type }: { type: DiceType }) => (
  <span className="font-semibold text-xs uppercase">{type}</span>
);

const DICE_VALUES: Record<DiceType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
const SKILL_CHECK_RESULT_DISPLAY_MS = 1400;

function rollDie(type: DiceType): number {
  return Math.floor(Math.random() * DICE_VALUES[type]) + 1;
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
  );
}

export function DiceRollerModal() {
  const { id: urlPartyId } = useParams<{ id: string }>(); 
  const { user, isPlayer } = useAuth();
  
  // 2. GET PLAY SOUND
  const { playSound } = useNotifications();

  const { 
    markSkillThisSession, 
    performRest, 
    setInitiativeForCombatant,
    updateConditions,
    isSaving: isSavingCharacter,
    character: currentCharacter 
  } = useCharacterSheetStore();

  const { 
    showDiceRoller, closeDiceRoller, currentConfig, dicePool, addDie,
    removeLastDie, clearDicePool, isBoonActive, isBaneActive, setBoon, 
    setBane, addRollToHistory, rollHistory, clearHistory,
    shareRollToParty 
  } = useDice();

  const effectivePartyId = urlPartyId || currentCharacter?.party_id;

  const [results, setResults] = useState<DiceRollResult[]>([]);
  const [boonResults, setBoonResults] = useState<DiceRollResult[]>([]);
  const [finalOutcome, setFinalOutcome] = useState<number | string | null>(null);
  const [isCritical, setIsCritical] = useState(false);
  const [isSuccess, setIsSuccess] = useState<boolean | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const [modifierCount, setModifierCount] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [displayedOutcome, setDisplayedOutcome] = useState<string | number>('...');
  const [lastRolledEntry, setLastRolledEntry] = useState<RollHistoryEntry | null>(null); 
  const [pendingPostRollAction, setPendingPostRollAction] = useState<PostRollAction | null>(null);
  const [pushRollStage, setPushRollStage] = useState<'idle' | 'choose-condition' | 'ready'>('idle');
  const [selectedPushCondition, setSelectedPushCondition] = useState<PushRollConditionKey | null>(null);
  const [pushRollError, setPushRollError] = useState<string | null>(null);
  const [hasPushedCurrentTest, setHasPushedCurrentTest] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCompletionRef = useRef<(() => void) | null>(null);

  const rollMode = currentConfig?.rollMode;
  const isSkillCheck = rollMode === 'skillCheck';
  const isDeathRoll = rollMode === 'deathRoll';
  const isRallyRoll = rollMode === 'rallyRoll';
  const isRecoveryRoll = rollMode === 'recoveryRoll';
  const isAdvancementRoll = rollMode === 'advancementRoll';
  const isInitiative = rollMode === 'initiative';
  const isRest = rollMode === 'rest';

  const discardPendingCompletion = useCallback(() => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    pendingCompletionRef.current = null;
  }, []);

  const flushPendingCompletion = useCallback(() => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    const completion = pendingCompletionRef.current;
    pendingCompletionRef.current = null;
    completion?.();
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
    };
  }, []);

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

  const handleRoll = useCallback((isPushedRoll = false) => {
    if (dicePool.length === 0) return;

    if (!isPushedRoll) {
      flushPendingCompletion();
    }

    // 3. TRIGGER SOUND IMMEDIATELY
    playSound('dice');

    setHasPushedCurrentTest(isPushedRoll);
    setPushRollStage('idle');
    setSelectedPushCondition(null);
    setPushRollError(null);
    setIsRolling(true);
    setResults([]);
    setBoonResults([]);
    setFinalOutcome(null);
    setIsCritical(false);
    setIsSuccess(undefined);
    setLastRolledEntry(null);
    setPendingPostRollAction(null);

    const currentResults: DiceRollResult[] = dicePool.map(type => ({ type, value: rollDie(type) }));
    const currentBoonResults: DiceRollResult[] = [];
    let finalValue: number | string = currentResults.reduce((sum, r) => sum + r.value, 0);
    let numericFinalValue: number = Number(finalValue); 
    let crit = false;
    let success: boolean | undefined = undefined;
    const skillName = currentConfig?.skillName;

    // Logic
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

      if (isAdvancementRoll) {
        if (currentConfig?.targetValue !== undefined) {
             success = val > currentConfig.targetValue;
        }
        finalValue = val; 
      } else {
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
    else if ((isRecoveryRoll || isRest) && dicePool.every(d => d === 'd6')) {
        numericFinalValue = currentResults.reduce((acc, curr) => acc + curr.value, 0);
        finalValue = numericFinalValue;
    }

    let shuffleCount = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      shuffleCount++;
      setDisplayedOutcome(Math.floor(Math.random() * (dicePool[0] === 'd20' ? 20 : 6)) + 1); 
      
      if (shuffleCount > 8) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        setIsRolling(false);
        setResults(currentResults);
        setBoonResults(currentBoonResults);
        setFinalOutcome(finalValue);
        setDisplayedOutcome(finalValue);
        setIsCritical(crit);
        setIsSuccess(success);

        const configuredPostRollAction = currentConfig?.postRollAction;
        if (configuredPostRollAction) {
          const actionWhen = configuredPostRollAction.when ?? 'always';
          const shouldShowAction =
            actionWhen === 'always'
            || (actionWhen === 'success' && success === true)
            || (actionWhen === 'failure' && success === false);
          setPendingPostRollAction(shouldShowAction ? configuredPostRollAction : null);
        } else {
          setPendingPostRollAction(null);
        }

        if (isSkillCheck && skillName && (numericFinalValue === 1 || numericFinalValue === 20)) {
            markSkillThisSession(skillName);
        }
        if (isInitiative && currentConfig?.combatantId) {
            setInitiativeForCombatant(currentConfig.combatantId, numericFinalValue);
        }
        if (isRest && currentConfig?.restType) {
            if (currentConfig.restType === 'round') {
                performRest('round', 0, numericFinalValue); 
            } else if (currentConfig.restType === 'stretch') {
                performRest('stretch', numericFinalValue, 0); 
            }
        }

        const baseDescription = currentConfig?.description || `${dicePool.join(', ')} Roll`;
        const historyEntryData: Omit<RollHistoryEntry, 'id' | 'timestamp'> = {
          description: isPushedRoll ? `Pushed: ${baseDescription}` : baseDescription,
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
        setLastRolledEntry({
          ...historyEntryData,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        });

        const runCompletionCallbacks = () => {
          if (currentConfig?.onRollComplete) currentConfig.onRollComplete(historyEntryData);
          if (currentConfig?.onRoll) currentConfig.onRoll({ total: numericFinalValue });
        };

        const pushAvailability = getPushRollAvailability({
          isSkillCheck,
          isPlayer: isPlayer(),
          isFailure: success === false,
          isDemon: crit && success === false,
          hasCharacter: Boolean(currentCharacter),
          hasAlreadyPushed: isPushedRoll,
          conditions: currentCharacter?.conditions,
        });

        if (isSkillCheck && (currentConfig?.onRollComplete || currentConfig?.onRoll)) {
          pendingCompletionRef.current = runCompletionCallbacks;
          if (!pushAvailability.canPush) {
            if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = setTimeout(() => {
              flushPendingCompletion();
            }, SKILL_CHECK_RESULT_DISPLAY_MS);
          }
        } else {
          runCompletionCallbacks();
        }
      }
    }, 60);

  }, [dicePool, isBoonActive, isBaneActive, modifierCount, currentConfig, addRollToHistory, markSkillThisSession, performRest, setInitiativeForCombatant, isSkillCheck, isAdvancementRoll, isInitiative, isRest, isRallyRoll, isDeathRoll, isRecoveryRoll, playSound, flushPendingCompletion, isPlayer, currentCharacter]);

  useEffect(() => {
    if (!showDiceRoller) {
      setResults([]); setBoonResults([]); setFinalOutcome(null); setDisplayedOutcome('...');
      setIsCritical(false); setIsSuccess(undefined); setShowHistory(false); setIsRolling(false);
      setLastRolledEntry(null);
      setPendingPostRollAction(null);
      setPushRollStage('idle');
      setSelectedPushCondition(null);
      setPushRollError(null);
      setHasPushedCurrentTest(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      flushPendingCompletion();
    }
  }, [showDiceRoller, flushPendingCompletion]);

  const handleClose = useCallback(() => {
    if (pushRollStage === 'ready') return;
    closeDiceRoller();
    flushPendingCompletion();
  }, [closeDiceRoller, flushPendingCompletion, pushRollStage]);

  const handleTakePushCondition = async (condition: PushRollConditionKey) => {
    if (!currentCharacter || currentCharacter.conditions?.[condition]) return;

    setPushRollError(null);
    try {
      await updateConditions({
        ...currentCharacter.conditions,
        [condition]: true,
      });
      discardPendingCompletion();
      setSelectedPushCondition(condition);
      setPushRollStage('ready');
    } catch (error) {
      setPushRollError(error instanceof Error ? error.message : 'Could not save the condition.');
    }
  };

  const handlePushReroll = () => {
    if (!selectedPushCondition || isSavingCharacter) return;
    handleRoll(true);
  };

  const handleShare = async (entry: RollHistoryEntry) => {
    if (effectivePartyId && user && shareRollToParty) {
      // Visual feedback
      const btn = document.activeElement as HTMLElement;
      if (btn) {
         const originalText = btn.innerText;
         btn.innerText = "Sent!";
         setTimeout(() => btn.innerText = originalText, 1000);
      }
      await shareRollToParty(effectivePartyId, user.id, entry);
    }
  };

  if (!showDiceRoller) return null;

  const availablePushConditions = getAvailablePushRollConditions(currentCharacter?.conditions);
  const pushAvailability = getPushRollAvailability({
    isSkillCheck,
    isPlayer: isPlayer(),
    isFailure: isSuccess === false,
    isDemon: isCritical && isSuccess === false,
    hasCharacter: Boolean(currentCharacter),
    hasAlreadyPushed: hasPushedCurrentTest,
    conditions: currentCharacter?.conditions,
  });
  const shouldShowPushAction =
    isSkillCheck
    && isSuccess === false
    && isPlayer()
    && Boolean(currentCharacter)
    && !hasPushedCurrentTest;

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
    <div className="dice-modal-root fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="dice-modal-shell bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] border border-gray-200 overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="dice-modal-header p-4 border-b bg-gray-50 flex justify-between items-center text-lg font-bold text-gray-800">
          <div className="dice-modal-title flex items-center gap-2 text-indigo-700">
            {getIconForMode()} {getModalTitle()}
          </div>
          <button
            onClick={handleClose}
            disabled={pushRollStage === 'ready'}
            title={pushRollStage === 'ready' ? 'Complete the pushed roll before closing.' : 'Close dice roller'}
            className="dice-modal-close text-gray-400 hover:text-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="dice-modal-body p-5 overflow-y-auto flex-grow flex flex-col">
          {showHistory ? (
            <div className="dice-modal-history animate-in slide-in-from-right-4 duration-200">
              <div className="dice-modal-history-header flex justify-between items-center mb-3 border-b pb-2">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Roll History</h3>
                <Button onClick={clearHistory} variant="danger" size="xs" disabled={rollHistory.length === 0}>
                  <Trash2 className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
              <ul className="dice-modal-history-list space-y-3 max-h-60 overflow-y-auto pr-2">
                  {rollHistory.map(entry => (
                    <li key={entry.id} className="dice-modal-history-entry text-sm p-2 rounded bg-gray-50 border border-gray-100 relative group">
                      <div className="flex justify-between font-bold text-gray-700 mb-1 gap-3">
                         <span>{entry.description}</span>
                         <span className={entry.isSuccess ? "text-green-600" : entry.isSuccess === false ? "text-red-600" : ""}>{String(entry.finalOutcome)}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex justify-between items-center">
                         <span>{entry.dicePool.join('+')} {entry.isBoon && '(Boon)'}{entry.isBane && '(Bane)'}</span>
                         {entry.isCritical && <span className="text-purple-600 font-bold">CRITICAL</span>}
                      </div>

                      {/* HISTORY SHARE BUTTON */}
                      {effectivePartyId && (
                        <button 
                          onClick={() => handleShare(entry)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white border border-gray-200 p-1.5 rounded-full shadow-sm text-gray-400 hover:text-indigo-600 hover:border-indigo-200 opacity-0 group-hover:opacity-100 transition-all"
                          title="Share to Party Chat"
                        >
                          <Share size={14} />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ) : pushRollStage !== 'idle' ? (
            <div className="dice-modal-push-condition flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
              {pushRollStage === 'choose-condition' ? (
                <>
                  <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-stone-900">Take a condition</h3>
                    <p className="mt-1 text-sm text-stone-600">
                      Choose one new condition as the cost of pushing this test.
                    </p>
                    <div className="group relative mx-auto mt-3 inline-flex">
                      <button
                        type="button"
                        aria-label="Why must I describe the condition?"
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        <CircleHelp className="h-4 w-4" />
                        How does this condition apply?
                      </button>
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-lg bg-stone-900 p-3 text-left text-xs font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block"
                      >
                        Describe to the table how the attempted action makes your character
                        exhausted, sickly, dazed, angry, scared, or disheartened. The explanation
                        should fit what just happened in the story.
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {PUSH_ROLL_CONDITIONS.map((condition) => {
                      const alreadyActive = !availablePushConditions.some(
                        (available) => available.key === condition.key,
                      );
                      return (
                        <button
                          key={condition.key}
                          type="button"
                          disabled={alreadyActive || isSavingCharacter}
                          onClick={() => handleTakePushCondition(condition.key)}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            alreadyActive
                              ? 'cursor-not-allowed border-stone-200 bg-stone-100 opacity-55'
                              : 'border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-stone-900">{condition.label}</span>
                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                              {condition.attribute}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-snug text-stone-600">
                            {alreadyActive ? 'Already active' : condition.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {pushRollError && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {pushRollError}
                    </div>
                  )}
                </>
              ) : (
                <div className="m-auto w-full rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <h3 className="mt-3 text-lg font-bold text-emerald-950">Condition taken</h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    {PUSH_ROLL_CONDITIONS.find(
                      (condition) => condition.key === selectedPushCondition,
                    )?.label ?? 'Condition'} is now active. You must keep the new result.
                  </p>
                  <p className="mt-3 text-xs text-emerald-700">
                    Describe how the condition resulted from the action, then roll the test again.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="dice-modal-roller flex flex-col h-full">
              {/* Dice Pool Display */}
              <div className="dice-modal-pool mb-6 p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 min-h-[80px] flex flex-wrap gap-2 items-center justify-center">
                {dicePool.length === 0 ? (
                  <span className="dice-modal-pool-empty text-gray-400 text-sm font-medium">Add dice to roll...</span>
                ) : (
                  dicePool.map((die, index) => (
                    <button key={index} onClick={() => !controlsDisabled && removeLastDie()} disabled={controlsDisabled} className={`dice-modal-pool-die w-12 h-12 rounded-lg flex items-center justify-center shadow-sm transition-all transform hover:scale-105 ${controlsDisabled ? 'bg-gray-200 cursor-not-allowed opacity-50' : 'bg-white border border-gray-200 hover:border-red-300 hover:text-red-500'}`}>
                      <DiceIcon type={die} />
                    </button>
                  ))
                )}
              </div>

              {/* Controls */}
              {!controlsDisabled && (
                <div className="dice-modal-controls grid grid-cols-6 gap-2 mb-6">
                  {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as DiceType[]).map(die => (
                    <Button key={die} onClick={() => addDie(die)} variant="outline" size="sm" disabled={isRolling} className="dice-modal-control-button h-10 font-mono text-xs">{die}</Button>
                  ))}
                </div>
              )}

              {/* BOON / BANE */}
              {dicePool.length === 1 && dicePool[0] === 'd20' && !controlsDisabled && (
                <div className="dice-modal-modifiers flex justify-center gap-4 mb-6">
                  <button onClick={handleBoonClick} className={`dice-modal-modifier relative flex items-center justify-center w-32 py-2 rounded-lg border-2 font-bold text-sm transition-all duration-200 ${isBoonActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-105' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-400 hover:text-emerald-600'}`}>
                    <Star className={`w-4 h-4 mr-2 ${isBoonActive ? 'fill-white' : ''}`} /> Boon {isBoonActive && modifierCount > 1 && `x${modifierCount}`}
                  </button>
                  <button onClick={handleBaneClick} className={`dice-modal-modifier relative flex items-center justify-center w-32 py-2 rounded-lg border-2 font-bold text-sm transition-all duration-200 ${isBaneActive ? 'bg-rose-600 border-rose-600 text-white shadow-md scale-105' : 'bg-white border-gray-200 text-gray-500 hover:border-rose-400 hover:text-rose-600'}`}>
                    <ShieldOff className="w-4 h-4 mr-2" /> Bane {isBaneActive && modifierCount > 1 && `x${modifierCount}`}
                  </button>
                </div>
              )}

              {/* Result Display */}
              {(isRolling || finalOutcome !== null) && (
                <div className={`dice-modal-result mt-auto mb-2 p-6 rounded-xl text-center transition-all duration-300 transform ${isRolling ? 'bg-gray-100 scale-95 opacity-80' : 'bg-indigo-50 border-2 border-indigo-100 scale-100 opacity-100 shadow-inner'}`}>
                   <div className={`dice-modal-result-value text-5xl font-black mb-2 ${isCritical ? 'text-purple-600 animate-bounce' : isRolling ? 'text-gray-400 blur-sm' : 'text-indigo-900'}`}>{displayedOutcome}</div>
                   {!isRolling && (
                     <div className="dice-modal-result-body animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {currentConfig?.targetValue !== undefined && !isCritical && (
                            <p className="dice-modal-result-target text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                                {isAdvancementRoll ? `Need > ${currentConfig.targetValue}` : `Target: ${currentConfig.targetValue}`}
                            </p>
                        )}

                        <div className="dice-modal-result-status flex items-center justify-center gap-2 mb-2">
                           {isSuccess === true && !isCritical && <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-bold"><Star size={14} className="fill-current" /> Success</div>}
                           {isSuccess === false && !isCritical && <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold"><X size={14} /> Failure</div>}
                        </div>
                        
                        {boonResults.length > 0 && <p className="text-xs text-indigo-400">Rolls: [{results[0].value}, {boonResults.map(b => b.value).join(', ')}] <span className="font-semibold">{isBoonActive ? 'Took Lowest' : 'Took Highest'}</span></p>}

                        {/* SHARE BUTTON FOR CURRENT ROLL */}
                        {effectivePartyId && lastRolledEntry && (
                            <button 
                                onClick={() => handleShare(lastRolledEntry)}
                                className="mt-3 flex items-center justify-center gap-2 mx-auto text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 px-3 py-1 rounded-full transition-colors"
                            >
                                <Share size={12} /> Share to Chat
                            </button>
                        )}

                        {shouldShowPushAction && (
                          <div className="mt-4 border-t border-indigo-100 pt-4">
                            <span title={pushAvailability.reason}>
                              <Button
                                onClick={() => {
                                  setPushRollError(null);
                                  setPushRollStage('choose-condition');
                                }}
                                disabled={!pushAvailability.canPush}
                                size="sm"
                                className="bg-amber-600 text-white hover:bg-amber-700"
                              >
                                <RotateCcw className="mr-1.5 h-4 w-4" />
                                Push Roll
                              </Button>
                            </span>
                            <p className="mt-2 text-xs text-stone-600">
                              {pushAvailability.reason
                                || 'Take a new condition, explain how it applies, and reroll the test.'}
                            </p>
                          </div>
                        )}
                     </div>
                   )}
                </div>
              )}

              {!isRolling && finalOutcome !== null && pendingPostRollAction && (
                <div className="dice-modal-followup mt-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-indigo-100 p-2 text-indigo-700 shrink-0">
                      <ArrowRightCircle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">Next Step</div>
                      <div className="mt-1 text-sm font-semibold text-stone-900">{pendingPostRollAction.title}</div>
                      {pendingPostRollAction.message && (
                        <p className="mt-1 text-sm text-stone-600 leading-snug">{pendingPostRollAction.message}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingPostRollAction.onAction && pendingPostRollAction.actionLabel && (
                          <Button
                            onClick={() => {
                              const action = pendingPostRollAction.onAction;
                              setPendingPostRollAction(null);
                              action();
                            }}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <ArrowRightCircle className="w-4 h-4 mr-1" />
                            {pendingPostRollAction.actionLabel}
                          </Button>
                        )}
                        <Button
                          onClick={() => {
                            setPendingPostRollAction(null);
                            handleClose();
                          }}
                          variant="outline"
                          size="sm"
                        >
                          {pendingPostRollAction.dismissLabel || 'Close'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dice-modal-footer p-4 border-t flex justify-between items-center bg-gray-50">
          <div className="dice-modal-footer-actions">
            {pushRollStage === 'choose-condition' ? (
              <Button
                onClick={() => {
                  setPushRollError(null);
                  setPushRollStage('idle');
                }}
                variant="ghost"
                size="sm"
                disabled={isSavingCharacter}
                className="text-gray-500 hover:text-gray-800"
              >
                Back
              </Button>
            ) : pushRollStage === 'idle' ? (
              <>
                <Button onClick={() => setShowHistory(!showHistory)} variant="ghost" size="sm" className="text-gray-500 hover:text-gray-800"><History className="w-4 h-4 mr-1" /> {showHistory ? 'Roller' : 'History'}</Button>
                {!showHistory && !controlsDisabled && dicePool.length > 0 && finalOutcome === null && <Button onClick={clearDicePool} variant="ghost" size="sm" className="ml-2 text-red-400 hover:text-red-600">Clear</Button>}
              </>
            ) : (
              <span className="text-xs font-semibold text-emerald-700">
                Pushed test
              </span>
            )}
          </div>
          {!showHistory && pushRollStage === 'ready' ? (
            <Button
              onClick={handlePushReroll}
              disabled={isSavingCharacter}
              size="lg"
              className="dice-modal-roll-button w-36 bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 hover:scale-105"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Roll Again
            </Button>
          ) : !showHistory && pushRollStage === 'idle' && isSkillCheck && finalOutcome !== null && !isRolling ? (
            <Button onClick={handleClose} size="lg" className="dice-modal-roll-button w-32 bg-stone-700 text-white shadow-lg hover:bg-stone-800">
              Done
            </Button>
          ) : !showHistory && pushRollStage === 'idle' ? (
            <Button onClick={() => handleRoll(false)} disabled={dicePool.length === 0 || isRolling} size="lg" className={`dice-modal-roll-button w-32 shadow-lg transition-all ${isRolling ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}`}>{isRolling ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : <><Dices className="w-5 h-5 mr-2" /> Roll</>}</Button>
          ) : null}
        </div>
      </div>
      <style>{`
        @media (orientation: landscape) and (max-width: 932px) and (max-height: 540px) {
          .dice-modal-root {
            padding: 0;
          }

          .dice-modal-shell {
            max-width: 100vw;
            max-height: 100vh;
            height: 100vh;
            border-radius: 0;
            border-width: 0;
          }

          .dice-modal-header {
            padding: 0.75rem 0.9rem;
            font-size: 0.95rem;
          }

          .dice-modal-title {
            gap: 0.45rem;
            font-size: 0.82rem;
            line-height: 1.15;
          }

          .dice-modal-title svg,
          .dice-modal-close svg {
            width: 1.05rem;
            height: 1.05rem;
          }

          .dice-modal-body {
            padding: 0.85rem 0.9rem;
          }

          .dice-modal-pool {
            margin-bottom: 0.75rem;
            min-height: 3.65rem;
            padding: 0.7rem;
            gap: 0.45rem;
          }

          .dice-modal-pool-empty {
            font-size: 0.74rem;
          }

          .dice-modal-pool-die {
            width: 2.25rem;
            height: 2.25rem;
            font-size: 0.7rem;
          }

          .dice-modal-controls {
            margin-bottom: 0.75rem;
            gap: 0.35rem;
          }

          .dice-modal-control-button {
            height: 2.2rem;
            padding-left: 0.25rem;
            padding-right: 0.25rem;
            font-size: 0.65rem;
          }

          .dice-modal-modifiers {
            margin-bottom: 0.75rem;
            gap: 0.55rem;
          }

          .dice-modal-modifier {
            width: 7.1rem;
            padding-top: 0.45rem;
            padding-bottom: 0.45rem;
            font-size: 0.7rem;
          }

          .dice-modal-modifier svg {
            width: 0.9rem;
            height: 0.9rem;
            margin-right: 0.35rem;
          }

          .dice-modal-result {
            margin-bottom: 0;
            padding: 0.9rem;
          }

          .dice-modal-result-value {
            margin-bottom: 0.35rem;
            font-size: 2.25rem;
            line-height: 1;
          }

          .dice-modal-result-target {
            margin-bottom: 0.25rem;
            font-size: 0.62rem;
          }

          .dice-modal-result-status {
            margin-bottom: 0.35rem;
            gap: 0.35rem;
          }

          .dice-modal-result-status > div {
            padding: 0.25rem 0.6rem;
            font-size: 0.7rem;
          }

          .dice-modal-result-status svg {
            width: 0.75rem;
            height: 0.75rem;
          }

          .dice-modal-result-body .mt-3 {
            margin-top: 0.45rem;
          }

          .dice-modal-result-body .text-xs {
            font-size: 0.64rem;
            line-height: 1.2;
          }

          .dice-modal-followup {
            margin-top: 0.55rem;
            padding: 0.75rem;
          }

          .dice-modal-followup .text-sm {
            font-size: 0.74rem;
            line-height: 1.2;
          }

          .dice-modal-followup button {
            min-height: 2rem;
            font-size: 0.7rem;
          }

          .dice-modal-history-header {
            margin-bottom: 0.55rem;
            padding-bottom: 0.4rem;
          }

          .dice-modal-history-header h3 {
            font-size: 0.66rem;
          }

          .dice-modal-history-list {
            max-height: none;
            padding-right: 0.15rem;
          }

          .dice-modal-history-entry {
            padding: 0.55rem;
            font-size: 0.72rem;
          }

          .dice-modal-footer {
            padding: 0.65rem 0.9rem;
          }

          .dice-modal-footer-actions {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            flex-wrap: wrap;
          }

          .dice-modal-footer-actions .ml-2 {
            margin-left: 0;
          }

          .dice-modal-footer button {
            min-height: 2rem;
            font-size: 0.72rem;
          }

          .dice-modal-roll-button {
            width: 6rem;
          }
        }
      `}</style>
    </div>
  );
}
