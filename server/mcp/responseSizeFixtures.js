import { serializedJsonBytes } from './measurements.js';
import { projectResumeState } from '../helper/resumeProfiles.js';
import { actorStateForWrite, compactWriteStateExcerpt } from '../helper/writeDeltas.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const timestamp = (minute = 0) => `2026-09-15T12:${String(minute % 60).padStart(2, '0')}:00.000Z`;

function item(index) {
  return {
    id: id(10_000 + index),
    slot: index < 2 ? 'weapon' : 'inventory',
    definitionId: id(20_000 + index),
    unresolvedDefinition: false,
    name: `Equipment item ${index + 1}`,
    description: 'A representative carried item with enough detail to exercise the current actor projection.',
    category: index < 2 ? 'WEAPON' : 'GEAR',
    quantity: 1,
    weight: 1,
    damage: index < 2 ? 'D8' : null,
    range: index < 2 ? 'STR' : null,
    grip: index < 2 ? '1H' : null,
    durability: null,
    armorRating: null,
    features: [],
    equipped: index < 2,
    location: null,
    placement: {
      ownerId: id(100), carriedByActorId: id(100), locationId: null,
      containerId: null, equipped: index < 2, heldByActorId: index < 2 ? id(100) : null,
      temporarilyPlaced: false,
    },
    state: {
      status: 'ready', isLit: false, remainingDuration: null, charges: null,
      broken: false, enhanced: false, bonus: null,
    },
    properties: {
      category: index < 2 ? 'WEAPON' : 'GEAR', cost: '1 gold', unit: null,
      isContainer: false, containerCapacity: null, encumbranceModifier: null,
    },
  };
}

function actor(index, equipmentCount = 6) {
  const equipment = Array.from({ length: equipmentCount }, (_, itemIndex) => item((index * 100) + itemIndex));
  return {
    id: id(100 + index), campaignId: id(1), type: 'pc', name: `Hero ${index + 1}`,
    userId: id(500 + index), characterId: id(100 + index), monsterId: null,
    kin: 'Human', profession: 'Fighter', attributes: { STR: 14, CON: 13, AGL: 12, INT: 10, WIL: 11, CHA: 9 },
    skills: { Swords: 14, Evade: 12, Awareness: 10, Healing: 8, Persuasion: 7 },
    conditions: [{ id: `condition:${index}:exhausted`, key: 'exhausted', name: 'exhausted', description: null, source: null, duration: { type: 'indefinite', remaining: null }, affects: { checks: [], attributes: [] } }],
    heroicAbilities: ['Veteran'], hp: { current: 11, max: 13 }, wp: { current: 8, max: 11 },
    inventory: equipment.slice(2), weapons: equipment.slice(0, 2), armor: [], bodyArmor: null,
    helmet: null, shield: null, specialItems: [], heldItems: equipment.slice(0, 2), equipment,
    encumbrance: { schemaVersion: 'encumbrance-v1', capacity: 7, carriedLoad: equipmentCount, overloaded: false, fallbackItems: [] },
    notes: 'Representative GM-visible actor notes.', tags: ['pc'], isAlive: true,
    isVisibleToPlayers: true, revision: 42, updatedAt: timestamp(index),
  };
}

function roll(index, status = 'resolved') {
  return {
    id: id(30_000 + index), campaignId: id(1), actorId: id(100), encounterId: null,
    purpose: `Representative test ${index + 1}`, expression: '1d20', rollKind: 'check',
    targetValue: 12, modifier: 'normal', mode: 'server', visibility: 'players', status,
    result: status === 'resolved' ? { dice: [10], total: 10, outcome: 'success' } : null,
    createdAt: timestamp(index), resolvedAt: status === 'resolved' ? timestamp(index + 1) : null,
  };
}

