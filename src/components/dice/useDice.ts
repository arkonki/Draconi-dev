import { useContext } from 'react';
import { DiceContext } from './diceStore';

export function useDice() {
  const context = useContext(DiceContext);
  if (context === undefined) {
    throw new Error('useDice must be used within a DiceProvider');
  }
  return context;
}
