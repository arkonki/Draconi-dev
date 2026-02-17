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
  rollMode?:
    | 'skillCheck'
    | 'attackDamage'
    | 'generic'
    | 'deathRoll'
    | 'recoveryRoll'
    | 'rallyRoll'
    | 'advancementRoll'
    | 'initiative'
    | 'rest';
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

export interface DiceContextType {
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
  shareRollToParty: (partyId: string, userId: string, entry: RollHistoryEntry) => Promise<void>;
}