function scene() {
  return {
    schemaVersion: 'current-scene-v1', location: 'The ruined watchtower',
    description: 'Rain lashes the broken battlements while torchlight moves below.',
    situation: 'The heroes must cross the courtyard without alerting the sentries.',
    activeObjects: [{ id: 'gate', name: 'Collapsed gate', description: 'Partially blocks the eastern passage.', state: { blocked: true }, visibility: 'players' }],
    exits: [{ id: 'stairs', name: 'Cellar stairs', destination: 'Lower vault', status: 'open', visibility: 'players' }],
    dangers: [{ id: 'sentries', name: 'Patrolling sentries', description: 'Two sentries circle the yard.', status: 'active', visibility: 'players' }],
  };
}

function combat(characters) {
  return {
    id: id(2), campaignId: id(1), name: 'Watchtower skirmish', status: 'active', round: 2,
    activeActorId: characters[0].id, activeInitiativeSlot: 1,
    participants: characters.map((entry, index) => ({
      actorId: entry.id, name: entry.name, type: entry.type, initiative: index + 1,
      initiativeSlots: [index + 1], hp: entry.hp, wp: entry.wp, conditions: entry.conditions,
    })),
  };
}

function soloState() {
  const waypoints = Array.from({ length: 12 }, (_, index) => ({
    id: id(40_000 + index), missionId: id(40), position: index, status: index === 4 ? 'active' : index < 4 ? 'cleared' : 'hidden',
    title: index <= 4 ? `Waypoint ${index + 1}` : null,
    description: index <= 4 ? 'A representative revealed waypoint description.' : null,
    exploration: { searchCount: index < 4 ? 1 : 0, scavengeCount: 0, stretchesSpent: index < 4 ? 1 : 0 },
  }));
  return {
    state: { enabled: true, mode: 'official', playerCharacterId: id(100), currentMissionId: id(40) },
    activeMission: { id: id(40), title: 'The lost banner', objective: 'Recover the banner and return safely.', status: 'active', currentWaypointIndex: 4 },
    waypoints, currentWaypoint: waypoints[4],
    activeThreat: { id: id(41), description: 'The enemy patrol closes in.', counter: 4, status: 'active', recurring: true },
    activeDangers: [{ id: id(42), waypointId: waypoints[4].id, description: 'Unstable masonry', status: 'active' }],
  };
}

function resumeFixture({ characterCount = 1, equipmentCount = 6, withCombat = false, withSolo = false, rollCount = 5 } = {}) {
  const characters = Array.from({ length: characterCount }, (_, index) => actor(index, equipmentCount));
  const focusCharacter = { ...characters[0], vitals: { hp: characters[0].hp, wp: characters[0].wp } };
  const currentScene = scene();
  const gameTime = { schemaVersion: 'game-time-v1', elapsedSeconds: 45_900, rounds: 4590, stretches: 51, shifts: 2 };
  const recent = Array.from({ length: rollCount }, (_, index) => roll(index, index === 0 ? 'pending' : 'resolved'));
  return {
    schemaVersion: 'resume-state-v1', campaignRevision: 42,
    campaign: {
      id: id(1), name: 'The Misty Vale', description: 'Representative campaign', system: 'dragonbane',
      rulesVersion: '1', status: 'active', activeSessionId: id(3), currentScene, gameTime,
      revision: 42, role: 'gm', createdAt: timestamp(), updatedAt: timestamp(1),
    },
    characters, focusCharacterId: focusCharacter.id, character: focusCharacter, focusCharacter,
    scene: currentScene,
    session: {
      activeSession: { id: id(3), title: 'Watchtower', status: 'active', summary: null, startedAt: timestamp() },
      lastCheckpoint: { id: id(4), sessionId: id(3), continuationSummary: 'The heroes reached the watchtower.', scene: currentScene, createdAt: timestamp(2) },
      unresolvedThreads: ['Who commands the sentries?', 'Where is the missing banner?'],
    },
    combat: withCombat ? combat(characters) : null,
    solo: withSolo ? soloState() : null,
    rolls: { pending: recent.filter((entry) => entry.status === 'pending'), recent },
    gameTime, gmContext: { antagonist: 'The castellan is secretly allied with the dragon.' },
  };
}

