import { secureRollDie } from './soloRules.js';

const ALLOWED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

export function parseTrustedDiceExpression(expression) {
  const normalized = String(expression || '').toLowerCase().replaceAll(/\s+/g, '');
  const match = normalized.match(/^(\d{1,2})d(\d{1,3})([+-]\d{1,3})?$/);
  if (!match) throw new Error('Dice expression must use NdS with an optional +M or -M modifier.');
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const flatModifier = Number(match[3] || 0);
  if (count < 1 || count > 20) throw new Error('Dice expression must roll between 1 and 20 dice.');
  if (!ALLOWED_SIDES.has(sides)) throw new Error('Dice sides must be one of d4, d6, d8, d10, d12, d20, or d100.');
  if (Math.abs(flatModifier) > 999) throw new Error('Dice modifier must be between -999 and 999.');
  return {
    expression: `${count}d${sides}${flatModifier > 0 ? `+${flatModifier}` : flatModifier < 0 ? flatModifier : ''}`,
    count,
    sides,
    flatModifier,
  };
}

function rollOutcome({ rollKind, keptValue, targetValue }) {
  if (targetValue === null || targetValue === undefined) return null;
  if (keptValue === 1) return 'dragon';
  if (keptValue === 20) return 'demon';
  if (rollKind === 'advancement') return keptValue > targetValue ? 'success' : 'failure';
  return keptValue <= targetValue ? 'success' : 'failure';
}

function resolveParsedRoll({ parsed, modifier, rollKind, targetValue, dice }) {
  const usesKeep = modifier === 'boon' || modifier === 'bane';
  if (usesKeep && (parsed.count !== 1 || parsed.sides !== 20 || parsed.flatModifier !== 0)) {
    throw new Error('Boon and bane are supported only for an unmodified 1d20 expression.');
  }
  const expectedDice = usesKeep ? 2 : parsed.count;
  if (!Array.isArray(dice) || dice.length !== expectedDice) {
    throw new Error(`This roll requires exactly ${expectedDice} die result${expectedDice === 1 ? '' : 's'}.`);
  }
  dice.forEach((value) => {
    if (!Number.isInteger(value) || value < 1 || value > parsed.sides) {
      throw new Error(`Every die result must be a whole number from 1 to ${parsed.sides}.`);
    }
  });
  const keptValue = modifier === 'boon'
    ? Math.min(...dice)
    : modifier === 'bane'
      ? Math.max(...dice)
      : dice.reduce((sum, value) => sum + value, 0);
  const keptIndices = usesKeep ? [dice.indexOf(keptValue)] : dice.map((_, index) => index);
  const total = keptValue + parsed.flatModifier;
  return {
    requestedExpression: parsed.expression,
    expression: usesKeep ? '2d20' : parsed.expression,
    dice: [...dice],
    keptIndices,
    keptValues: usesKeep ? [keptValue] : [...dice],
    keptValue,
    flatModifier: parsed.flatModifier,
    total,
    targetValue: targetValue ?? null,
    modifier,
    rollKind,
    outcome: rollOutcome({ rollKind, keptValue, targetValue }),
  };
}

export function resolveTrustedServerRoll(input, rollDie = secureRollDie) {
  const parsed = parseTrustedDiceExpression(input.expression);
  const usesKeep = input.modifier === 'boon' || input.modifier === 'bane';
  const dice = Array.from(
    { length: usesKeep ? 2 : parsed.count },
    () => rollDie(parsed.sides),
  );
  return resolveParsedRoll({ ...input, parsed, dice });
}

export function resolveTrustedManualRoll(input) {
  const parsed = parseTrustedDiceExpression(input.expression);
  return resolveParsedRoll({ ...input, parsed, dice: input.dice });
}
