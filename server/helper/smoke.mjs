import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { pool, withTransaction } from '../db.js';
import { executeRpc } from '../rpc.js';

const apiBaseUrl = process.env.HELPER_SMOKE_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const mcpUrl = process.env.MCP_SMOKE_URL;
const token = process.env.DEVELOPMENT_TOKEN;
const email = String(process.env.DEVELOPMENT_USER_EMAIL || process.env.ADMIN_EMAIL || '').toLowerCase();

if (!token || !email) {
  throw new Error('DEVELOPMENT_TOKEN and DEVELOPMENT_USER_EMAIL (or ADMIN_EMAIL) are required.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}, accessToken = token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

let campaignId;
let actorId;
let combatId;
let combatantId;
let monsterId;
let playerUserId;
let mcpClient;

try {
  const { rows: users } = await pool.query(
    'SELECT id, email, role FROM users WHERE lower(email) = $1 AND is_active = true',
    [email],
  );
  assert(users[0], 'Development user does not exist.');

  await withTransaction(async (client) => {
    const campaign = await client.query(
      `INSERT INTO parties (name, description, created_by, gm_context, open_threads)
       VALUES ($1, $2, $3, '{"secret":"smoke-gm-only"}'::jsonb, '["hidden thread"]'::jsonb)
       RETURNING id`,
      [`Helper smoke ${randomUUID()}`, 'Disposable Helper API integration test', users[0].id],
    );
    campaignId = campaign.rows[0].id;
    const actor = await client.query(
      `INSERT INTO characters (
         user_id, party_id, name, max_hp, current_hp, max_wp, current_wp,
         conditions, equipment, skill_levels
       ) VALUES (
         $1, $2, 'Smoke Hero', 14, 14, 8, 8,
         '{"exhausted":false,"sickly":false,"dazed":false,"angry":false,"scared":false,"disheartened":false}'::jsonb,
         '{"inventory":[],"equipped":{"weapons":[]},"money":{}}'::jsonb,
         '{"Spot Hidden":12}'::jsonb
       ) RETURNING id`,
      [users[0].id, campaignId],
    );
    actorId = actor.rows[0].id;

    const encounter = await client.query(
      `INSERT INTO encounters (party_id, name, status, current_round)
       VALUES ($1, 'Smoke combat', 'planning', 0)
       RETURNING id`,
      [campaignId],
    );
    combatId = encounter.rows[0].id;
    await client.query(
      `INSERT INTO encounter_combatants (
         encounter_id, character_id, is_player_character, display_name,
         current_hp, max_hp, current_wp, max_wp
       ) VALUES ($1, $2, true, 'Smoke Hero', 14, 14, 8, 8)`,
      [combatId, actorId],
    );
    const combatant = await client.query(
      `INSERT INTO encounter_combatants (
         encounter_id, is_player_character, display_name, current_hp, max_hp,
         current_wp, max_wp
       ) VALUES ($1, false, 'Smoke Goblin', 7, 7, 0, 0)
       RETURNING id`,
      [combatId],
    );
    combatantId = combatant.rows[0].id;
    const monster = await client.query(
      `INSERT INTO monsters (created_by, name, category, stats)
       VALUES ($1, $2, 'Smoke test', '{"HP":9,"WP":2,"FEROCITY":2}'::jsonb)
       RETURNING id`,
      [users[0].id, `Smoke Hydra ${randomUUID()}`],
    );
    monsterId = monster.rows[0].id;
  });

  const combatBefore = await pool.query(
    'SELECT helper_revision FROM encounters WHERE id = $1',
    [combatId],
  );
  await pool.query(
    'UPDATE encounter_combatants SET current_hp = current_hp - 1 WHERE id = $1',
    [combatantId],
  );
  const combatAfter = await pool.query(
    'SELECT helper_revision FROM encounters WHERE id = $1',
    [combatId],
  );
  assert(
    Number(combatAfter.rows[0].helper_revision) === Number(combatBefore.rows[0].helper_revision) + 1,
    'Combat revision did not increase after a participant changed.',
  );

  const state = await api(`/api/v1/campaigns/${campaignId}/state`);
  assert(state.response.status === 200, `Campaign state failed: ${JSON.stringify(state.payload)}`);
  const originalRevision = state.payload.data.campaign.revision;
  assert(Number.isInteger(originalRevision), 'Campaign state did not contain an integer revision.');

  const idempotencyKey = `smoke-damage-${randomUUID()}`;
  const damageBody = {
    reason: 'Automated integration-test sword hit',
    changes: [{ type: 'damage', amount: 6, damage_type: 'slashing' }],
  };
  const damageHeaders = {
    'if-match': `"${originalRevision}"`,
    'idempotency-key': idempotencyKey,
  };
  const damage = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    { method: 'POST', headers: damageHeaders, body: JSON.stringify(damageBody) },
  );
  assert(damage.response.status === 200, `Damage failed: ${JSON.stringify(damage.payload)}`);
  assert(damage.payload.data.state_excerpt.actor.hp.current === 8, 'Damage did not set HP to 8.');
  const damageRevision = damage.payload.data.campaign_revision;

  const duplicate = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    { method: 'POST', headers: damageHeaders, body: JSON.stringify(damageBody) },
  );
  assert(duplicate.response.status === 200, 'Idempotent replay failed.');
  assert(duplicate.payload.data.event_ids[0] === damage.payload.data.event_ids[0], 'Replay returned a different event.');
  const hpAfterReplay = await pool.query('SELECT current_hp FROM characters WHERE id = $1', [actorId]);
  assert(hpAfterReplay.rows[0].current_hp === 8, 'Idempotent replay applied damage twice.');

  const idempotencyConflict = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: damageHeaders,
      body: JSON.stringify({
        reason: 'Different request with a reused key',
        changes: [{ type: 'heal', amount: 1 }],
      }),
    },
  );
  assert(idempotencyConflict.response.status === 409, 'Reused idempotency key did not return HTTP 409.');
  assert(
    idempotencyConflict.payload.error.code === 'IDEMPOTENCY_CONFLICT',
    'Reused idempotency key returned the wrong error code.',
  );

  await pool.query('UPDATE characters SET current_wp = current_wp - 1 WHERE id = $1', [actorId]);
  const stale = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${damageRevision}"`,
        'idempotency-key': `smoke-stale-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Stale write test', changes: [{ type: 'heal', amount: 1 }] }),
    },
  );
  assert(stale.response.status === 409, 'Stale revision did not return HTTP 409.');
  assert(stale.payload.error.code === 'REVISION_CONFLICT', 'Stale revision returned the wrong error code.');

  const refreshed = await api(`/api/v1/campaigns/${campaignId}/state`);
  const eventRevision = refreshed.payload.data.campaign.revision;
  const failedTransaction = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${eventRevision}"`,
        'idempotency-key': `smoke-rollback-${randomUUID()}`,
      },
      body: JSON.stringify({
        reason: 'Atomic rollback test',
        changes: [
          { type: 'heal', amount: 1 },
          { type: 'spend_wp', amount: 999 },
        ],
      }),
    },
  );
  assert(failedTransaction.response.status === 400, 'Invalid atomic change set did not fail.');
  const afterFailedTransaction = await pool.query(
    'SELECT current_hp FROM characters WHERE id = $1',
    [actorId],
  );
  assert(afterFailedTransaction.rows[0].current_hp === 8, 'Failed atomic change set changed actor HP.');

  const appended = await api(`/api/v1/campaigns/${campaignId}/events`, {
    method: 'POST',
    headers: {
      'if-match': `"${eventRevision}"`,
      'idempotency-key': `smoke-event-${randomUUID()}`,
    },
    body: JSON.stringify({
      type: 'campaign.smoke_test',
      visibility: 'gm',
      payload: { disposable: true },
      reason: 'Automated Helper API integration test',
    }),
  });
  assert(appended.response.status === 200, `Event append failed: ${JSON.stringify(appended.payload)}`);

  const events = await api(`/api/v1/campaigns/${campaignId}/events?limit=10`);
  assert(
    events.payload.data.some(({ type }) => type === 'campaign.smoke_test'),
    'Narrative event was not returned.',
  );
  assert(
    events.payload.data.some(({ type }) => type === 'app.characters.update'),
    'Direct application-style character update did not produce an audit event.',
  );
  assert(events.payload.data[0].sequence > events.payload.data[1].sequence, 'Events are not ordered newest first.');

  const sessionStarted = await api(
    `/api/v1/campaigns/${campaignId}/sessions/start`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${appended.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-session-start-${randomUUID()}`,
      },
      body: JSON.stringify({
        title: 'Smoke game session',
        gm_notes: 'Disposable private session notes.',
        opening_scene: { location: 'Smoke bridge', situation: 'Combat is imminent' },
        reason: 'Automated session lifecycle test begins.',
      }),
    },
  );
  assert(sessionStarted.response.status === 200, `Session start failed: ${JSON.stringify(sessionStarted.payload)}`);
  const sessionId = sessionStarted.payload.data.state_excerpt.session.id;
  const startRevision = sessionStarted.payload.data.campaign_revision;
  const startKey = `smoke-combat-start-${randomUUID()}`;
  const startBody = {
    initiatives: [
      { actor_id: actorId, initiative: 1 },
      { actor_id: combatantId, initiative: 2 },
    ],
    reason: 'Automated integration test starts combat.',
  };
  const started = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/start`,
    {
      method: 'POST',
      headers: { 'if-match': `"${startRevision}"`, 'idempotency-key': startKey },
      body: JSON.stringify(startBody),
    },
  );
  assert(started.response.status === 200, `Combat start failed: ${JSON.stringify(started.payload)}`);
  assert(started.payload.data.state_excerpt.combat.status === 'active', 'Combat did not become active.');
  assert(started.payload.data.state_excerpt.combat.activeActorId === actorId, 'Combat selected the wrong first actor.');
  const startedHero = started.payload.data.state_excerpt.combat.participants.find(({ actorId: id }) => id === actorId);
  assert(startedHero.hp.current === 8, 'Combat start did not synchronize current character HP.');

  const repeatedStart = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/start`,
    {
      method: 'POST',
      headers: { 'if-match': `"${startRevision}"`, 'idempotency-key': startKey },
      body: JSON.stringify(startBody),
    },
  );
  assert(repeatedStart.response.status === 200, 'Idempotent combat start replay failed.');
  assert(
    repeatedStart.payload.data.event_ids[0] === started.payload.data.event_ids[0],
    'Combat start replay returned a different event.',
  );

  const prematureAdvance = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/turns/advance`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${started.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-premature-advance-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Negative test before the active actor acts.' }),
    },
  );
  assert(prematureAdvance.response.status === 409, 'Unresolved active turn was allowed to advance.');
  assert(prematureAdvance.payload.error.code === 'INVALID_STATE', 'Premature advance returned the wrong error.');

  const wrongActor = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/actions`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${started.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-wrong-actor-${randomUUID()}`,
      },
      body: JSON.stringify({
        actor_id: combatantId,
        action: 'Act out of turn',
        outcome: 'automatic',
        effects: [],
        consume_turn: true,
        reason: 'Negative test for active-turn enforcement.',
      }),
    },
  );
  assert(wrongActor.response.status === 409, 'A non-active actor was allowed to act.');
  assert(wrongActor.payload.error.code === 'NOT_ACTORS_TURN', 'Out-of-turn action returned the wrong error.');

  const heroAction = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/actions`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${started.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-combat-action-${randomUUID()}`,
      },
      body: JSON.stringify({
        actor_id: actorId,
        action: 'Sword attack',
        outcome: 'success',
        effects: [
          { actor_id: combatantId, changes: [{ type: 'damage', amount: 2, damage_type: 'slashing' }] },
          { actor_id: actorId, changes: [{ type: 'spend_wp', amount: 1 }] },
        ],
        consume_turn: true,
        reason: 'Automated combat action test.',
      }),
    },
  );
  assert(heroAction.response.status === 200, `Combat action failed: ${JSON.stringify(heroAction.payload)}`);
  const actionCombat = heroAction.payload.data.state_excerpt.combat;
  assert(actionCombat.participants.find(({ actorId: id }) => id === combatantId).hp.current === 4, 'Atomic combat damage was not applied.');
  assert(actionCombat.participants.find(({ actorId: id }) => id === actorId).wp.current === 6, 'Atomic combat WP cost was not applied.');
  assert(actionCombat.participants.find(({ actorId: id }) => id === actorId).hasActed, 'Resolved action did not consume the turn.');

  const advancedToGoblin = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/turns/advance`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${heroAction.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-combat-advance-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Hero turn completed.' }),
    },
  );
  assert(advancedToGoblin.response.status === 200, `Combat advance failed: ${JSON.stringify(advancedToGoblin.payload)}`);
  assert(advancedToGoblin.payload.data.state_excerpt.combat.activeActorId === combatantId, 'Turn did not advance to the goblin.');

  const goblinAction = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/actions`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${advancedToGoblin.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-goblin-action-${randomUUID()}`,
      },
      body: JSON.stringify({
        actor_id: combatantId,
        action: 'Reposition',
        outcome: 'automatic',
        effects: [],
        consume_turn: true,
        reason: 'The goblin spends its action moving.',
      }),
    },
  );
  assert(goblinAction.response.status === 200, `Second combat action failed: ${JSON.stringify(goblinAction.payload)}`);

  const nextRound = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/turns/advance`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${goblinAction.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-next-round-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'All living combatants have acted.' }),
    },
  );
  assert(nextRound.response.status === 200, `Round advance failed: ${JSON.stringify(nextRound.payload)}`);
  assert(nextRound.payload.data.state_excerpt.combat.round === 2, 'Combat did not advance to round 2.');
  assert(nextRound.payload.data.state_excerpt.combat.activeActorId === actorId, 'New round selected the wrong first actor.');

  const ended = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/end`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${nextRound.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-combat-end-${randomUUID()}`,
      },
      body: JSON.stringify({
        outcome: 'victory',
        summary: 'The disposable smoke-test battle is complete.',
        reason: 'Automated combat lifecycle test completed.',
      }),
    },
  );
  assert(ended.response.status === 200, `Combat end failed: ${JSON.stringify(ended.payload)}`);
  assert(ended.payload.data.state_excerpt.combat.status === 'completed', 'Combat did not become completed.');
  assert(ended.payload.data.state_excerpt.combat.activeActorId === null, 'Ended combat retained an active actor.');

  const sessionCompleted = await api(
    `/api/v1/campaigns/${campaignId}/sessions/${sessionId}/complete`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${ended.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-session-complete-${randomUUID()}`,
      },
      body: JSON.stringify({
        summary: 'The smoke-test heroes completed the disposable battle.',
        unresolved_threads: ['A disposable unresolved smoke-test hook.'],
        ending_scene: { location: 'Smoke bridge', situation: 'The battle is over' },
        reason: 'Automated session lifecycle test ends.',
      }),
    },
  );
  assert(sessionCompleted.response.status === 200, `Session completion failed: ${JSON.stringify(sessionCompleted.payload)}`);
  assert(sessionCompleted.payload.data.state_excerpt.session.status === 'completed', 'Session did not become completed.');
  assert(sessionCompleted.payload.data.state_excerpt.campaign.activeSessionId === null, 'Completed session remained active.');
  const sessionHistory = await api(`/api/v1/campaigns/${campaignId}/sessions?limit=5`);
  assert(sessionHistory.response.status === 200, 'Session history failed.');
  assert(
    sessionHistory.payload.data.sessions.some(({ id, summary }) => id === sessionId && summary.includes('disposable battle')),
    'Completed session summary was not returned by session history.',
  );
  const sessionCombatEvents = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM campaign_events
     WHERE campaign_id = $1 AND session_id = $2 AND type LIKE 'combat.%'`,
    [campaignId, sessionId],
  );
  assert(sessionCombatEvents.rows[0].count > 0, 'Combat events were not attached to the active game session.');

  const setupOptions = await api(
    `/api/v1/campaigns/${campaignId}/encounter-options?monsterSearch=Smoke%20Hydra&monsterLimit=10`,
  );
  assert(setupOptions.response.status === 200, `Encounter options failed: ${JSON.stringify(setupOptions.payload)}`);
  assert(
    setupOptions.payload.data.characters.some(({ id }) => id === actorId),
    'Encounter options omitted the campaign character.',
  );
  assert(
    setupOptions.payload.data.monsters.some(({ id }) => id === monsterId),
    'Encounter options omitted the matching monster.',
  );

  const preparedEncounter = await api(
    `/api/v1/campaigns/${campaignId}/encounters`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${sessionCompleted.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-create-encounter-${randomUUID()}`,
      },
      body: JSON.stringify({
        name: 'Prepared smoke combat',
        description: 'Created through the Helper API.',
        reason: 'Automated encounter preparation test.',
      }),
    },
  );
  assert(preparedEncounter.response.status === 200, `Encounter creation failed: ${JSON.stringify(preparedEncounter.payload)}`);
  const preparedCombatId = preparedEncounter.payload.data.state_excerpt.combat.id;

  const addedParticipants = await api(
    `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/participants`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${preparedEncounter.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-add-participants-${randomUUID()}`,
      },
      body: JSON.stringify({
        character_ids: [actorId],
        monsters: [{ monster_id: monsterId, count: 1, use_ferocity: true }],
        reason: 'Add the hero and a ferocity-two monster.',
      }),
    },
  );
  assert(addedParticipants.response.status === 200, `Adding participants failed: ${JSON.stringify(addedParticipants.payload)}`);
  const preparedParticipants = addedParticipants.payload.data.state_excerpt.combat.participants;
  assert(preparedParticipants.length === 3, 'Monster ferocity did not expand into two action participants.');
  assert(
    preparedParticipants.some(({ name }) => name.endsWith('(Act 1)'))
      && preparedParticipants.some(({ name }) => name.endsWith('(Act 2)')),
    'Ferocity action names were not generated.',
  );

  const removableMonster = preparedParticipants.find(({ type }) => type === 'monster');
  const removedParticipant = await api(
    `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/participants/${removableMonster.actorId}`,
    {
      method: 'DELETE',
      headers: {
        'if-match': `"${addedParticipants.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-remove-participant-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Verify planned participants can be removed.' }),
    },
  );
  assert(removedParticipant.response.status === 200, `Removing participant failed: ${JSON.stringify(removedParticipant.payload)}`);
  assert(
    removedParticipant.payload.data.state_excerpt.combat.participants.length === 2,
    'Removed participant remained in the planned encounter.',
  );

  const soloOptions = await api(`/api/v1/campaigns/${campaignId}/solo/options`);
  assert(soloOptions.response.status === 200, `Solo options failed: ${JSON.stringify(soloOptions.payload)}`);
  assert(
    soloOptions.payload.data.characters.some(({ id }) => id === actorId),
    'Solo options omitted the campaign character.',
  );
  const soloEnableKey = `smoke-solo-enable-${randomUUID()}`;
  const soloEnableBody = {
    player_character_id: actorId,
    mode: 'custom',
    ruleset_version: 'db-solo-v1.2',
    oracle_default_tilt: 'ask',
    reason: 'Enable the disposable custom solo campaign.',
  };
  const soloEnabled = await api(
    `/api/v1/campaigns/${campaignId}/solo`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${soloOptions.payload.data.campaignRevision}"`,
        'idempotency-key': soloEnableKey,
      },
      body: JSON.stringify(soloEnableBody),
    },
  );
  assert(soloEnabled.response.status === 200, `Solo enable failed: ${JSON.stringify(soloEnabled.payload)}`);
  assert(soloEnabled.payload.data.state_excerpt.solo.enabled, 'Solo mode was not enabled.');

  const soloEnabledReplay = await api(
    `/api/v1/campaigns/${campaignId}/solo`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${soloOptions.payload.data.campaignRevision}"`,
        'idempotency-key': soloEnableKey,
      },
      body: JSON.stringify(soloEnableBody),
    },
  );
  assert(soloEnabledReplay.response.status === 200, 'Solo enable idempotent replay failed.');
  assert(
    soloEnabledReplay.payload.data.event_ids[0] === soloEnabled.payload.data.event_ids[0],
    'Solo enable replay returned a different event.',
  );

  const armyOfOne = soloOptions.payload.data.heroicAbilities.find(
    ({ ruleKey }) => ruleKey === 'solo.army_of_one',
  );
  assert(armyOfOne, 'Solo options omitted Army of One.');
  const soleSurvivor = soloOptions.payload.data.heroicAbilities.find(
    ({ ruleKey }) => ruleKey === 'solo.sole_survivor',
  );
  assert(soleSurvivor, 'Solo options omitted Sole Survivor.');
  const selectedSoloAbility = await api(
    `/api/v1/campaigns/${campaignId}/solo/heroic-ability`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${soloEnabled.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-solo-ability-${randomUUID()}`,
      },
      body: JSON.stringify({
        ability_id: armyOfOne.id,
        reason: 'Confirm Army of One as the disposable solo character additional ability.',
      }),
    },
  );
  assert(selectedSoloAbility.response.status === 200, `Solo ability selection failed: ${JSON.stringify(selectedSoloAbility.payload)}`);
  assert(
    selectedSoloAbility.payload.data.state_excerpt.playerCharacter.heroicAbilities.includes('Army of One'),
    'Army of One was not added to the solo character.',
  );

  const preparedForArmy = removedParticipant.payload.data.state_excerpt.combat.participants;
  const armyEnemy = preparedForArmy.find(({ type }) => type === 'monster');
  assert(armyEnemy, 'The prepared Army of One combat has no enemy.');
  const armyCombatStarted = await api(
    `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/start`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${selectedSoloAbility.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-army-start-${randomUUID()}`,
      },
      body: JSON.stringify({
        initiatives: [
          { actor_id: actorId, initiative_slots: [2, 8] },
          { actor_id: armyEnemy.actorId, initiative: 5 },
        ],
        reason: 'Verify Army of One multi-initiative combat.',
      }),
    },
  );
  assert(armyCombatStarted.response.status === 200, `Army of One combat failed to start: ${JSON.stringify(armyCombatStarted.payload)}`);
  let armyRevision = armyCombatStarted.payload.data.campaign_revision;
  let armyCombat = armyCombatStarted.payload.data.state_excerpt.combat;
  assert(armyCombat.activeActorId === actorId && armyCombat.activeInitiativeSlot === 2, 'Army of One first slot was not active.');
  assert(
    armyCombat.participants.find(({ actorId: id }) => id === actorId)?.initiativeSlots?.join(',') === '2,8',
    'Army of One did not persist both initiative slots.',
  );

  const resolveArmyTurn = async (actorIdToResolve, label) => {
    const resolved = await api(
      `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/actions`,
      {
        method: 'POST',
        headers: {
          'if-match': `"${armyRevision}"`,
          'idempotency-key': `smoke-army-action-${label}-${randomUUID()}`,
        },
        body: JSON.stringify({
          actor_id: actorIdToResolve,
          action: `${label} test action`,
          outcome: 'automatic',
          effects: [],
          consume_turn: true,
          reason: `Resolve ${label} in the Army of One test.`,
        }),
      },
    );
    assert(resolved.response.status === 200, `Army action failed: ${JSON.stringify(resolved.payload)}`);
    armyRevision = resolved.payload.data.campaign_revision;
    const advanced = await api(
      `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/turns/advance`,
      {
        method: 'POST',
        headers: {
          'if-match': `"${armyRevision}"`,
          'idempotency-key': `smoke-army-advance-${label}-${randomUUID()}`,
        },
        body: JSON.stringify({ reason: `Advance after ${label}.` }),
      },
    );
    assert(advanced.response.status === 200, `Army turn advance failed: ${JSON.stringify(advanced.payload)}`);
    armyRevision = advanced.payload.data.campaign_revision;
    armyCombat = advanced.payload.data.state_excerpt.combat;
  };

  await resolveArmyTurn(actorId, 'first hero slot');
  assert(armyCombat.activeActorId === armyEnemy.actorId && armyCombat.activeInitiativeSlot === 5, 'Enemy did not act between Army of One slots.');
  await resolveArmyTurn(armyEnemy.actorId, 'enemy slot');
  assert(armyCombat.activeActorId === actorId && armyCombat.activeInitiativeSlot === 8, 'Army of One second slot was not reached.');
  await resolveArmyTurn(actorId, 'second hero slot');
  assert(armyCombat.round === 2 && armyCombat.activeActorId === actorId, 'Army of One round did not reset after both hero slots.');

  const armyCombatEnded = await api(
    `/api/v1/campaigns/${campaignId}/combat/${preparedCombatId}/end`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${armyRevision}"`,
        'idempotency-key': `smoke-army-end-${randomUUID()}`,
      },
      body: JSON.stringify({
        outcome: 'other',
        summary: 'Army of One multi-slot verification complete.',
        reason: 'End the disposable Army of One combat.',
      }),
    },
  );
  assert(armyCombatEnded.response.status === 200, `Army combat end failed: ${JSON.stringify(armyCombatEnded.payload)}`);

  const selectedSoleSurvivor = await api(
    `/api/v1/campaigns/${campaignId}/solo/heroic-ability`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${armyCombatEnded.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-solo-survivor-${randomUUID()}`,
      },
      body: JSON.stringify({
        ability_id: soleSurvivor.id,
        reason: 'Confirm Sole Survivor and verify its atomic WP cost.',
      }),
    },
  );
  assert(selectedSoleSurvivor.response.status === 200, `Sole Survivor selection failed: ${JSON.stringify(selectedSoleSurvivor.payload)}`);
  const wpBeforeSoleSurvivor = await pool.query(
    'SELECT current_wp, conditions FROM characters WHERE id = $1',
    [actorId],
  );
  const soleSurvivorSpent = await executeRpc(
    users[0],
    'spend_solo_survivor_wp',
    { p_character_id: actorId },
  );
  assert(
    soleSurvivorSpent.current_wp === Number(wpBeforeSoleSurvivor.rows[0].current_wp) - 3,
    'Sole Survivor did not spend exactly 3 WP.',
  );
  const afterSoleSurvivor = await pool.query(
    'SELECT current_wp, conditions FROM characters WHERE id = $1',
    [actorId],
  );
  assert(
    JSON.stringify(afterSoleSurvivor.rows[0].conditions) === JSON.stringify(wpBeforeSoleSurvivor.rows[0].conditions),
    'Sole Survivor changed a condition.',
  );
  await pool.query('UPDATE characters SET current_wp = 2 WHERE id = $1', [actorId]);
  let insufficientSoleSurvivorError;
  try {
    await executeRpc(users[0], 'spend_solo_survivor_wp', { p_character_id: actorId });
  } catch (error) {
    insufficientSoleSurvivorError = error;
  }
  assert(insufficientSoleSurvivorError?.status === 409, 'Sole Survivor allowed a character with fewer than 3 WP to spend.');
  const wpAfterRejectedSpend = await pool.query('SELECT current_wp FROM characters WHERE id = $1', [actorId]);
  assert(Number(wpAfterRejectedSpend.rows[0].current_wp) === 2, 'Rejected Sole Survivor spend changed WP.');

  const stateAfterSoloAbilityChecks = await api(`/api/v1/campaigns/${campaignId}/state`);
  assert(stateAfterSoloAbilityChecks.response.status === 200, 'Could not refresh campaign state after solo ability checks.');

  const fortune = await api(
    `/api/v1/campaigns/${campaignId}/solo/fortune`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${stateAfterSoloAbilityChecks.payload.data.campaign.revision}"`,
        'idempotency-key': `smoke-fortune-${randomUUID()}`,
      },
      body: JSON.stringify({
        question: 'Is the smoke gate guarded?',
        category: 'yes_no',
        tilt: 'unlikely',
        reason: 'Verify an authoritative recorded Fortune roll.',
      }),
    },
  );
  assert(fortune.response.status === 200, `Fortune roll failed: ${JSON.stringify(fortune.payload)}`);
  const fortuneRoll = fortune.payload.data.state_excerpt.roll;
  assert(fortuneRoll.dice.length === 2, 'Unlikely Fortune did not retain two dice.');
  assert(
    fortuneRoll.keptValues[0] === Math.min(...fortuneRoll.dice),
    'Unlikely Fortune did not retain the lower die.',
  );

  const inspiration = await api(
    `/api/v1/campaigns/${campaignId}/solo/inspiration`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${fortune.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-inspiration-${randomUUID()}`,
      },
      body: JSON.stringify({
        columns: ['action', 'thing'],
        reason: 'Verify a recorded generic Inspiration draw.',
      }),
    },
  );
  assert(inspiration.response.status === 200, `Inspiration draw failed: ${JSON.stringify(inspiration.payload)}`);
  assert(
    inspiration.payload.data.state_excerpt.roll.result.officialTable === false,
    'Generic Inspiration was incorrectly presented as an official table.',
  );

  const soloState = await api(`/api/v1/campaigns/${campaignId}/solo`);
  assert(soloState.response.status === 200, `Solo state failed: ${JSON.stringify(soloState.payload)}`);
  assert(soloState.payload.data.solo.playerCharacterId === actorId, 'Solo state lost the selected character.');
  assert(soloState.payload.data.latestRolls.length === 2, 'Solo state did not return both recorded rolls.');
  assert(
    soloState.payload.data.allowedNextActions.includes('start_solo_mission'),
    'Solo state did not advertise mission start while idle.',
  );
  const storedRolls = await pool.query(
    'SELECT COUNT(*)::integer AS count FROM recorded_rolls WHERE campaign_id = $1',
    [campaignId],
  );
  assert(storedRolls.rows[0].count === 2, 'Solo rolls were not persisted exactly once.');

  const missionStarted = await api(
    `/api/v1/campaigns/${campaignId}/solo/missions`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${inspiration.payload.data.campaign_revision}"`,
        'idempotency-key': `smoke-solo-mission-${randomUUID()}`,
      },
      body: JSON.stringify({
        title: 'The Sunken Bell',
        objective: 'Recover the bell before the tunnels flood.',
        waypoint_count: 4,
        opening_waypoint: {
          title: 'Flooded stair',
          description: 'Cold water flows down into the dark.',
        },
        threat: {
          description: 'The lower tunnels are filling with water.',
          recurring: false,
          trigger_effect: { type: 'route_closed', detail: 'The direct return route floods.' },
        },
        reason: 'Start a disposable custom Solo mission.',
      }),
    },
  );
  assert(missionStarted.response.status === 200, `Solo mission start failed: ${JSON.stringify(missionStarted.payload)}`);
  const missionState = missionStarted.payload.data.state_excerpt;
  assert(missionState.mission.status === 'active', 'Solo mission did not become active.');
  assert(missionState.threat.counter === 1, 'Solo mission threat did not start at 1.');
  assert(!Object.hasOwn(missionState.threat, 'triggerEffect'), 'Untriggered threat effect leaked from mission start.');
  const unknownWaypoints = missionState.waypoints.filter(({ kind }) => kind === 'unknown');
  assert(unknownWaypoints.length === 2, 'Custom mission did not create the requested unknown waypoint placeholders.');
  assert(
    unknownWaypoints.every(({ title, description, status }) => title === null && description === null && status === 'hidden'),
    'An unknown waypoint exposed content before reveal.',
  );
  const missionId = missionState.mission.id;
  const threatId = missionState.threat.id;

  const explorationReady = await api(`/api/v1/campaigns/${campaignId}/solo`);
  assert(
    explorationReady.payload.data.allowedNextActions.includes('search_waypoint')
      && explorationReady.payload.data.allowedNextActions.includes('scavenge_waypoint'),
    'Solo state did not advertise Search and Scavenge at the active waypoint.',
  );

  let threatRevision = missionStarted.payload.data.campaign_revision;
  const openingWaypoint = missionState.currentWaypoint;
  const quickScavengeKey = `smoke-scavenge-${randomUUID()}`;
  const quickScavengeBody = JSON.stringify({
    spend_stretch: false,
    context: 'The abandoned packs on the flooded stair.',
    reason: 'Verify the first quick scavenge does not consume a stretch.',
  });
  const quickScavengeHeaders = {
    'if-match': `"${threatRevision}"`,
    'idempotency-key': quickScavengeKey,
  };
  const quickScavenge = await api(
    `/api/v1/campaigns/${campaignId}/solo/waypoints/${openingWaypoint.id}/scavenge`,
    { method: 'POST', headers: quickScavengeHeaders, body: quickScavengeBody },
  );
  assert(quickScavenge.response.status === 200, `Quick scavenge failed: ${JSON.stringify(quickScavenge.payload)}`);
  assert(quickScavenge.payload.data.state_excerpt.waypoint.exploration.scavengeCount === 1, 'Quick scavenge count was not persisted.');
  assert(quickScavenge.payload.data.state_excerpt.waypoint.exploration.stretchesSpent === 0, 'First quick scavenge consumed a stretch.');
  assert(quickScavenge.payload.data.state_excerpt.threat.counter === 1, 'First quick scavenge advanced the threat.');

  const quickScavengeReplay = await api(
    `/api/v1/campaigns/${campaignId}/solo/waypoints/${openingWaypoint.id}/scavenge`,
    { method: 'POST', headers: quickScavengeHeaders, body: quickScavengeBody },
  );
  assert(quickScavengeReplay.response.status === 200, 'Quick scavenge idempotent replay failed.');
  assert(
    quickScavengeReplay.payload.data.event_ids[0] === quickScavenge.payload.data.event_ids[0],
    'Quick scavenge replay returned a different event.',
  );
  threatRevision = quickScavenge.payload.data.campaign_revision;

  const repeatScavenge = await api(
    `/api/v1/campaigns/${campaignId}/solo/waypoints/${openingWaypoint.id}/scavenge`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${threatRevision}"`,
        'idempotency-key': `smoke-repeat-scavenge-${randomUUID()}`,
      },
      body: JSON.stringify({
        spend_stretch: false,
        reason: 'Verify repeat scavenging automatically consumes a stretch.',
      }),
    },
  );
  assert(repeatScavenge.response.status === 200, `Repeat scavenge failed: ${JSON.stringify(repeatScavenge.payload)}`);
  assert(repeatScavenge.payload.data.state_excerpt.waypoint.exploration.scavengeCount === 2, 'Repeat scavenge count was not persisted.');
  assert(repeatScavenge.payload.data.state_excerpt.waypoint.exploration.stretchesSpent === 1, 'Repeat scavenge did not consume a stretch.');
  assert(repeatScavenge.payload.data.state_excerpt.threat.counter === 2, 'Repeat scavenge did not advance the threat.');
  threatRevision = repeatScavenge.payload.data.campaign_revision;

  const searched = await api(
    `/api/v1/campaigns/${campaignId}/solo/waypoints/${openingWaypoint.id}/search`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${threatRevision}"`,
        'idempotency-key': `smoke-search-${randomUUID()}`,
      },
      body: JSON.stringify({
        known_location: false,
        context: 'The cracked mosaics and flooded alcoves.',
        reason: 'Verify a recorded Spot Hidden Search and its time consequence.',
      }),
    },
  );
  assert(searched.response.status === 200, `Waypoint search failed: ${JSON.stringify(searched.payload)}`);
  assert(searched.payload.data.state_excerpt.waypoint.exploration.searchCount === 1, 'Search count was not persisted.');
  assert(searched.payload.data.state_excerpt.waypoint.exploration.stretchesSpent === 2, 'Search did not consume a stretch.');
  assert(searched.payload.data.state_excerpt.threat.counter === 3, 'Search did not advance the threat.');
  assert(searched.payload.data.state_excerpt.roll.dice.length >= 1, 'Search did not preserve its dice.');
  assert(searched.payload.data.state_excerpt.roll.result.check.target === 12, 'Search did not use the authoritative Spot Hidden value.');
  threatRevision = searched.payload.data.campaign_revision;

  for (const [index, amount] of [2, 1].entries()) {
    const advanced = await api(
      `/api/v1/campaigns/${campaignId}/solo/threats/${threatId}/advance`,
      {
        method: 'POST',
        headers: {
          'if-match': `"${threatRevision}"`,
          'idempotency-key': `smoke-threat-${index}-${randomUUID()}`,
        },
        body: JSON.stringify({
          amount,
          reason: `Disposable threat advance ${index + 1}.`,
        }),
      },
    );
    assert(advanced.response.status === 200, `Threat advance failed: ${JSON.stringify(advanced.payload)}`);
    threatRevision = advanced.payload.data.campaign_revision;
    if (index < 1) {
      assert(
        !Object.hasOwn(advanced.payload.data.state_excerpt.threat, 'triggerEffect'),
        'Threat effect leaked before counter 6.',
      );
    } else {
      assert(advanced.payload.data.state_excerpt.transition.triggered, 'Threat did not trigger at counter 6.');
      assert(
        advanced.payload.data.state_excerpt.threat.triggerEffect.type === 'route_closed',
        'Triggered threat did not reveal its structured effect.',
      );
    }
  }

  const continuedSoloState = await api(`/api/v1/campaigns/${campaignId}/solo`);
  assert(continuedSoloState.response.status === 200, 'Solo mission continuation state failed.');
  assert(continuedSoloState.payload.data.activeMission.id === missionId, 'Solo state lost the active mission.');
  assert(
    continuedSoloState.payload.data.allowedNextActions.includes('reveal_waypoint'),
    'Solo state did not advertise the next waypoint reveal.',
  );
  assert(
    continuedSoloState.payload.data.allowedNextActions.includes('complete_solo_mission'),
    'Solo state did not advertise mission conclusion.',
  );
  assert(continuedSoloState.payload.data.currentWaypoint.status === 'active', 'Solo state lost the active waypoint.');
  assert(
    continuedSoloState.payload.data.waypoints.filter(({ kind }) => kind === 'unknown')
      .every(({ title, description }) => title === null && description === null),
    'Solo continuation state leaked unknown waypoint content.',
  );

  let waypointRevision = continuedSoloState.payload.data.campaignRevision;
  const remainingWaypoints = continuedSoloState.payload.data.waypoints
    .filter(({ position }) => position > 0)
    .sort((left, right) => left.position - right.position);
  for (const waypoint of remainingWaypoints) {
    const isUnknown = waypoint.kind === 'unknown';
    const revealed = await api(
      `/api/v1/campaigns/${campaignId}/solo/waypoints/${waypoint.id}/reveal`,
      {
        method: 'POST',
        headers: {
          'if-match': `"${waypointRevision}"`,
          'idempotency-key': `smoke-waypoint-${waypoint.position}-${randomUUID()}`,
        },
        body: JSON.stringify({
          ...(isUnknown ? {
            title: `Unknown chamber ${waypoint.position}`,
            description: `The chamber at position ${waypoint.position} is revealed only on arrival.`,
            generated_from_roll_ids: waypoint.position === 1 ? [fortuneRoll.id] : [],
          } : {}),
          reason: `Advance to waypoint ${waypoint.position}.`,
        }),
      },
    );
    assert(revealed.response.status === 200, `Waypoint reveal failed: ${JSON.stringify(revealed.payload)}`);
    assert(revealed.payload.data.state_excerpt.currentWaypoint.id === waypoint.id, 'Wrong waypoint became active.');
    const futureUnknowns = revealed.payload.data.state_excerpt.waypoints
      .filter((entry) => entry.position > waypoint.position && entry.kind === 'unknown');
    assert(
      futureUnknowns.every(({ title, description }) => title === null && description === null),
      'Revealing one waypoint leaked a later unknown waypoint.',
    );
    waypointRevision = revealed.payload.data.campaign_revision;
  }

  const missionCompleted = await api(
    `/api/v1/campaigns/${campaignId}/solo/missions/${missionId}/complete`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${waypointRevision}"`,
        'idempotency-key': `smoke-mission-complete-${randomUUID()}`,
      },
      body: JSON.stringify({
        outcome: 'success',
        summary: 'The disposable bell was recovered.',
        rewards: { testReward: true },
        reason: 'Verify successful completion at the objective waypoint.',
      }),
    },
  );
  assert(missionCompleted.response.status === 200, `Mission completion failed: ${JSON.stringify(missionCompleted.payload)}`);
  assert(missionCompleted.payload.data.state_excerpt.mission.status === 'success', 'Mission did not complete successfully.');
  const postMissionState = await api(`/api/v1/campaigns/${campaignId}/solo`);
  assert(postMissionState.payload.data.activeMission === null, 'Completed mission remained active in Solo state.');
  assert(postMissionState.payload.data.solo.currentMissionId === null, 'Solo campaign retained a completed current mission ID.');
  assert(
    postMissionState.payload.data.allowedNextActions.includes('start_solo_mission'),
    'Solo state did not return to mission-start readiness after completion.',
  );

  const playerToken = `smoke-player-${randomUUID()}`;
  const playerIdentity = randomUUID();
  await withTransaction(async (client) => {
    const player = await client.query(
      `INSERT INTO users (email, username, role)
       VALUES ($1, $2, 'player') RETURNING id`,
      [`${playerIdentity}@example.invalid`, `smoke-${playerIdentity}`],
    );
    playerUserId = player.rows[0].id;
    const playerCharacter = await client.query(
      `INSERT INTO characters (user_id, party_id, name)
       VALUES ($1, $2, 'Smoke Player') RETURNING id`,
      [playerUserId, campaignId],
    );
    await client.query(
      `INSERT INTO party_members (party_id, character_id, user_id)
       VALUES ($1, $2, $3)`,
      [campaignId, playerCharacter.rows[0].id, playerUserId],
    );
    await client.query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [createHash('sha256').update(playerToken).digest('hex'), playerUserId],
    );
  });
  const playerState = await api(`/api/v1/campaigns/${campaignId}/state`, {}, playerToken);
  assert(playerState.response.status === 200, 'Authenticated player could not read campaign state.');
  assert(!Object.hasOwn(playerState.payload.data, 'gmContext'), 'Player received GM-only context.');
  assert(playerState.payload.data.openThreads.length === 0, 'Player received GM-only open threads.');
  const forbiddenCombatWrite = await api(
    `/api/v1/campaigns/${campaignId}/combat/${combatId}/end`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${playerState.payload.data.campaign.revision}"`,
        'idempotency-key': `smoke-player-combat-${randomUUID()}`,
      },
      body: JSON.stringify({
        outcome: 'other',
        summary: 'A player must not be able to end combat.',
        reason: 'Authorization negative test.',
      }),
    },
    playerToken,
  );
  assert(forbiddenCombatWrite.response.status === 403, 'A player was allowed to perform a GM combat operation.');

  const openapi = await fetch(`${apiBaseUrl}/openapi.json`);
  assert(openapi.ok, 'OpenAPI document is unavailable.');
  const openapiDocument = await openapi.json();
  assert(
    openapiDocument.paths?.['/api/v1/campaigns/{campaignId}/solo/waypoints/{waypointId}/search']
      && openapiDocument.paths?.['/api/v1/campaigns/{campaignId}/solo/waypoints/{waypointId}/scavenge'],
    'OpenAPI document is missing Solo exploration operations.',
  );

  if (mcpUrl) {
    mcpClient = new Client({ name: 'dragonbane-helper-smoke', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    await mcpClient.connect(transport);
    const tools = await mcpClient.listTools();
    for (const name of [
      'apply_actor_changes',
      'get_encounter_setup_options',
      'create_encounter',
      'add_encounter_participants',
      'remove_encounter_participant',
      'get_session_history',
      'start_session',
      'complete_session',
      'get_solo_options',
      'get_solo_state',
      'enable_solo_mode',
      'disable_solo_mode',
      'select_solo_heroic_ability',
      'ask_fortune',
      'draw_inspiration',
      'start_solo_mission',
      'reveal_waypoint',
      'search_waypoint',
      'scavenge_waypoint',
      'advance_threat',
      'complete_solo_mission',
      'start_combat',
      'resolve_game_action',
      'advance_combat_turn',
      'end_combat',
    ]) {
      assert(tools.tools.some((tool) => tool.name === name), `MCP tool is missing: ${name}`);
    }
    const mcpState = await mcpClient.callTool({
      name: 'get_campaign_state',
      arguments: { campaign_id: campaignId },
    });
    assert(mcpState.structuredContent?.success === true, 'MCP campaign state call was not structured.');
    const mcpSoloState = await mcpClient.callTool({
      name: 'get_solo_state',
      arguments: { campaign_id: campaignId },
    });
    assert(
      mcpSoloState.structuredContent?.data?.solo?.playerCharacterId === actorId,
      'MCP solo state did not return the selected solo character.',
    );
    const mcpOptions = await mcpClient.callTool({
      name: 'get_encounter_setup_options',
      arguments: { campaign_id: campaignId, monster_search: 'Smoke Hydra', monster_limit: 10 },
    });
    assert(
      mcpOptions.structuredContent?.data?.monsters?.some(({ id }) => id === monsterId),
      'MCP encounter options did not return the smoke monster.',
    );
    const mcpSessionStarted = await mcpClient.callTool({
      name: 'start_session',
      arguments: {
        campaign_id: campaignId,
        expected_revision: mcpState.structuredContent.data.campaign.revision,
        idempotency_key: `smoke-mcp-session-start-${randomUUID()}`,
        title: 'MCP smoke game session',
        opening_scene: { location: 'MCP smoke bridge' },
        reason: 'Verify session start through the MCP transport.',
      },
    });
    assert(mcpSessionStarted.structuredContent?.success === true, 'MCP session start failed.');
    const mcpCreated = await mcpClient.callTool({
      name: 'create_encounter',
      arguments: {
        campaign_id: campaignId,
        expected_revision: mcpSessionStarted.structuredContent.campaign_revision,
        idempotency_key: `smoke-mcp-create-${randomUUID()}`,
        name: 'MCP prepared smoke combat',
        reason: 'Verify encounter creation through the MCP transport.',
      },
    });
    assert(mcpCreated.structuredContent?.success === true, 'MCP encounter creation failed.');
    const mcpPreparedCombatId = mcpCreated.structuredContent.state_excerpt.combat.id;
    const mcpAdded = await mcpClient.callTool({
      name: 'add_encounter_participants',
      arguments: {
        campaign_id: campaignId,
        combat_id: mcpPreparedCombatId,
        expected_revision: mcpCreated.structuredContent.campaign_revision,
        idempotency_key: `smoke-mcp-add-${randomUUID()}`,
        character_ids: [actorId],
        monsters: [{ monster_id: monsterId, count: 1, use_ferocity: false }],
        reason: 'Verify participant preparation through the MCP transport.',
      },
    });
    assert(mcpAdded.structuredContent?.success === true, 'MCP participant addition failed.');
    const mcpMonsterActorId = mcpAdded.structuredContent.state_excerpt.combat.participants
      .find(({ type }) => type === 'monster')?.actorId;
    assert(mcpMonsterActorId, 'MCP participant addition did not return a monster actor ID.');
    const mcpRemoved = await mcpClient.callTool({
      name: 'remove_encounter_participant',
      arguments: {
        campaign_id: campaignId,
        combat_id: mcpPreparedCombatId,
        actor_id: mcpMonsterActorId,
        expected_revision: mcpAdded.structuredContent.campaign_revision,
        idempotency_key: `smoke-mcp-remove-${randomUUID()}`,
        reason: 'Verify participant removal through the MCP transport.',
      },
    });
    assert(mcpRemoved.structuredContent?.success === true, 'MCP participant removal failed.');
    const mcpSessionCompleted = await mcpClient.callTool({
      name: 'complete_session',
      arguments: {
        campaign_id: campaignId,
        session_id: mcpSessionStarted.structuredContent.state_excerpt.session.id,
        expected_revision: mcpRemoved.structuredContent.campaign_revision,
        idempotency_key: `smoke-mcp-session-complete-${randomUUID()}`,
        summary: 'The MCP transport completed its disposable session workflow.',
        unresolved_threads: [],
        ending_scene: { location: 'MCP smoke bridge', situation: 'Verification complete' },
        reason: 'Verify session completion through the MCP transport.',
      },
    });
    assert(mcpSessionCompleted.structuredContent?.success === true, 'MCP session completion failed.');
    const mcpHistory = await mcpClient.callTool({
      name: 'get_session_history',
      arguments: { campaign_id: campaignId, limit: 5 },
    });
    assert(
      mcpHistory.structuredContent?.data?.sessions?.some(
        ({ id, status }) => id === mcpSessionStarted.structuredContent.state_excerpt.session.id
          && status === 'completed',
      ),
      'MCP session history did not return the completed session.',
    );
  }

  const soloBeforeDisable = await api(`/api/v1/campaigns/${campaignId}/solo`);
  assert(soloBeforeDisable.response.status === 200, 'Solo state before disable failed.');
  const soloDisabled = await api(
    `/api/v1/campaigns/${campaignId}/solo`,
    {
      method: 'DELETE',
      headers: {
        'if-match': `"${soloBeforeDisable.payload.data.campaignRevision}"`,
        'idempotency-key': `smoke-solo-disable-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Verify safe solo-mode disable behavior.' }),
    },
  );
  assert(soloDisabled.response.status === 200, `Solo disable failed: ${JSON.stringify(soloDisabled.payload)}`);
  assert(soloDisabled.payload.data.state_excerpt.solo.enabled === false, 'Solo mode remained enabled.');
  const characterAfterSoloDisable = await pool.query(
    'SELECT heroic_ability FROM characters WHERE id = $1',
    [actorId],
  );
  assert(
    !(characterAfterSoloDisable.rows[0].heroic_ability || []).includes('Sole Survivor'),
    'A system-granted solo ability remained after disabling solo mode.',
  );

  console.log(JSON.stringify({
    success: true,
    checks: [
      'campaign state',
      'combat revision',
      'damage write',
      'idempotent replay',
      'idempotency conflict',
      'revision conflict',
      'atomic rollback',
      'append-only event sequence',
      'automatic audit event for non-Helper campaign writes',
      'combat start and idempotent replay',
      'active-turn enforcement',
      'atomic combat action effects',
      'combat turn and round advancement',
      'combat completion',
      'session start, event binding, completion, and history',
      'encounter setup discovery',
      'encounter creation',
      'bulk participant and ferocity expansion',
      'planned participant removal',
      'solo setup, idempotency, confirmed heroic ability selection, Fortune, Inspiration, and persisted state',
      'Army of One two-slot combat sequencing',
      'Sole Survivor exact WP cost, condition isolation, and atomic insufficient-WP rejection',
      'safe solo-mode disable and system-granted ability cleanup',
      'solo mission, hidden waypoint isolation, and threat trigger lifecycle',
      'waypoint Search and Scavenge rolls, idempotency, usage counters, and automatic time/threat consequences',
      'sequential waypoint reveal and successful mission completion',
      'GM-only combat authorization',
      'GM context isolation',
      'OpenAPI document',
      ...(mcpUrl ? ['MCP discovery, solo abilities, solo state, encounter preparation, and session lifecycle'] : []),
    ],
  }));
} finally {
  if (mcpClient) await mcpClient.close().catch(() => {});
  if (actorId) await pool.query('DELETE FROM characters WHERE id = $1', [actorId]).catch(() => {});
  if (campaignId) await pool.query('DELETE FROM parties WHERE id = $1', [campaignId]).catch(() => {});
  if (monsterId) await pool.query('DELETE FROM monsters WHERE id = $1', [monsterId]).catch(() => {});
  if (playerUserId) await pool.query('DELETE FROM users WHERE id = $1', [playerUserId]).catch(() => {});
  await pool.end();
}
