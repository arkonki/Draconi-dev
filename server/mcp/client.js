export class HelperApiClientError extends Error {
  constructor(status, error, requestId) {
    super(error?.message || `Helper API request failed with status ${status}`);
    this.status = status;
    this.code = error?.code || 'HELPER_API_ERROR';
    this.details = error?.details;
    this.requestId = requestId;
  }
}

export class HelperApiClient {
  constructor({ baseUrl, accessToken, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  async request(path, {
    method = 'GET',
    body,
    expectedRevision,
    idempotencyKey,
  } = {}) {
    const headers = {
      accept: 'application/json',
      authorization: `Bearer ${this.accessToken}`,
      'x-helper-client': 'dragonbane-mcp',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (expectedRevision !== undefined) headers['if-match'] = `"${expectedRevision}"`;
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({
      error: { code: 'INVALID_UPSTREAM_RESPONSE', message: 'Helper API returned invalid JSON.' },
    }));
    if (!response.ok) {
      throw new HelperApiClientError(response.status, payload.error, payload.meta?.requestId);
    }
    return payload;
  }

  listCampaigns({ status, limit, cursor }) {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (limit) query.set('limit', String(limit));
    if (cursor) query.set('cursor', cursor);
    return this.request(`/api/v1/campaigns?${query}`);
  }

  getCampaignState({ campaign_id, recent_event_limit }) {
    const query = new URLSearchParams();
    if (recent_event_limit) query.set('recentEventLimit', String(recent_event_limit));
    return this.request(`/api/v1/campaigns/${campaign_id}/state?${query}`);
  }

  getSoloOptions({ campaign_id }) {
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/options`);
  }

  getSoloState({ campaign_id }) {
    return this.request(`/api/v1/campaigns/${campaign_id}/solo`);
  }

  enableSoloMode(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  disableSoloMode(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo`, {
      method: 'DELETE',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  selectSoloHeroicAbility(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/heroic-ability`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  askFortune(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/fortune`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  drawInspiration(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/inspiration`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveSoloCheck(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/checks`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveSoloCheckConsequence(input) {
    const {
      campaign_id,
      source_roll_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/checks/${source_roll_id}/consequence`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  startSoloMission(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/missions`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  revealWaypoint(input) {
    const {
      campaign_id,
      waypoint_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/waypoints/${waypoint_id}/reveal`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  searchWaypoint(input) {
    const {
      campaign_id,
      waypoint_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/waypoints/${waypoint_id}/search`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  scavengeWaypoint(input) {
    const {
      campaign_id,
      waypoint_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/waypoints/${waypoint_id}/scavenge`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  takeSoloRest(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/rest`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveSoloDyingAction(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/dying/actions`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveSoloNarrativeDamage(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/damage`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveSoloInjuryAction(input) {
    const {
      campaign_id,
      injury_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/injuries/${injury_id}/actions`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  completeSoloMission(input) {
    const {
      campaign_id,
      mission_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/missions/${mission_id}/complete`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  advanceThreat(input) {
    const {
      campaign_id,
      threat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/solo/threats/${threat_id}/advance`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  getSessionHistory({ campaign_id, limit }) {
    const query = new URLSearchParams();
    if (limit) query.set('limit', String(limit));
    return this.request(`/api/v1/campaigns/${campaign_id}/sessions?${query}`);
  }

  startSession(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/sessions/start`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  completeSession(input) {
    const {
      campaign_id,
      session_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/sessions/${session_id}/complete`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  getActor({ campaign_id, actor_id }) {
    return this.request(`/api/v1/campaigns/${campaign_id}/actors/${actor_id}`);
  }

  getCombatState({ campaign_id, combat_id }) {
    const query = new URLSearchParams();
    if (combat_id) query.set('combatId', combat_id);
    return this.request(`/api/v1/campaigns/${campaign_id}/combat?${query}`);
  }

  getEncounterSetupOptions({ campaign_id, monster_search, monster_limit }) {
    const query = new URLSearchParams();
    if (monster_search) query.set('monsterSearch', monster_search);
    if (monster_limit) query.set('monsterLimit', String(monster_limit));
    return this.request(`/api/v1/campaigns/${campaign_id}/encounter-options?${query}`);
  }

  createEncounter(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/encounters`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  addEncounterParticipants(input) {
    const {
      campaign_id,
      combat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/combat/${combat_id}/participants`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  removeEncounterParticipant(input) {
    const {
      campaign_id,
      combat_id,
      actor_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(
      `/api/v1/campaigns/${campaign_id}/combat/${combat_id}/participants/${actor_id}`,
      {
        method: 'DELETE',
        body,
        expectedRevision: expected_revision,
        idempotencyKey: idempotency_key,
      },
    );
  }

  startCombat(input) {
    const {
      campaign_id,
      combat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/combat/${combat_id}/start`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  resolveGameAction(input) {
    const {
      campaign_id,
      combat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/combat/${combat_id}/actions`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  advanceCombatTurn(input) {
    const {
      campaign_id,
      combat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/combat/${combat_id}/turns/advance`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  endCombat(input) {
    const {
      campaign_id,
      combat_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/combat/${combat_id}/end`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  getRecentEvents(input) {
    const query = new URLSearchParams();
    if (input.after_sequence !== undefined) query.set('afterSequence', String(input.after_sequence));
    if (input.before_sequence !== undefined) query.set('beforeSequence', String(input.before_sequence));
    if (input.type) query.set('type', input.type);
    if (input.actor_id) query.set('actorId', input.actor_id);
    if (input.session_id) query.set('sessionId', input.session_id);
    if (input.limit) query.set('limit', String(input.limit));
    return this.request(`/api/v1/campaigns/${input.campaign_id}/events?${query}`);
  }

  applyActorChanges(input) {
    const {
      campaign_id,
      actor_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/actors/${actor_id}/changes`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }

  appendCampaignEvent(input) {
    const {
      campaign_id,
      expected_revision,
      idempotency_key,
      ...body
    } = input;
    return this.request(`/api/v1/campaigns/${campaign_id}/events`, {
      method: 'POST',
      body,
      expectedRevision: expected_revision,
      idempotencyKey: idempotency_key,
    });
  }
}
