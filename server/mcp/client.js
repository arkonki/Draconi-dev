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

  getActor({ campaign_id, actor_id }) {
    return this.request(`/api/v1/campaigns/${campaign_id}/actors/${actor_id}`);
  }

  getCombatState({ campaign_id, combat_id }) {
    const query = new URLSearchParams();
    if (combat_id) query.set('combatId', combat_id);
    return this.request(`/api/v1/campaigns/${campaign_id}/combat?${query}`);
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

