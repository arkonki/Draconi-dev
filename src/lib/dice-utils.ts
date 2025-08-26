import type { DiceType } from '../components/dice/DiceContext';

// A simple regex to capture count, die type, and modifier
const diceStringRegex = /(\d+)?d(\d+)/i;

/**
 * Parses a dice string (e.g., "2d6", "d20") into an array of DiceType.
 * Note: This simple version doesn't support complex formulas or modifiers.
 * @param diceString The string to parse.
 * @returns An array of DiceType strings.
 */
export function parseDiceString(diceString: string): DiceType[] {
  const match = diceString.match(diceStringRegex);

  if (!match) {
    // Handle simple dice types like "d6" if regex fails
    const simpleDie = `d${diceString.replace(/\D/g, '')}`;
    if (['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(simpleDie)) {
        return [simpleDie as DiceType];
    }
    console.warn(`Invalid dice string format: "${diceString}". Could not parse.`);
    return [];
  }

  const count = parseInt(match[1] || '1', 10);
  const sides = parseInt(match[2], 10);

  const dieType = `d${sides}` as DiceType;

  if (!['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(dieType)) {
    console.warn(`Invalid die type in string: "d${sides}" from "${diceString}".`);
    return [];
  }

  return Array(count).fill(dieType);
}
