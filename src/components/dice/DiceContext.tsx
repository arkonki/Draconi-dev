import React, { useState, useCallback } from 'react';
import { parseDiceString } from '../../lib/dice-utils';
import { sendMessage } from '../../lib/api/chat';
import { DiceContext } from './diceStore';
import type { DiceType, RollConfig, RollHistoryEntry } from './diceTypes';
export type { DiceType, DiceRollResult, RollHistoryEntry, RollConfig, DiceContextType } from './diceTypes';

const MAX_HISTORY = 20; 

export function DiceProvider({ children }: { children: React.ReactNode }) {
  
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

  // MOVED SOUND OUT OF HERE
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
      shareRollToParty,
    }}>
      {children}
    </DiceContext.Provider>
  );
}
