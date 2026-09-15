const RESUME_DETAILS = new Set(['compact', 'focused', 'full']);

function definedEntries(source, keys) {
  if (!source || typeof source !== 'object') return {};
  return Object.fromEntries(keys.flatMap((key) => (
    source[key] === undefined ? [] : [[key, source[key]]]
  )));
}

function compactCondition(condition) {
  if (!condition || typeof condition !== 'object') return condition;
  return definedEntries(condition, ['id', 'key', 'name', 'source', 'duration', 'affects']);
}

function compactItem(item) {
  if (!item || typeof item !== 'object') return item;
  const result = definedEntries(item, [
    'id', 'definitionId', 'name', 'category', 'quantity', 'slot', 'equipped',
    'damage', 'range', 'grip', 'armorRating', 'features',
  ]);
  if (item.placement && typeof item.placement === 'object') {
    result.placement = definedEntries(item.placement, [
      'carriedByActorId', 'locationId', 'containerId', 'equipped', 'heldByActorId',
    ]);
  }
  if (item.state && typeof item.state === 'object') {
    result.state = definedEntries(item.state, [
      'status', 'isLit', 'remainingDuration', 'charges', 'broken', 'enhanced', 'bonus',
    ]);
  }
  return result;
}

function actorSummary(actor) {
  if (!actor) return null;
  return {
    ...definedEntries(actor, [
      'id', 'campaignId', 'type', 'name', 'userId', 'characterId', 'monsterId',
      'kin', 'profession', 'hp', 'wp', 'isAlive', 'revision',
    ]),
    conditions: Array.isArray(actor.conditions)
      ? actor.conditions.map(compactCondition)
      : [],
  };
}

function focusedActor(actor) {
  if (!actor) return null;
  return {
    ...definedEntries(actor, [
      'id', 'campaignId', 'type', 'name', 'description', 'portraitUrl', 'userId',
      'characterId', 'monsterId', 'kin', 'profession', 'age', 'movement', 'armor',
      'armorStatus', 'attributes', 'skills', 'heroicAbilities', 'hp', 'wp',
      'encumbrance', 'notes', 'tags', 'isAlive', 'isVisibleToPlayers', 'revision',
      'updatedAt',
    ]),
    conditions: Array.isArray(actor.conditions)
      ? actor.conditions.map(compactCondition)
      : [],
    equipment: Array.isArray(actor.equipment)
      ? actor.equipment.map(compactItem)
      : [],
  };
}

function sceneSummary(scene) {
  if (!scene) return null;
  return {
    ...definedEntries(scene, ['schemaVersion', 'location', 'description', 'situation']),
    activeObjects: Array.isArray(scene.activeObjects)
      ? scene.activeObjects.map((entry) => definedEntries(entry, ['id', 'name', 'description', 'state', 'visibility']))
      : [],
    exits: Array.isArray(scene.exits)
      ? scene.exits.map((entry) => definedEntries(entry, ['id', 'name', 'destination', 'status', 'visibility']))
      : [],
    dangers: Array.isArray(scene.dangers)
      ? scene.dangers.map((entry) => definedEntries(entry, ['id', 'name', 'description', 'status', 'visibility']))
      : [],
  };
}

function sessionSummary(session, { focused = false } = {}) {
  if (!session) return { activeSession: null, lastCheckpoint: null };
  const checkpoint = session.lastCheckpoint;
  const result = {
    activeSession: session.activeSession
      ? definedEntries(session.activeSession, ['id', 'campaignId', 'title', 'status', 'startedAt', 'startingRevision'])
      : null,
    lastCheckpoint: checkpoint ? {
      ...definedEntries(checkpoint, ['id', 'campaignId', 'sessionId', 'summary', 'continuationSummary', 'campaignRevision', 'createdAt']),
    } : null,
  };
  if (focused) {
    result.unresolvedThreads = Array.isArray(session.unresolvedThreads) ? session.unresolvedThreads : [];
  }
  return result;
}

function compactCombat(combat) {
  if (!combat) return null;
  return definedEntries(combat, [
    'id', 'campaignId', 'name', 'status', 'round', 'activeActorId',
    'activeInitiativeSlot', 'revision',
  ]);
}

function rollSummary(roll) {
  if (!roll || typeof roll !== 'object') return roll;
  return definedEntries(roll, [
    'id', 'campaignId', 'actorId', 'encounterId', 'assignedUserId', 'purpose',
    'expression', 'rollKind', 'targetValue', 'modifier', 'mode', 'visibility',
    'status', 'result', 'createdAt', 'resolvedAt', 'expiresAt', 'pushedFromRequestId',
  ]);
}

