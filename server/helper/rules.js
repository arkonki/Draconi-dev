import { HelperError } from './errors.js';

function assertWholeAmount(amount, { minimum = 0 } = {}) {
  if (!Number.isInteger(amount) || amount < minimum) {
    throw new HelperError(
      400,
      'VALIDATION_ERROR',
      `Amount must be a whole number greater than or equal to ${minimum}`,
    );
  }
}

export function applyDamage(actor, amount, damageType) {
  assertWholeAmount(amount);
  const before = actor.currentHp;
  const after = Math.max(0, before - amount);
  return {
    actor: { ...actor, currentHp: after, isAlive: after > 0 },
    event: {
      type: 'actor.damage',
      payload: { amount, applied: before - after, damageType: damageType || null, before, after },
    },
    warnings: amount > before ? ['Damage was capped at zero HP.'] : [],
    explanation: `${actor.name} took ${before - after} damage and now has ${after} HP.`,
  };
}

export function healActor(actor, amount) {
  assertWholeAmount(amount);
  const before = actor.currentHp;
  const after = Math.min(actor.maxHp, before + amount);
  return {
    actor: { ...actor, currentHp: after, isAlive: after > 0 },
    event: {
      type: 'actor.heal',
      payload: { amount, applied: after - before, before, after },
    },
    warnings: before + amount > actor.maxHp ? ['Healing was capped at maximum HP.'] : [],
    explanation: `${actor.name} recovered ${after - before} HP and now has ${after} HP.`,
  };
}

export function spendWillpower(actor, amount) {
  assertWholeAmount(amount, { minimum: 1 });
  if (amount > actor.currentWp) {
    throw new HelperError(400, 'INSUFFICIENT_WP', `${actor.name} does not have enough WP.`);
  }
  const before = actor.currentWp;
  const after = before - amount;
  return {
    actor: { ...actor, currentWp: after },
    event: {
      type: 'actor.spend_wp',
      payload: { amount, before, after },
    },
    warnings: [],
    explanation: `${actor.name} spent ${amount} WP and now has ${after} WP.`,
  };
}

export function restoreWillpower(actor, amount) {
  assertWholeAmount(amount, { minimum: 1 });
  const before = actor.currentWp;
  const after = Math.min(actor.maxWp, before + amount);
  return {
    actor: { ...actor, currentWp: after },
    event: {
      type: 'actor.restore_wp',
      payload: { amount, applied: after - before, before, after },
    },
    warnings: before + amount > actor.maxWp ? ['WP restoration was capped at maximum WP.'] : [],
    explanation: `${actor.name} recovered ${after - before} WP and now has ${after} WP.`,
  };
}

export function addCondition(actor, key, source, makeConditionId) {
  if (actor.conditions.some((condition) => condition.key === key)) {
    throw new HelperError(409, 'INVALID_STATE', `${actor.name} already has the ${key} condition.`);
  }
  const condition = {
    id: makeConditionId(actor.id, key),
    key,
    name: key.replaceAll('_', ' '),
    source: source || null,
    duration: { type: 'indefinite', remaining: null },
    appliedAt: new Date().toISOString(),
  };
  return {
    actor: { ...actor, conditions: [...actor.conditions, condition] },
    event: {
      type: 'actor.condition_added',
      payload: { condition },
    },
    warnings: [],
    explanation: `${actor.name} gained the ${condition.name} condition.`,
  };
}

export function removeCondition(actor, conditionIdValue) {
  const condition = actor.conditions.find(({ id }) => id === conditionIdValue);
  if (!condition) {
    throw new HelperError(400, 'INVALID_STATE', 'The condition does not exist on this actor.');
  }
  return {
    actor: {
      ...actor,
      conditions: actor.conditions.filter(({ id }) => id !== conditionIdValue),
    },
    event: {
      type: 'actor.condition_removed',
      payload: { condition },
    },
    warnings: [],
    explanation: `${actor.name} no longer has the ${condition.name} condition.`,
  };
}

export function adjustInventory(actor, itemId, quantityDelta) {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new HelperError(400, 'VALIDATION_ERROR', 'Inventory quantity change must be a non-zero whole number.');
  }
  const item = actor.inventory.find(({ id }) => id === itemId);
  if (!item) throw new HelperError(404, 'NOT_FOUND', 'Inventory item not found.');
  const before = Number(item.quantity || 0);
  const after = before + quantityDelta;
  if (after < 0) {
    throw new HelperError(400, 'INVALID_STATE', 'Inventory quantity cannot fall below zero.');
  }
  const inventory = actor.inventory
    .map((entry) => entry.id === itemId ? { ...entry, quantity: after } : entry)
    .filter((entry) => entry.quantity > 0);
  return {
    actor: { ...actor, inventory },
    event: {
      type: 'actor.inventory_adjusted',
      payload: { itemId, itemName: item.name, quantityDelta, before, after },
    },
    warnings: after === 0 ? ['The item was removed because its quantity reached zero.'] : [],
    explanation: `${actor.name}'s ${item.name} quantity changed from ${before} to ${after}.`,
  };
}

export function validateActorCanAct(actor) {
  if (!actor.isAlive || actor.currentHp <= 0) {
    throw new HelperError(409, 'ACTOR_DEFEATED', `${actor.name} cannot perform a normal action while defeated.`);
  }
  return {
    valid: true,
    result: actor,
    events: [],
    warnings: [],
    explanation: `${actor.name} can act.`,
  };
}

export function applyActorChange(actor, change, makeConditionId) {
  if (change.type === 'damage') return applyDamage(actor, change.amount, change.damage_type);
  if (change.type === 'heal') return healActor(actor, change.amount);
  if (change.type === 'spend_wp') return spendWillpower(actor, change.amount);
  if (change.type === 'restore_wp') return restoreWillpower(actor, change.amount);
  if (change.type === 'add_condition') return addCondition(actor, change.key, change.source, makeConditionId);
  if (change.type === 'remove_condition') return removeCondition(actor, change.condition_id);
  if (change.type === 'adjust_inventory') return adjustInventory(actor, change.item_id, change.quantity_delta);
  throw new HelperError(400, 'VALIDATION_ERROR', `Unsupported actor change: ${change.type}`);
}

export function applyActorChangeSet(actor, changes, makeConditionId) {
  const events = [];
  const warnings = [];
  const explanations = [];
  let current = actor;
  for (const change of changes) {
    const resolution = applyActorChange(current, change, makeConditionId);
    current = resolution.actor;
    events.push(resolution.event);
    warnings.push(...resolution.warnings);
    explanations.push(resolution.explanation);
  }
  return {
    valid: true,
    result: current,
    events,
    warnings,
    explanation: explanations.join(' '),
  };
}

