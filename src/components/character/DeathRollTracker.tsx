import React, { useState, useEffect } from 'react';
import { Character } from '../../types/character';
import { useDice, RollHistoryEntry } from '../dice/DiceContext';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { Skull, HeartPulse, ShieldQuestion, CheckCircle, XCircle, Dices, Info, Plus, Minus } from 'lucide-react';
import { Button } from '../shared/Button';

interface DeathRollTrackerProps {
  character: Character;
}

export function DeathRollTracker({ character }: DeathRollTrackerProps) {
  const { toggleDiceRoller } = useDice();
  const {
    setDeathRollState, // Action from the store
    adjustStat,        // Action from the store
    isSaving,          // Global saving state from the store
  } = useCharacterSheetStore();

  const [isRolling, setIsRolling] = useState(false); // Local rolling state for button feedback
  const [lastRollResult, setLastRollResult] = useState<string | null>(null);

  // Derive death roll state directly from the character prop
  const deathRollSuccesses = character.death_rolls_passed ?? 0;
  const deathRollFailures = character.death_rolls_failed ?? 0;
  const isRallied = character.is_rallied ?? false;

  const conTarget = character.attributes.CON;
  const wilTarget = character.attributes.WIL;
  const isRecovering = deathRollSuccesses >= 3;
  const isDead = deathRollFailures >= 3;

  // --- Callbacks for Dice Rolls ---

  // D20 Death Roll
  const handleDeathRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const roll = resultEntry.results[0].value;
    const isCritSuccess = resultEntry.isCritical && resultEntry.isSuccess; // Rolled 1
    const isCritFailure = resultEntry.isCritical && !resultEntry.isSuccess; // Rolled 20
    const isSuccess = resultEntry.isSuccess; // Rolled <= CON (and not 20)

    let currentSuccesses = deathRollSuccesses;
    let currentFailures = deathRollFailures;

    if (isCritSuccess) {
      currentSuccesses += 2;
      setLastRollResult(`Rolled ${roll} (Dragon! +2 Successes)`);
    } else if (isCritFailure) {
      currentFailures += 2;
      setLastRollResult(`Rolled ${roll} (Demon! +2 Failures)`);
    } else if (isSuccess) {
      currentSuccesses += 1;
      setLastRollResult(`Rolled ${roll} (Success vs CON ${conTarget})`);
    } else {
      currentFailures += 1;
      setLastRollResult(`Rolled ${roll} (Failure vs CON ${conTarget})`);
    }

    // Preserve rallied state unless explicitly changed
    setDeathRollState(currentSuccesses, currentFailures, isRallied); 
    toggleDiceRoller(); // Close the dice roller modal
  };

  // D20 Rally Roll (Self)
  const handleRallyRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const roll = resultEntry.results[0].value; 
    const isSuccess = resultEntry.isSuccess;

    if (isSuccess) {
      setDeathRollState(deathRollSuccesses, deathRollFailures, true); // Set isRallied to true
      setLastRollResult(`Rallied! (Rolled ${roll} vs WIL ${wilTarget} w/ Bane)`);
    } else {
      // On rally failure, rallied status remains unchanged (or explicitly false if desired)
      setDeathRollState(deathRollSuccesses, deathRollFailures, false); // Explicitly set rallied to false on fail
      setLastRollResult(`Rally Failed (Rolled ${roll} vs WIL ${wilTarget} w/ Bane)`);
    }
    toggleDiceRoller(); // Close the dice roller modal
  };

  // D6 Recovery Roll
  const handleRecoveryRollComplete = (resultEntry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    setIsRolling(false);
    const hpRecovered = resultEntry.results[0].value;
    setLastRollResult(`Recovered ${hpRecovered} HP!`);
    // Adjusting HP via adjustStat will trigger store logic to reset death roll state if HP > 0
    adjustStat('current_hp', hpRecovered); 
    toggleDiceRoller(); // Close the dice roller modal
  };

  // --- Roll Initiation Functions ---

  const performDeathRoll = () => {
    if (isRolling || isRecovering || isDead) return;
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'deathRoll', 
      targetValue: conTarget,
      description: `Death Save (d20 vs CON ${conTarget})`,
      onRollComplete: handleDeathRollComplete,
    });
  };

  const performRallyRoll = () => {
    if (isRolling || isRallied || isRecovering || isDead) return;
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'rallyRoll', 
      targetValue: wilTarget,
      requiresBane: true, 
      description: `Rally Self (d20 vs WIL ${wilTarget}, Bane)`,
      onRollComplete: handleRallyRollComplete,
    });
  };

  const performRecoveryRoll = () => {
    if (isRolling || !isRecovering || isDead) return;
    setIsRolling(true);
    setLastRollResult(null);
    toggleDiceRoller({
      rollMode: 'recoveryRoll', 
      description: 'Recovery Roll (1d6 HP)',
      onRollComplete: handleRecoveryRollComplete,
    });
  };

  // --- Manual Adjustment ---
  const adjustSuccess = (amount: number) => {
    if (isRecovering || isDead || isSaving) return;
    const newSuccesses = Math.max(0, Math.min(3, deathRollSuccesses + amount));
    setDeathRollState(newSuccesses, deathRollFailures, isRallied); // Preserve current rallied state
  };

  const adjustFailure = (amount: number) => {
    if (isRecovering || isDead || isSaving) return;
    const newFailures = Math.max(0, Math.min(3, deathRollFailures + amount));
    setDeathRollState(deathRollSuccesses, newFailures, isRallied); // Preserve current rallied state
  };
  // --- End Manual Adjustment ---

  const renderProgress = (label: string, count: number, max: number, Icon: React.ElementType, color: string, adjFn: (amount: number) => void) => (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${color}`} />
      <span className="font-medium text-xs sm:text-sm w-16 sm:w-20">{label}:</span>
      <div className="flex space-x-1 items-center">
        <button
          onClick={() => adjFn(-1)}
          disabled={count === 0 || isRecovering || isDead || isSaving}
          className="p-0.5 text-xs bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
          title={`Decrease ${label}`}
        >
          <Minus className="w-3 h-3" />
        </button>
        {[...Array(max)].map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full border ${
              i < count ? (label === 'Successes' ? 'bg-green-500 border-green-600' : 'bg-red-500 border-red-600') : 'bg-gray-200 border-gray-300'
            }`}
          ></div>
        ))}
        <button
          onClick={() => adjFn(1)}
          disabled={count === max || isRecovering || isDead || isSaving}
          className="p-0.5 text-xs bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
          title={`Increase ${label}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-3 rounded-lg shadow bg-red-50 border border-red-300 space-y-2">
      <h3 className="font-semibold flex items-center gap-1 text-sm text-red-700">
        <Skull className="w-4 h-4 text-red-600 animate-pulse" />
        DYING ({character.current_hp} HP)
      </h3>

      <div className="space-y-1">
        {renderProgress('Successes', deathRollSuccesses, 3, CheckCircle, 'text-green-500', adjustSuccess)}
        {renderProgress('Failures', deathRollFailures, 3, XCircle, 'text-red-500', adjustFailure)}
      </div>

      {lastRollResult && (
        <p className="text-xs text-center text-gray-700 italic">{lastRollResult}</p>
      )}
      {isRallied && !isRecovering && !isDead && (
        <p className="text-xs text-center text-yellow-800 bg-yellow-100 p-1 rounded border border-yellow-200 flex items-center justify-center gap-1">
          <Info className="w-3 h-3" /> Rallied! Can act, but still dying.
        </p>
      )}

      <div className="pt-1 space-y-2">
        {isDead ? (
          <div className="text-center font-bold text-lg text-red-800 p-2 bg-red-200 rounded">
            CHARACTER DIED
          </div>
        ) : isRecovering ? (
          <Button
            onClick={performRecoveryRoll}
            disabled={isRolling || isSaving}
            loading={isRolling || isSaving}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <HeartPulse className="w-4 h-4 mr-1" /> Roll Recovery (1d6 HP)
          </Button>
        ) : (
          <>
            <Button
              onClick={performDeathRoll}
              disabled={isRolling || isSaving}
              loading={isRolling || isSaving}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              size="sm"
            >
              <Skull className="w-4 h-4 mr-1" /> Roll Death Save (d20)
            </Button>
            <div className="relative group">
              <Button
                onClick={performRallyRoll}
                disabled={isRolling || isSaving || isRallied}
                loading={isRolling || isSaving}
                className={`w-full text-black ${isRallied ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                size="sm"
              >
                <ShieldQuestion className="w-4 h-4 mr-1" /> {isRallied ? 'Rallied!' : 'Attempt Rally (Self)'}
              </Button>
              {!isRallied && (
                 <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-60 p-2 text-xs text-white bg-black rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                   Roll d20 vs WIL ({wilTarget}) with Bane. Success lets you act while dying.
                   <div className="absolute left-1/2 transform -translate-x-1/2 bottom-[-4px] w-2 h-2 bg-black rotate-45"></div>
                 </div>
              )}
            </div>
          </>
        )}
      </div>
       {isSaving && (
         <div className="text-xs text-center text-blue-600 italic mt-1">Saving...</div>
       )}
    </div>
  );
}