const compactCampaign = resumeFixture();
const multiCharacterCampaign = resumeFixture({ characterCount: 5, rollCount: 10 });
const equipmentHeavyCharacter = resumeFixture({ equipmentCount: 30, rollCount: 10 });
const activeCombatCampaign = resumeFixture({ characterCount: 5, withCombat: true, rollCount: 10 });
const activeSoloMission = resumeFixture({ withSolo: true, equipmentCount: 12, rollCount: 10 });
const historyHeavyCampaign = resumeFixture({ characterCount: 4, rollCount: 30 });

export const MCP_RESPONSE_SIZE_FIXTURES = Object.freeze({
  resume: {
    compactCampaign,
    multiCharacterCampaign,
    equipmentHeavyCharacter,
    activeCombatCampaign,
    activeSoloMission,
    historyHeavyCampaign,
  },
  reads: {
    getCampaignState: {
      campaign: compactCampaign.campaign, actors: compactCampaign.characters,
      scene: compactCampaign.scene, combat: null, recentEvents: [], openThreads: compactCampaign.session.unresolvedThreads,
    },
    getActor: equipmentHeavyCharacter.focusCharacter,
    getSoloState: activeSoloMission.solo,
    getRollHistory: { campaignRevision: 42, requests: historyHeavyCampaign.rolls.recent },
    getSessionHistory: {
      campaignRevision: 42,
      sessions: Array.from({ length: 10 }, (_, index) => ({ id: id(50_000 + index), title: `Session ${index + 1}`, status: 'completed', summary: 'Representative completed-session summary.', startedAt: timestamp(index), endedAt: timestamp(index + 1) })),
      checkpoints: Array.from({ length: 10 }, (_, index) => ({ id: id(60_000 + index), continuationSummary: 'Representative checkpoint continuation summary.', scene: scene(), createdAt: timestamp(index) })),
      nextCursors: { sessions: id(50_009), checkpoints: id(60_009) },
    },
  },
  writes: {
    applyActorChanges: {
      success: true,
      campaign_revision: 43,
      event_ids: [id(70)],
      summary: 'Hero 1 took 2 damage and now has 9 HP.',
      state_excerpt: {
        changes: [{ actor_id: id(100), field: 'hp.current', before: 11, after: 9 }],
        next: { read_required: false },
      },
    },
    resolveGameAction: {
      success: true,
      campaign_revision: 43,
      event_ids: [id(71)],
      summary: 'Hero 1 completed the action.',
      state_excerpt: compactWriteStateExcerpt({ combat: combat([actor(0), actor(1)]) }),
    },
    advanceCampaignTime: { success: true, campaign_revision: 43, event_ids: [id(72)], summary: 'Advanced campaign time by 1 stretch.', state_excerpt: { gameTime: compactCampaign.gameTime, tracker: { currentDay: 1, currentShift: 3 }, equipmentDurationChanges: [], dueNotifications: [] } },
    soloActorWrite: {
      success: true,
      campaign_revision: 43,
      event_ids: [id(73)],
      summary: 'Hero 1 completed a Solo rest.',
      state_excerpt: {
        actor: actorStateForWrite(equipmentHeavyCharacter.focusCharacter),
        roll: roll(40),
        injuryRecovery: [],
      },
    },
  },
});

export function measureRepresentativeResponses() {
  const measurements = Object.fromEntries(Object.entries(MCP_RESPONSE_SIZE_FIXTURES).map(([group, fixtures]) => [
    group,
    Object.fromEntries(Object.entries(fixtures).map(([name, value]) => [name, serializedJsonBytes(value)])),
  ]));
  measurements.resumeProfiles = Object.fromEntries(
    Object.entries(MCP_RESPONSE_SIZE_FIXTURES.resume).map(([name, value]) => [name, {
      compact: serializedJsonBytes(projectResumeState(value, { detail: 'compact', recentRollLimit: 5 })),
      focused: serializedJsonBytes(projectResumeState(value, { detail: 'focused', recentRollLimit: 5 })),
      full: serializedJsonBytes(projectResumeState(value, { detail: 'full' })),
    }]),
  );
  return measurements;
}
