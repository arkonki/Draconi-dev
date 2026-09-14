export interface DiceExpressionRoll {
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
}

export function rollDiceExpression(
  expression: string,
  random: () => number = Math.random,
): DiceExpressionRoll | null {
  const match = expression.trim().match(/^([1-9]\d?)d(4|6|8|10|12|20|100)(?:\s*([+-])\s*(\d{1,3}))?$/i);
  if (!match) return null;

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifierMagnitude = Number(match[4] || 0);
  const modifier = match[3] === '-' ? -modifierMagnitude : modifierMagnitude;
  const dice = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);

  return {
    expression: expression.trim().toLowerCase(),
    dice,
    modifier,
    total: dice.reduce((sum, value) => sum + value, 0) + modifier,
  };
}
