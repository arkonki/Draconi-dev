import { randomInt } from 'node:crypto';

export const FORTUNE_CATEGORIES = [
  'yes_no',
  'number',
  'scale',
  'power',
  'quality',
  'reaction',
];

export const FORTUNE_TILTS = ['unlikely', 'even', 'likely'];
export const INSPIRATION_COLUMNS = ['action', 'attribute', 'thing'];

export function secureRollDie(sides) {
  if (!Number.isInteger(sides) || sides < 2) throw new Error('Die sides must be an integer of at least 2.');
  return randomInt(1, sides + 1);
}

export function findTableEntry(entries, roll) {
  if (!Array.isArray(entries)) throw new Error('Rule table entries must be an array.');
  const ranged = entries.find((entry) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
      && Number.isInteger(entry.min) && Number.isInteger(entry.max)
      && roll >= entry.min && roll <= entry.max
  ));
  if (ranged) return ranged;
  if (roll >= 1 && roll <= entries.length) return entries[roll - 1];
  throw new Error(`Rule table has no entry for roll ${roll}.`);
}

export function resolveFortune({ category, tilt, entries }, rollDie = secureRollDie) {
  if (!FORTUNE_CATEGORIES.includes(category)) throw new Error(`Unsupported Fortune category: ${category}`);
  if (!FORTUNE_TILTS.includes(tilt)) throw new Error(`Unsupported Fortune tilt: ${tilt}`);
  const dice = tilt === 'even' ? [rollDie(6)] : [rollDie(6), rollDie(6)];
  const keptValue = tilt === 'unlikely' ? Math.min(...dice) : Math.max(...dice);
  const keptIndex = dice.indexOf(keptValue);
  const tableEntry = findTableEntry(entries, keptValue);
  const value = tableEntry?.values?.[category];
  if (typeof value !== 'string' || !value) {
    throw new Error(`Fortune table entry ${keptValue} has no ${category} value.`);
  }
  return {
    expression: tilt === 'even' ? '1d6' : '2d6',
    dice,
    keptIndices: [keptIndex],
    keptValues: [keptValue],
    keptValue,
    category,
    tilt,
    value,
    extreme: keptValue === 1 || keptValue === 6,
    tableRow: { min: tableEntry.min, max: tableEntry.max, value },
  };
}

export function resolveInspiration({ columns, tables }, rollDie = secureRollDie) {
  const results = [];
  const dice = [];
  for (const column of columns) {
    if (!INSPIRATION_COLUMNS.includes(column)) throw new Error(`Unsupported Inspiration column: ${column}`);
    const table = tables[column];
    if (!table) throw new Error(`Inspiration table is unavailable for ${column}.`);
    const roll = rollDie(table.dieSides);
    const rawEntry = findTableEntry(table.entries, roll);
    const keyword = typeof rawEntry === 'string' ? rawEntry : rawEntry?.keyword;
    if (typeof keyword !== 'string' || !keyword) {
      throw new Error(`Inspiration table ${column} has an invalid result for ${roll}.`);
    }
    dice.push(roll);
    results.push({
      column,
      roll,
      keyword,
      tableKey: table.tableKey,
      tableVersion: table.version,
      sourceKind: table.sourceKind,
    });
  }
  return {
    expression: `${columns.length}d20`,
    dice,
    keptIndices: columns.map((_, index) => index),
    keptValues: [...dice],
    results,
    phrase: results.map((result) => result.keyword).join(' '),
  };
}

export function advanceThreatState({ counter, recurring, status }, amount) {
  if (status !== 'active') throw new Error(`Cannot advance a threat with status ${status}.`);
  if (!Number.isInteger(counter) || counter < 1 || counter > 6) throw new Error('Threat counter must be between 1 and 6.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 2) throw new Error('Threat advance must be 1 or 2.');
  const reached = Math.min(6, counter + amount);
  const triggered = reached === 6;
  return {
    previousCounter: counter,
    requestedAmount: amount,
    appliedAmount: reached - counter,
    reachedCounter: reached,
    triggered,
    counter: triggered && recurring ? 1 : reached,
    status: triggered && !recurring ? 'triggered' : 'active',
  };
}
