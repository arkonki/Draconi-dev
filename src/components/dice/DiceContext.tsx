import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { parseDiceString } from '../../lib/dice-utils';
import { useNotifications } from '../../contexts/NotificationContext';
// 1. Import API
import { sendMessage } from '../../lib/api/chat';

// --- Types ---
export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceRollResult {
  type: DiceType;
  value: number;
}

export interface RollHistoryEntry {
  id: string; 
  timestamp: number;
  description?: string; 
  dicePool: DiceType[];
  results: DiceRollResult[];
  boonResults?: DiceRollResult[]; 
  finalOutcome?: number | string; 
  isBoon?: boolean;
  isBane?: boolean;
  targetValue?: number; 
  isSuccess?: boolean; 
  isCritical?: boolean; 
  skillName?: string; 
}

export interface RollConfig {
  dice?: string; 
  initialDice?: DiceType[]; 
  rollMode?: 'skillCheck' | 'attackDamage' | 'generic' | 'deathRoll' | 'recoveryRoll' | 'rallyRoll' | 'advancementRoll' | 'initiative' | 'rest';
  targetValue?: number;
  description?: string; 
  label?: string; 
  requiresBane?: boolean;
  skillName?: string;
  restType?: 'round' | 'stretch' | 'shift'; 
  combatantId?: string; 
  onRoll?: (result: { total: number | string }) => void; 
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
  removeLastDie: (die?: DiceType) => void; 
  clearDicePool: () => void;
  setBoon: (active: boolean) => void;
  setBane: (active: boolean) => void;
  addRollToHistory: (entry: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
  // 2. Add function to interface
  shareRollToParty: (partyId: string, userId: string, entry: RollHistoryEntry) => Promise<void>;
}

const DiceContext = createContext<DiceContextType | undefined>(undefined);

const MAX_HISTORY = 20; 

export function DiceProvider({ children }: { children: ReactNode }) {
  const { playSound } = useNotifications();

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
        if (newConfig.label && !newConfig.description) {
            newConfig.description = newConfig.label;
        }
        setCurrentConfig(newConfig || null);

        let initialPool: DiceType[] = [];
        if (config?.dice) {
            initialPool = parseDiceString(config.dice);
        } else if (config?.initialDice) {
            initialPool = config.initialDice;
        }
        
        if (config?.rollMode === 'deathRoll') {
            initialPool = ['d20'];
        } else if (config?.rollMode === 'recoveryRoll') {
            initialPool = ['d6'];
        } else if (config?.rollMode === 'rallyRoll') {
            initialPool = ['d20'];
        } else if (config?.rollMode === 'skillCheck' && initialPool.length === 0) {
            initialPool = ['d20']; 
        } else if (config?.rollMode === 'advancementRoll') {
            initialPool = ['d20'];
        } else if (config?.rollMode === 'initiative') {
            initialPool = ['d10']; 
        }
        
        setDicePool(initialPool);
        
        setIsBoonActive(false);
        setIsBaneActive(config?.requiresBane || config?.rollMode === 'rallyRoll' || false);

      } else {
         setCurrentConfig(null);
         setDicePool([]);
         setIsBoonActive(false);
         setIsBaneActive(false);
      }
      return opening;
    });
  }, []);

  const addDie = useCallback((die: DiceType) => {
    if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll', 'initiative'].includes(currentConfig.rollMode)) {
        return;
    }
    setDicePool(prev => [...prev, die]);
    if (isBoonActive || isBaneActive) {
        setIsBoonActive(false);
        setIsBaneActive(false);
    }
  }, [isBoonActive, isBaneActive, currentConfig]);

  const removeLastDie = useCallback((die?: DiceType) => {
     if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll', 'initiative'].includes(currentConfig.rollMode)) {
        return;
    }
    setDicePool(prev => {
      if (prev.length === 0) return []; 
      if (die) {
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
    if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll', 'initiative'].includes(currentConfig.rollMode)) {
      return;
    }
    setDicePool([]);
    setIsBoonActive(false);
    setIsBaneActive(false);
  }, [currentConfig]);

  const setBoon = useCallback((active: boolean) => {
    if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll', 'initiative'].includes(currentConfig.rollMode)) {
      return;
    }
    if (active) {
      setIsBoonActive(true);
      setIsBaneActive(false);
      if (dicePool.length === 0) setDicePool(['d20']);
    } else {
      setIsBoonActive(false);
    }
  }, [currentConfig, dicePool]);

  const setBane = useCallback((active: boolean) => {
    if (currentConfig?.rollMode && ['deathRoll', 'recoveryRoll', 'rallyRoll', 'advancementRoll', 'initiative'].includes(currentConfig.rollMode)) {
      return;
    }
    if (active) {
      setIsBaneActive(true);
      setIsBoonActive(false);
      if (dicePool.length === 0) setDicePool(['d20']);
    } else {
      if (currentConfig?.rollMode !== 'rallyRoll') {
        setIsBaneActive(false);
      }
    }
  }, [currentConfig, dicePool]);

  const addRollToHistory = useCallback((entryData: Omit<RollHistoryEntry, 'id' | 'timestamp'>) => {
    playSound('dice');
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
  }, [playSound]);

  const clearHistory = useCallback(() => {
    setRollHistory([]);
  }, []);

  // 3. Implement Share Function
  const shareRollToParty = useCallback(async (partyId: string, userId: string, entry: RollHistoryEntry) => {
    let message = `🎲 **${entry.description || 'Dice Roll'}**: `;
    
    if (entry.finalOutcome !== undefined) {
        message += `Result: ${entry.finalOutcome}`;
    } else {
        const total = entry.results.reduce((sum, r) => sum + r.value, 0);
        message += `Rolled ${total} (${entry.dicePool.join('+')})`;
    }

    if (entry.isCritical) message += " 🔥 CRITICAL!";
    if (entry.isSuccess !== undefined) {
      message += entry.isSuccess ? " ✅ Success" : " ❌ Failure";
    }

    await sendMessage(partyId, userId, message);
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
      shareRollToParty, // Export it
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