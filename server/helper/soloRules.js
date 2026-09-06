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

export function resolveSoloSkillCheck({ target, modifier = 'normal' }, rollDie = secureRollDie) {
  if (!Number.isInteger(target) || target < 1 || target > 20) {
    throw new Error('Skill target must be an integer between 1 and 20.');
  }
  if (!['normal', 'boon', 'bane'].includes(modifier)) {
    throw new Error(`Unsupported skill-check modifier: ${modifier}`);
  }
  const dice = modifier === 'normal' ? [rollDie(20)] : [rollDie(20), rollDie(20)];
  const roll = modifier === 'boon' ? Math.min(...dice) : modifier === 'bane' ? Math.max(...dice) : dice[0];
  const keptIndex = dice.indexOf(roll);
  const outcome = roll === 1
    ? 'dragon'
    : roll === 20
      ? 'demon'
      : roll <= target ? 'success' : 'failure';
  return {
    expression: `${dice.length}d20`,
    dice,
    keptIndices: [keptIndex],
    keptValues: [roll],
    roll,
    target,
    modifier,
    outcome,
  };
}

export function resolveSoloCriticalEffect(entries, rollDie = secureRollDie) {
  const roll = rollDie(6);
  const entry = findTableEntry(entries, roll);
  if (!entry || typeof entry !== 'object' || !entry.key || !entry.label) {
    throw new Error(`Solo critical-effect table has an invalid result for ${roll}.`);
  }
  return {
    expression: '1d6',
    dice: [roll],
    keptIndices: [0],
    keptValues: [roll],
    roll,
    key: entry.key,
    label: entry.label,
  };
}

export function resolveSoloRest({ restType, useHealing = false, healingTarget = null }, rollDie = secureRollDie) {
  if (!['round', 'stretch', 'shift'].includes(restType)) {
    throw new Error(`Unsupported solo rest type: ${restType}`);
  }
  if (restType !== 'stretch' && useHealing) {
    throw new Error('Healing may only be used during a stretch rest.');
  }
  if (restType === 'shift') {
    return {
      expression: null,
      dice: [],
      keptIndices: [],
      keptValues: [],
      healingCheck: null,
      hpRecovery: null,
      wpRecovery: null,
      fullRecovery: true,
    };
  }
  if (restType === 'round') {
    const wpRecovery = rollDie(6);
    return {
      expression: '1d6',
      dice: [wpRecovery],
      keptIndices: [0],
      keptValues: [wpRecovery],
      healingCheck: null,
      hpRecovery: 0,
      wpRecovery,
      fullRecovery: false,
    };
  }

  const healingCheck = useHealing ? resolveSoloSkillCheck({ target: healingTarget }, rollDie) : null;
  const healingSucceeded = ['dragon', 'success'].includes(healingCheck?.outcome);
  const hpDice = healingSucceeded ? [rollDie(6), rollDie(6)] : [rollDie(6)];
  const wpRecovery = rollDie(6);
  const dice = [...(healingCheck?.dice || []), ...hpDice, wpRecovery];
  return {
    expression: `${healingCheck ? '1d20 + ' : ''}${hpDice.length + 1}d6`,
    dice,
    keptIndices: dice.map((_, index) => index),
    keptValues: [...dice],
    healingCheck,
    hpRecovery: hpDice.reduce((sum, value) => sum + value, 0),
    wpRecovery,
    fullRecovery: false,
  };
}

export function resolveSoloInjuryTreatment({ healingTarget, remainingHealingShifts }, rollDie = secureRollDie) {
  if (!Number.isInteger(remainingHealingShifts) || remainingHealingShifts < 1) {
    throw new Error('Remaining injury recovery must be a positive number of shifts.');
  }
  const check = resolveSoloSkillCheck({ target: healingTarget }, rollDie);
  const succeeded = ['dragon', 'success'].includes(check.outcome);
  const nextRemainingHealingShifts = succeeded
    ? Math.max(1, Math.ceil(remainingHealingShifts / 2))
    : remainingHealingShifts;
  return {
    expression: check.expression,
    dice: check.dice,
    keptIndices: [0],
    keptValues: [...check.dice],
    check,
    succeeded,
    previousRemainingHealingShifts: remainingHealingShifts,
    remainingHealingShifts: nextRemainingHealingShifts,
    shiftsReduced: remainingHealingShifts - nextRemainingHealingShifts,
  };
}

export function advanceSoloInjuryRecovery({ remainingHealingShifts, elapsedShifts = 1 }) {
  if (!Number.isInteger(remainingHealingShifts) || remainingHealingShifts < 1) {
    throw new Error('Remaining injury recovery must be a positive number of shifts.');
  }
  if (!Number.isInteger(elapsedShifts) || elapsedShifts < 1) {
    throw new Error('Elapsed injury recovery must be a positive number of shifts.');
  }
  const nextRemainingHealingShifts = Math.max(0, remainingHealingShifts - elapsedShifts);
  return {
    previousRemainingHealingShifts: remainingHealingShifts,
    remainingHealingShifts: nextRemainingHealingShifts,
    elapsedShifts: Math.min(elapsedShifts, remainingHealingShifts),
    healed: nextRemainingHealingShifts === 0,
  };
}

function rollDice(count, sides, rollDie) {
  return Array.from({ length: count }, () => rollDie(sides));
}