function boundedRolls(rolls, limit, { includeRecent }) {
  const pending = Array.isArray(rolls?.pending) ? rolls.pending.map(rollSummary) : [];
  if (!includeRecent) return { pending };
  const pendingIds = new Set(pending.map((roll) => roll?.id).filter(Boolean));
  const recent = (Array.isArray(rolls?.recent) ? rolls.recent : [])
    .filter((roll) => !pendingIds.has(roll?.id))
    .slice(0, limit)
    .map(rollSummary);
  return { pending, recent };
}

function waypointSummary(waypoint) {
  if (!waypoint) return null;
  return definedEntries(waypoint, [
    'id', 'missionId', 'position', 'status', 'title', 'description', 'exploration',
    'locationType', 'contents', 'clues',
  ]);
}

function threatSummary(threat) {
  if (!threat) return null;
  return definedEntries(threat, [
    'id', 'missionId', 'description', 'counter', 'status', 'recurring', 'trigger',
  ]);
}

function dangerSummary(danger) {
  if (!danger) return null;
  return definedEntries(danger, [
    'id', 'missionId', 'waypointId', 'description', 'status', 'sourceRollId',
  ]);
}

function compactSolo(solo, { focused = false } = {}) {
  if (!solo) return null;
  const currentWaypoint = waypointSummary(solo.currentWaypoint);
  const mission = solo.activeMission
    ? definedEntries(solo.activeMission, [
      'id', 'campaignId', 'moduleKey', 'title', 'objective', 'status',
      'currentWaypointIndex', 'activeThreatId', 'objectiveWaypointId', 'returnMode',
      'discoveredClues', 'storyFlags', 'startedAt',
    ])
    : null;
  const result = {
    state: solo.state || null,
    activeMission: mission,
    currentWaypoint,
    activeThreat: threatSummary(solo.activeThreat),
    activeDangers: Array.isArray(solo.activeDangers)
      ? solo.activeDangers.map(dangerSummary)
      : [],
  };
  if (focused && Array.isArray(solo.waypoints)) {
    const currentPosition = Number(currentWaypoint?.position);
    result.relevantWaypoints = solo.waypoints
      .filter((waypoint) => (
        waypoint.id === currentWaypoint?.id
        || waypoint.id === mission?.objectiveWaypointId
        || (Number.isFinite(currentPosition) && Math.abs(Number(waypoint.position) - currentPosition) <= 1)
      ))
      .slice(0, 4)
      .map(waypointSummary);
  }
  return result;
}

function campaignSummary(campaign) {
  if (!campaign) return null;
  return definedEntries(campaign, [
    'id', 'name', 'system', 'rulesVersion', 'status',
    'activeSessionId', 'revision', 'role', 'createdAt', 'updatedAt',
  ]);
}

/**
 * Project a single authoritative resume snapshot into a token-conscious contract.
 * `full` deliberately preserves the v1 shape for existing REST, resource, and MCP clients.
 */
export function projectResumeState(fullState, {
  detail = 'full',
  recentRollLimit = detail === 'full' ? 30 : 5,
} = {}) {
  const profile = RESUME_DETAILS.has(detail) ? detail : 'full';
  const limit = Math.max(1, Math.min(30, Number(recentRollLimit) || (profile === 'full' ? 30 : 5)));
  if (profile === 'full') return fullState;

  const focus = fullState.focusCharacter || fullState.character || null;
  const base = {
    schemaVersion: 'resume-state-v2',
    profile,
    campaignRevision: fullState.campaignRevision,
    campaign: campaignSummary(fullState.campaign),
    focusCharacterId: fullState.focusCharacterId || focus?.id || null,
    character: profile === 'focused' ? focusedActor(focus) : actorSummary(focus),
    scene: sceneSummary(fullState.scene),
    session: sessionSummary(fullState.session, { focused: profile === 'focused' }),
    combat: profile === 'focused' ? fullState.combat : compactCombat(fullState.combat),
    solo: compactSolo(fullState.solo, { focused: profile === 'focused' }),
    rolls: boundedRolls(fullState.rolls, limit, { includeRecent: profile === 'focused' }),
    gameTime: fullState.gameTime || null,
  };
  if (profile === 'focused' && fullState.gmContext !== undefined) {
    base.gmContext = fullState.gmContext;
  }
  return base;
}
