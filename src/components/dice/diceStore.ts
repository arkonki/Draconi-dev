import { createContext } from 'react';
import type { DiceContextType } from './diceTypes';

export const DiceContext = createContext<DiceContextType | undefined>(undefined);
