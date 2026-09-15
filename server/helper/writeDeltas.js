function conditionValue(condition) {
  if (!condition || typeof condition !== 'object') return condition || null;
  return Object.fromEntries([
    'id', 'key', 'name', 'source', 'duration', 'affects',
  ].flatMap((key) => condition[key] === undefined ? [] : [[key, condition[key]]]));
}

export function actorChangesForOutput(actorId, events) {
  return (Array.isArray(events) ? events : []).flatMap((event) => {
    const payload = event?.payload || {};
    switch (event?.type) {
      case 'actor.damage':
      case 'actor.heal':
        return [{ actor_id: actorId, field: 'hp.current', before: payload.before, after: payload.after }];
      case 'actor.spend_wp':
      case 'actor.restore_wp':
        return [{ actor_id: actorId, field: 'wp.current', before: payload.before, after: payload.after }];
      case 'actor.condition_added':
        return [{
          actor_id: actorId,
          field: `conditions.${payload.condition?.key || 'unknown'}`,
          before: null,
          after: conditionValue(payload.condition),
        }];
      case 'actor.condition_removed':
        return [{
          actor_id: actorId,
          field: `conditions.${payload.condition?.key || 'unknown'}`,
          before: conditionValue(payload.condition),
          after: null,
        }];
      case 'actor.inventory_adjusted':
        return [{
          actor_id: actorId,
          field: `equipment.${payload.itemId}.quantity`,
          before: payload.before,
          after: payload.after,
        }];
      case 'actor.rally_consumed':
        return [{ actor_id: actorId, field: 'isRallied', before: payload.before, after: payload.after }];
      default:
        return [];
    }
  });
}

export function actorStateForWrite(actor) {
  if (!actor || typeof actor !== 'object') return actor || null;
  const keys = [
    'id', 'campaignId', 'type', 'name', 'hp', 'wp', 'isRallied', 'deathRolls',
    'lifeStatus', 'markedSkills', 'heroicAbilities', 'isAlive', 'revision', 'updatedAt',
  ];
  return {
    ...Object.fromEntries(keys.flatMap((key) => (
      actor[key] === undefined ? [] : [[key, actor[key]]]
    ))),
    conditions: Array.isArray(actor.conditions)
      ? actor.conditions.map(conditionValue)
      : [],
  };
}

function combatParticipantIdentity(participant) {
  return Object.fromEntries([
    'id', 'actorId', 'name', 'type', 'initiative', 'initiativeSlots',
  ].flatMap((key) => participant?.[key] === undefined ? [] : [[key, participant[key]]]));
}

export function combatStateForWrite(combat) {
  if (!combat || typeof combat !== 'object') return combat || null;
  const participants = Array.isArray(combat.participants) ? combat.participants : [];
  const activeParticipant = participants.find((participant) => (
    participant.actorId === combat.activeActorId || participant.isActiveTurn
  ));
  const core = Object.fromEntries([
    'id', 'campaignId', 'name', 'status', 'round', 'activeActorId',
    'activeInitiativeSlot', 'revision',
  ].flatMap((key) => combat[key] === undefined ? [] : [[key, combat[key]]]));
  return {
    ...core,
    participantCount: participants.length,
    ...(combat.status === 'planning' && participants.length <= 20
      ? { participants: participants.map(combatParticipantIdentity) }
      : {}),
    ...(activeParticipant ? {
      activeParticipant: {
        ...combatParticipantIdentity(activeParticipant),
        hp: activeParticipant.hp,
        wp: activeParticipant.wp,
        conditions: Array.isArray(activeParticipant.conditions)
          ? activeParticipant.conditions.map(conditionValue)
          : [],
        canAct: activeParticipant.canAct,
        defeated: activeParticipant.defeated,
        rallied: activeParticipant.rallied,
      },
    } : {}),
  };
}

export function compactWriteStateExcerpt(stateExcerpt) {
  if (!stateExcerpt || typeof stateExcerpt !== 'object' || Array.isArray(stateExcerpt)) {
    return stateExcerpt;
  }
  const result = { ...stateExcerpt };
  for (const key of ['actor', 'character', 'playerCharacter']) {
    if (result[key]) result[key] = actorStateForWrite(result[key]);
  }
  if (result.combat) result.combat = combatStateForWrite(result.combat);
  return result;
}
