import React, { useState, useEffect } from 'react';
import { Character } from '../../types/character';
import { RollHistoryEntry } from '../dice/DiceContext';
import { useDice } from '../dice/useDice';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Skull, HeartPulse, ShieldQuestion, CheckCircle, XCircle, Zap, Info, Plus, Minus, Check } from 'lucide-react';
import { Button } from '../shared/Button';

interface DeathRollTrackerProps {
  character: Character;
}

export function DeathRollTracker({ character }: DeathRollTrackerProps) {
  const { toggleDiceRoller } = useDice();
  const {
    setDeathRollState,
    adjustStat,
    isSaving,
  } = useCharacterSheetStore();

  const [isRolling, setIsRolling] = useState(false);
  const [lastRollResult, setLastRollResult] = useState<{ msg: string; type: 'success' | 'failure' | 'neutral' } | null>(null);
  
  // State for manual HP entry
  const [manualHP, setManualHP] = useState<string>('');
  const [hpError, setHpError] = useState<boolean>(false);

  // Derive state
  const deathRollSuccesses = character.death_rolls_passed ?? 0;
  const deathRollFailures = character.death_rolls_failed ?? 0;
  // Default to false, but logic below handles the "First Time" auto-rally
  const isRallied = character.is_rallied ?? false;

  // Safe attribute access
  const attributes = typeof character.attributes === 'string' ? JSON.parse(character.attributes) : character.attributes;
  const conTarget = attributes?.CON ?? 10;
  const wilTarget = attributes?.WIL ?? 10;

  const isRecovering = deathRollSuccesses >= 3;
  const isDead = deathRollFailures >= 3;

  // --- Auto-Rally Logic ---
  // If the character is fresh into Death Rolls (0/0) and is_rallied hasn't been set (null/undefined),
  // we automatically set them to Rallied.
  useEffect(() => {
    if (deathRollSuccesses === 0 && deathRollFailures === 0 && (character.is_rallied === null || character.is_rallied === undefined)) {
      setDeathRollState(0, 0, true);
    }
  }, [deathRollSuccesses, deathRollFailures, character.is_rallied, setDeathRollState]);

  // --- Handlers ---

  const handleDeathRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const roll = resultEntry.results[0].value;
    const isCritSuccess = resultEntry.isCritical && resultEntry.isSuccess; // 1
    const isCritFailure = resultEntry.isCritical && !resultEntry.isSuccess; // 20
    const isSuccess = resultEntry.isSuccess;

    let newSuccesses = deathRollSuccesses;
    let newFailures = deathRollFailures;
    let msg = '';
    let type: 'success' | 'failure' = 'success';

    if (isCritSuccess) {
      newSuccesses += 2;
      msg = `Dragon! (1) - +2 Successes`;
    } else if (isCritFailure) {
      newFailures += 2;
      msg = `Demon! (20) - +2 Failures`;
      type = 'failure';
    } else if (isSuccess) {
      newSuccesses += 1;
      msg = `Success (${roll} ≤ ${conTarget})`;
    } else {
      newFailures += 1;
      msg = `Failure (${roll} > ${conTarget})`;
      type = 'failure';
    }

    setLastRollResult({ msg, type });
    // Persist current rallied state unless logic dictates otherwise (usually death roll doesn't consume rally, Actions do)
    setDeathRollState(Math.min(3, newSuccesses), Math.min(3, newFailures), isRallied); 
    toggleDiceRoller();
  };

  const handleRallyRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const roll = resultEntry.results[0].value;
    const isSuccess = resultEntry.isSuccess;

    if (isSuccess) {
      setDeathRollState(deathRollSuccesses, deathRollFailures, true);
      setLastRollResult({ msg: `Rally Successful! (${roll})`, type: 'success' });
    } else {
      setDeathRollState(deathRollSuccesses, deathRollFailures, false);
      setLastRollResult({ msg: `Rally Failed (${roll})`, type: 'failure' });
    }
    toggleDiceRoller();
  };

  const handleRecoveryRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const hpRecovered = resultEntry.results[0].value;
    setLastRollResult({ msg: `Recovered ${hpRecovered} HP! Roll on SEVERE INJURIES table.`, type: 'success' });
    adjustStat('current_hp', hpRecovered); 
    toggleDiceRoller();
  };

  const handleManualRecovery = () => {
    const amount = parseInt(manualHP);
    if (!isNaN(amount) && amount > 0) {
      if (amount > 6) {
        setHpError(true);
        setTimeout(() => setHpError(false), 2000);
        return;
      }
      adjustStat('current_hp', amount);
      setLastRollResult({ msg: `Manually Recovered ${amount} HP. Roll on SEVERE INJURIES table.`, type: 'success' });
      setManualHP('');
    }
  };

  const toggleRallyState = () => {
    setDeathRollState(deathRollSuccesses, deathRollFailures, !isRallied);
  };

  // --- Actions ---

  const performDeathRoll = () => {
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'deathRoll',
      targetValue: conTarget,
      description: `Death Save (D20 vs CON ${conTarget})`,
      onRollComplete: handleDeathRollComplete,
    });
  };

  const performRallyRoll = () => {
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'rallyRoll',
      targetValue: wilTarget,
      requiresBane: true,
      description: `Rally (D20 vs WIL ${wilTarget} w/ Bane)`,
      onRollComplete: handleRallyRollComplete,
    });
  };

  const performRecoveryRoll = () => {
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'recoveryRoll',
      description: 'Recovery Roll (1d6)',
      initialDice: ['d6'],
      onRollComplete: handleRecoveryRollComplete,
    });
  };

  const handleTakeDamage = () => {
    const newFailures = Math.min(3, deathRollFailures + 1);
    setDeathRollState(deathRollSuccesses, newFailures, isRallied);
    setLastRollResult({ msg: "Took Damage (+1 Failure)", type: "failure" });
  };

  const adjustValue = (type: 'success' | 'failure', delta: number) => {
    if(type === 'success') {
       const val = Math.max(0, Math.min(3, deathRollSuccesses + delta));
       setDeathRollState(val, deathRollFailures, isRallied);
    } else {
       const val = Math.max(0, Math.min(3, deathRollFailures + delta));
       setDeathRollState(deathRollSuccesses, val, isRallied);
    }
  };

  // --- Render Helpers ---

  const ProgressDots = ({ count, type }: { count: number, type: 'success' | 'failure' }) => (
    <div className="flex gap-1">
      {[1, 2, 3].map((idx) => (
        <div key={idx} className={`
          w-4 h-4 rounded-full border border-stone-400 transition-all
          ${idx <= count 
            ? (type === 'success' ? 'bg-green-500 border-green-600' : 'bg-red-600 border-red-800') 
            : 'bg-white'
          }
        `} />
      ))}
    </div>
  );

  return (
    <div className="p-4 rounded-md shadow-sm bg-red-50 border-2 border-red-200 space-y-4">
      
      {/* Header Status */}
      <div className="flex items-center justify-between border-b border-red-200 pb-2">
        <h3 className="font-serif font-bold text-red-800 flex items-center gap-2 animate-pulse">
          <Skull className="w-5 h-5" /> DYING
        </h3>
        <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
          {isDead ? 'DECEASED' : isRecovering ? 'STABILIZED' : 'CRITICAL'}
        </span>
      </div>

      {/* Rules Hint for Manual Rollers */}
      {!isDead && !isRecovering && (
        <div className="flex justify-between text-[10px] text-stone-500 bg-white/50 p-1.5 rounded border border-red-100">
           <span className="flex items-center gap-1" title="To pass manually, roll under or equal to CON">
             <Info size={12} /> Save Target: <strong>≤ {conTarget}</strong> (CON)
           </span>
        </div>
      )}

      {/* Trackers */}
      <div className="grid grid-cols-2 gap-4">
        {/* Successes */}
        <div className="flex flex-col items-center gap-2">
           <div className="flex items-center gap-1 text-green-700 text-xs font-bold uppercase">
             <CheckCircle size={12} /> Successes
           </div>
           <ProgressDots count={deathRollSuccesses} type="success" />
           <div className="flex gap-1">
             <button 
                onClick={() => adjustValue('success', -1)} 
                className="w-9 h-9 bg-white border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-50 flex items-center justify-center touch-manipulation" 
                disabled={isSaving}
                title="Remove Success"
             >
                <Minus size={10} />
             </button>
             <button 
                onClick={() => adjustValue('success', 1)} 
                className="w-9 h-9 bg-white border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-50 flex items-center justify-center touch-manipulation" 
                disabled={isSaving}
                title="Add Success (Rolled ≤ CON)"
             >
                <Plus size={10} />
             </button>
           </div>
        </div>

        {/* Failures */}
        <div className="flex flex-col items-center gap-2">
           <div className="flex items-center gap-1 text-red-700 text-xs font-bold uppercase">
             <XCircle size={12} /> Failures
           </div>
           <ProgressDots count={deathRollFailures} type="failure" />
           <div className="flex gap-1">
             <button 
                onClick={() => adjustValue('failure', -1)} 
                className="w-9 h-9 bg-white border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-50 flex items-center justify-center touch-manipulation" 
                disabled={isSaving}
                title="Remove Failure"
             >
                <Minus size={10} />
             </button>
             <button 
                onClick={() => adjustValue('failure', 1)} 
                className="w-9 h-9 bg-white border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-50 flex items-center justify-center touch-manipulation" 
                disabled={isSaving}
                title="Add Failure (Rolled > CON)"
             >
                <Plus size={10} />
             </button>
           </div>
        </div>
      </div>

      {/* Result Banner */}
      {lastRollResult && (
        <div className={`text-center text-sm font-bold py-1 px-2 rounded ${lastRollResult.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {lastRollResult.msg}
        </div>
      )}

      {/* Rally Status & Actions */}
      {isRallied && !isRecovering && !isDead && (
        <div className="relative group flex items-center justify-between text-xs text-yellow-800 bg-yellow-100 p-2 rounded border border-yellow-200">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 fill-yellow-500 text-yellow-600" />
            <span><strong>Rallied!</strong> You can act this turn.</span>
          </div>
          <button onClick={toggleRallyState} className="w-9 h-9 hover:bg-yellow-200 rounded text-yellow-700 flex items-center justify-center touch-manipulation" title="Un-rally manually">
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {isDead ? (
          <div className="p-3 bg-stone-800 text-white text-center font-serif font-bold rounded">
            CHARACTER HAS DIED
          </div>
        ) : isRecovering ? (
          <div className="space-y-2 bg-green-50 p-2 rounded border border-green-200">
            <div className="flex items-start gap-2 p-2 rounded border border-amber-300 bg-amber-50 text-amber-900">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">
                Recovery reminder: Roll on the <span className="uppercase">Severe Injuries</span> table after recovering.
              </p>
            </div>
            <Button 
              onClick={performRecoveryRoll} 
              className="w-full bg-green-600 hover:bg-green-700 text-white border-green-800"
              icon={HeartPulse}
              disabled={isRolling || isSaving}
            >
              Roll Recovery (D6)
            </Button>
            
            <div className="flex items-center gap-2 relative">
              <span className="text-[10px] font-bold uppercase text-green-800 whitespace-nowrap">Or Manual:</span>
              <input 
                type="number" 
                min="1" 
                max="6"
                value={manualHP} 
                onChange={(e) => setManualHP(e.target.value)} 
                className={`w-full p-2 min-h-[40px] text-sm border rounded text-center transition-colors ${hpError ? 'border-red-500 bg-red-50' : 'border-green-300'}`}
                placeholder="1-6"
              />
              <button 
                onClick={handleManualRecovery}
                disabled={!manualHP || isSaving}
                className="p-2 min-h-[40px] min-w-[40px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 touch-manipulation"
              >
                <Check size={16} />
              </button>
              {hpError && (
                 <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-red-600 font-bold bg-white px-1 border border-red-200 rounded whitespace-nowrap">Max 6 HP</span>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
               <Button 
                 onClick={performDeathRoll} 
                 className="w-full bg-stone-100 hover:bg-stone-200 text-stone-900 border-stone-300"
                 disabled={isRolling || isSaving}
               >
                 Death Roll
               </Button>
               <Button 
                 onClick={handleTakeDamage} 
                 className="w-full bg-red-100 hover:bg-red-200 text-red-900 border-red-300"
                 title="Taking damage counts as a failure"
                 disabled={isSaving}
               >
                 Took Dmg
               </Button>
            </div>
            
            <div className="relative flex gap-2 items-center">
                <Button 
                  onClick={performRallyRoll} 
                  disabled={isRallied || isRolling || isSaving}
                  className={`flex-1 ${isRallied ? 'opacity-50 cursor-not-allowed bg-stone-200 text-stone-500' : 'bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border-yellow-300'}`}
                  icon={ShieldQuestion}
                >
                  {isRallied ? 'Already Rallied' : 'Attempt Rally'}
                </Button>
                
                {/* Manual Rally Toggle for GM Overrides */}
                {!isRallied && (
                   <button 
                     onClick={toggleRallyState}
                     className="p-3 min-h-[44px] min-w-[44px] bg-stone-100 border border-stone-300 rounded hover:bg-stone-200 text-stone-500 touch-manipulation"
                     title="Force Rally State (Manual)"
                   >
                     <Zap size={18} />
                   </button>
                )}
            </div>
             {/* Rally Tooltip for Manual Players */}
             <div className="text-[9px] text-center text-stone-400">
                Manual Rally: <strong>≤ {wilTarget}</strong> (WIL) w/ Bane
            </div>
          </>
        )}
      </div>

      {/* Footer Info */}
      {!isDead && !isRecovering && (
         <div className="text-[10px] text-center text-red-400 mt-2">
            3 Successes = Stabilize • 3 Failures = Death
         </div>
      )}
    </div>
  );
}
