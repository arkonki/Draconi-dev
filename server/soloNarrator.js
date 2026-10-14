import { pool } from './db.js';
import { HttpError } from './http.js';
import { loadCampaignAccess } from './campaignRoles.js';
import { callModel } from './aiSettings.js';
import { getSoloState } from './helper/service.js';
import { buildNarratorMessages } from './soloNarratorContext.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One turn with the Solo narrator: the player says what they do, the narrator answers using the current game state. */
export async function narrateSolo(user, { partyId, message, history } = {}) {
  if (!UUID.test(String(partyId || ''))) throw new HttpError(400, 'partyId is required', 'INVALID_CAMPAIGN');
  if (!String(message ?? '').trim()) throw new HttpError(400, 'Say what the hero does or asks', 'EMPTY_MESSAGE');
  const access = await loadCampaignAccess(pool, user, partyId);
  if (!access?.canWrite) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
  const state = await getSoloState(user, partyId);
  if (!state?.solo?.enabled) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  const result = await callModel(user, {
    messages: buildNarratorMessages({ state, history, message }),
    purpose: 'solo',
    partyId,
    temperature: 0.8,
    maxTokens: 700,
  });
  return { text: result.text, model: result.model, usage: result.usage };
}

/** A one-off generation for the Story Helper. The prompt is built by the page; the key and the call stay on the server. */
export async function generateStory(user, { prompt, partyId } = {}) {
  const text = String(prompt ?? '').trim();
  if (!text) throw new HttpError(400, 'prompt is required', 'EMPTY_PROMPT');
  if (text.length > 30_000) throw new HttpError(400, 'The prompt is too long', 'PROMPT_TOO_LONG');
  let campaign = null;
  if (partyId) {
    if (!UUID.test(String(partyId))) throw new HttpError(400, 'Invalid campaign', 'INVALID_CAMPAIGN');
    const access = await loadCampaignAccess(pool, user, partyId);
    if (!access?.isGm) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
    campaign = partyId;
  }
  const result = await callModel(user, { messages: [{ role: 'user', content: text }], purpose: 'story', partyId: campaign, temperature: 0.7, maxTokens: 2500 });
  return { text: result.text, model: result.model, usage: result.usage };
}
