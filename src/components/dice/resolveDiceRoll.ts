import type { DiceRollResult, DiceType, RollConfig } from './diceTypes';

export interface ResolvedDiceRoll {
  finalOutcome: number | string;
  selectedValue: number;
  isCritical: boolean;
  isSuccess: boolean | undefined;
}

interface ResolveDiceRollOptions {
  dicePool: DiceType[];
  results: DiceRollResult[];
  modifierResults?: DiceRollResult[];
  isBoonActive?: boolean;
  isBaneActive?: boolean;
  rollMode?: RollConfig['rollMode'];
  targetValue?: number;
}

/** Resolve generated and manually entered rolls through exactly the same rules. */
export function resolveDiceRoll({
  dicePool,
  results,
  modifierResults = [],
  isBoonActive = false,
  isBaneActive = false,
  rollMode,
  targetValue,
}: ResolveDiceRollOptions): ResolvedDiceRoll {
  let selectedValue = results.reduce((sum, result) => sum + result.value, 0);
  let finalOutcome: number | string = selectedValue;
  let isCritical = false;
  let isSuccess: boolean | undefined;

  if (dicePool.length === 1 && dicePool[0] === 'd20') {
    const allRolls = [results[0].value, ...modifierResults.map((result) => result.value)];
    if ((isBoonActive || isBaneActive) && modifierResults.length > 0) {
      selectedValue = isBoonActive ? Math.min(...allRolls) : Math.max(...allRolls);
    } else {
      selectedValue = results[0].value;
    }
    finalOutcome = selectedValue;

    if (rollMode === 'advancementRoll') {
      if (targetValue !== undefined) isSuccess = selectedValue > targetValue;
    } else if (selectedValue === 1) {
      isCritical = true;
      isSuccess = true;
      finalOutcome = 'Dragon!';
    } else if (selectedValue === 20) {
      isCritical = true;
      isSuccess = false;
      finalOutcome = 'Demon!';
    } else if (
      targetValue !== undefined
      && (rollMode === 'skillCheck' || rollMode === 'rallyRoll' || rollMode === 'deathRoll')
    ) {
      isSuccess = selectedValue <= targetValue;
    }
  }

  return { finalOutcome, selectedValue, isCritical, isSuccess };
}