export function resolveSevereInjury(entries, rollDie = secureRollDie) {
  const tableRoll = rollDie(20);
  const entry = findTableEntry(entries, tableRoll);
  if (!entry || typeof entry !== 'object' || !entry.key || !entry.name || !entry.effect) {
    throw new Error(`Severe injury table has an invalid result for ${tableRoll}.`);
  }
  const healingCount = Number(entry.healing_dice?.count || 0);
  const healingSides = Number(entry.healing_dice?.sides || 0);
  const healingDice = healingCount > 0 ? rollDice(healingCount, healingSides, rollDie) : [];
  return {
    tableRoll,
    dice: [tableRoll, ...healingDice],
    key: entry.key,
    name: entry.name,
    effect: entry.effect,
    permanent: Boolean(entry.permanent),
    healingExpression: healingDice.length > 0 ? `${healingCount}d${healingSides} days` : null,
    healingDice,
    healingDays: healingDice.length > 0 ? healingDice.reduce((sum, value) => sum + value, 0) : null,
  };
}

function resolveDyingRecovery(injuryEntries, rollDie) {
  const recoveredHp = rollDie(6);
  const injury = resolveSevereInjury(injuryEntries, rollDie);
  return { recoveredHp, injury, dice: [recoveredHp, ...injury.dice] };
}

export function resolveSoloDyingAction({ action, target = null, passed = 0, failed = 0, injuryEntries }, rollDie = secureRollDie) {
  if (!['death_roll', 'self_rally', 'life_saving_healing', 'recover_stabilized'].includes(action)) {
    throw new Error(`Unsupported solo dying action: ${action}`);
  }
  if (!Number.isInteger(passed) || passed < 0 || passed > 3 || !Number.isInteger(failed) || failed < 0 || failed > 3) {
    throw new Error('Death-roll counters must be integers between 0 and 3.');
  }

  if (action === 'recover_stabilized') {
    const recovery = resolveDyingRecovery(injuryEntries, rollDie);
    return {
      expression: `1d6 + 1d20${recovery.injury.healingDice.length ? ` + ${recovery.injury.healingDice.length}d6` : ''}`,
      dice: recovery.dice,
      keptIndices: recovery.dice.map((_, index) => index),
      keptValues: [...recovery.dice],
      check: null,
      deathRolls: { passed, failed },
      rallied: false,
      dead: false,
      recoveredHp: recovery.recoveredHp,
      injury: recovery.injury,
    };
  }

  const check = resolveSoloSkillCheck({ target }, rollDie);
  const succeeded = ['dragon', 'success'].includes(check.outcome);
  let nextPassed = passed;
  let nextFailed = failed;
  let rallied = false;
  let recovery = null;
  if (action === 'death_roll') {
    if (succeeded) nextPassed = Math.min(3, passed + (check.outcome === 'dragon' ? 2 : 1));
    else nextFailed = Math.min(3, failed + (check.outcome === 'demon' ? 2 : 1));
    if (nextPassed >= 3) recovery = resolveDyingRecovery(injuryEntries, rollDie);
  } else if (action === 'self_rally') {
    rallied = succeeded;
  } else if (succeeded) {
    recovery = resolveDyingRecovery(injuryEntries, rollDie);
  }
  const dice = [...check.dice, ...(recovery?.dice || [])];
  const expressionParts = ['1d20'];
  if (recovery) {
    expressionParts.push('1d6', '1d20');
    if (recovery.injury.healingDice.length) expressionParts.push(`${recovery.injury.healingDice.length}d6`);
  }
  return {
    expression: expressionParts.join(' + '),
    dice,
    keptIndices: dice.map((_, index) => index),
    keptValues: [...dice],
    check,
    deathRolls: { passed: nextPassed, failed: nextFailed },
    rallied,
    dead: nextFailed >= 3,
    recoveredHp: recovery?.recoveredHp || 0,
    injury: recovery?.injury || null,
  };
}

export function resolveNarrativeDamage({ severity, entries }, rollDie = secureRollDie) {
  const severityRoll = severity === 'unknown' ? rollDie(6) : null;
  const entry = severityRoll === null
    ? entries.find((candidate) => candidate?.key === severity)
    : findTableEntry(entries, severityRoll);
  const count = Number(entry?.damage_dice?.count);
  const sides = Number(entry?.damage_dice?.sides);
  if (!entry?.key || !Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 2) {
    throw new Error(`Narrative damage table has no valid ${severity} result.`);
  }
  const damageDice = rollDice(count, sides, rollDie);
  const dice = [...(severityRoll === null ? [] : [severityRoll]), ...damageDice];
  return {
    expression: `${severityRoll === null ? '' : '1d6 + '}${count}d${sides}`,
    dice,
    keptIndices: dice.map((_, index) => index),
    keptValues: [...dice],
    severityRoll,
    severity: entry.key,
    severityLabel: entry.label || entry.key,
    damageExpression: `${count}d${sides}`,
    damageDice,
    damage: damageDice.reduce((sum, value) => sum + value, 0),
  };
}

export function resolveExplorationFind(entries, rollDie = secureRollDie, maxRolls = 5) {
  if (!Number.isInteger(maxRolls) || maxRolls < 1) throw new Error('Maximum rolls must be positive.');
  const dice = [];
  const results = [];
  let reroll = true;
  while (reroll && dice.length < maxRolls) {
    const roll = rollDie(10);
    const entry = findTableEntry(entries, roll);
    if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') {
      throw new Error(`Exploration table has an invalid result for ${roll}.`);
    }
    dice.push(roll);
    results.push({
      roll,
      key: entry.key,
      label: entry.label || entry.key,
      kind: entry.kind || null,
      reroll: Boolean(entry.reroll),
    });
    reroll = Boolean(entry.reroll);
  }
  return {
    expression: `${dice.length}d10`,
    dice,
    keptIndices: dice.map((_, index) => index),
    keptValues: [...dice],
    results,
    rerollLimitReached: reroll,
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
