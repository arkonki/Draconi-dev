import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { parseDiceString } from '../../lib/dice-utils';

// Define types for dice and rolls
export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export interface DiceRollResult {
  type: DiceType;
  value: number;
}
export interface RollHistoryEntry {
  id: string; // Unique ID for key prop
  timestamp: number;
  description?: string; // e.g., "Acrobatics Check", "Attack Roll"
  dicePool: DiceType[];
  results: DiceRollResult[];
  boonResults?: DiceRollResult[]; // For boon/bane second roll
  finalOutcome?: number | string; // e.g., Total sum, "Dragon!", "Demon!"
  isBoon?: boolean;
  isBane?: boolean;
  targetValue?: number; // For skill checks
  isSuccess?: boolean; // General success/failure if applicable
  isCritical?: boolean; // General critical if applicable
  skillName?: string; // NEW: Track the skill name for advancement marking
}

// Define the structure for the initial roll configuration
export interface RollConfig {
  dice?: string; // NEW: e.g., "2d6"
  initialDice?: DiceType[]; // Pre-populate dice pool
  rollMode?: 'skillCheck' | 'attackDamage' | 'generic' | 'deathRoll' | 'recoveryRoll' | 'rallyRoll' | 'advancementRoll';
  targetValue?: number;
  description?: string; // Optional description for the roll
  label?: string; // NEW: Alias for description
  requiresBane?: boolean;
  skillName?: string;
  onRoll?: (result: { total: number | string }) => void; // NEW: Simplified callback
  onRollComplete?: (result: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => void;
}

interface DiceContextType {
  showDiceRoller: boolean;
  currentConfig: RollConfig | null;
  dicePool: DiceType[];
  rollHistory: RollHistoryEntry[];
  isBoonActive: boolean;
  isBaneActive: boolean;
  toggleDiceRoller: (config?: RollConfig) => void;
  addDie: (die: DiceType) => void;
  removeLastDie: (die?: DiceType) => void; // Optional: specify which type to remove last of
  clearDicePool: () => void;
  setBoon: (active: boolean) => void;
  setBane: (active: boolean) => void;
  addRollToHistory: (entry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
}

const DiceContext = createContext<DiceContextType | undefined>(undefined);

const MAX_HISTORY = 20; // Max number of history entries

export function DiceProvider({ children }: { children: ReactNode }) {
  const [showDiceRoller, setShowDiceRoller] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<RollConfig | null>(null);
  const [dicePool, setDicePool] = useState<DiceType[]>([]);
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([]);
  const [isBoonActive, setIsBoonActive] = useState(false);
  const [isBaneActive, setIsBaneActive] = useState(false);

  const toggleDiceRoller = useCallback((config?: RollConfig) => {
    setShowDiceRoller(prev => {
      const opening = !prev;
      if (opening) {
        const newConfig = { ...config };
        // Use label as description if description is missing
        if (newConfig.label && !newConfig.description) {
            newConfig.description = newConfig.label;
        }
        setCurrentConfig(newConfig || null);

        let initialPool: DiceType[] = [];
        // Prioritize `dice` string property
        if (config?.dice) {
            initialPool = parseDiceString(config.dice);
        } else if (config?.initialDice) {
            initialPool = config.initialDice;
        }
        
        // Ensure dice pool matches config for specific modes, overriding if necessary
        if (config?.rollMode === 'deathRoll') {
            initialPool = ['d20'];
        } else if (config?.rollMode === 'recoveryRoll') {
            initialPool = ['d6'];
        } else if (config?.rollMode === 'rallyRoll') {
            initialPool = ['d20'];
        } else if (config?.rollMode === 'skillCheck' && initialPool.length === 0) {
            initialPool = ['d20']; // Default to d20 for skill checks if no dice specified
        } else if (config?.rollMode === 'advancementRoll') {
            initialPool = ['d20'];
        }
        setDicePool(initialPool);
        
        // Set Boon/Bane based on config
        setIsBoonActive(false);
        setIsBaneActive(config?.requiresBane || config?.rollMode === 'rallyRoll' || false);

      } else {
        // Clear state when closing
         setCurrentConfig(null);
         setDicePool([]);
         setIsBoonActive(false);
         setIsBaneActive(false);
      }
      return opening;
    });
  }, []);

  const addDie = useCallback((die: DiceType) => {
    // Prevent adding dice if in a specific mode that doesn't allow it
    if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll'].includes(currentConfig.rollMode)) {
        return;
    }
    setDicePool(prev => [...prev, die]);
    if (isBoonActive || isBaneActive) {
        setIsBoonActive(false);
        setIsBaneActive(false);
    }
  }, [isBoonActive, isBaneActive, currentConfig]);

  const removeLastDie = useCallback((die?: DiceType) => {
     if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll'].includes(currentConfig.rollMode)) {
        return;
    }
    setDicePool(prev => {
      if (prev.length === 0) return []; if (die) {
const lastIndex = prev.lastIndexOf(die);
if (lastIndex !== -1) {
const newPool = [...prev];
newPool.splice(lastIndex, 1);
return newPool;
}
}
return prev.slice(0, -1);
});
}, [currentConfig]);

const clearDicePool = useCallback(() => {
if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll'].includes(currentConfig.rollMode)) {
return;
}
setDicePool([]);
setIsBoonActive(false);
setIsBaneActive(false);
}, [currentConfig]);

const setBoon = useCallback((active: boolean) => {
if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll'].includes(currentConfig.rollMode)) {
return;
}
if (active) {
setIsBoonActive(true);
setIsBaneActive(false);
setDicePool(['d20']);
} else {
setIsBoonActive(false);
}
}, [currentConfig]);

const setBane = useCallback((active: boolean) => {
if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll'].includes(currentConfig.rollMode)) {
return;
}
if (active) {
setIsBaneActive(true);
setIsBoonActive(false);
setDicePool(['d20']);
} else {
if (currentConfig?.rollMode !== 'rallyRoll') {
setIsBaneActive(false);
}
}
}, [currentConfig]);

const addRollToHistory = useCallback((entryData: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
setRollHistory(prev => {
const newEntry: RollHistoryEntry = {
...entryData,
id: crypto.randomUUID(),
timestamp: Date.now(),
};
const updatedHistory = [newEntry, ...prev];
if (updatedHistory.length > MAX_HISTORY) {
updatedHistory.pop();
}
return updatedHistory;
});
}, []);

const clearHistory = useCallback(() => {
setRollHistory([]);
}, []);

return (
<DiceContext.Provider value={{
showDiceRoller,
currentConfig,
dicePool,
rollHistory,
isBoonActive,
isBaneActive,
toggleDiceRoller,
addDie,
removeLastDie,
clearDicePool,
setBoon,
setBane,
addRollToHistory,
clearHistory,
}}>
{children}
</DiceContext.Provider>
);
}

export function useDice() {
const context = useContext(DiceContext);
if (context === undefined) {
throw new Error('useDice must be used within a DiceProvider');
}
return context;
}