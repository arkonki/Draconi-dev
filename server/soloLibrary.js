import { pool } from './db.js';
import { HttpError } from './http.js';
import { loadCampaignAccess } from './campaignRoles.js';

// The story library: every finished Solo mission with how it ended and what it improved, plus the narrative the narrator
// had built up when the story was put away. A story can be picked up again: its telling becomes the narrator's "story so
// far", so the next mission continues from it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_NARRATIVE_CHARS = 6000;
const MAX_STORY_SUMMARY_CHARS = 2000;

async function requireAccess(user, partyId) {
  if (!UUID.test(String(partyId || ''))) throw new HttpError(400, 'partyId is required', 'INVALID_CAMPAIGN');
  const access = await loadCampaignAccess(pool, user, partyId);
  if (!access?.canWrite) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
  return access;
}

const clip = (value, length) => {
  const text = String(value ?? '').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

/** The narrator's story so far followed by its latest replies, cut to fit: what a story archive keeps of the telling. */
export function composeNarrative(summary, replies) {
  const parts = [String(summary ?? '').trim(), ...replies.map((reply) => String(reply ?? '').trim())].filter(Boolean);
  const text = parts.join('\n\n');
  return text.length > MAX_NARRATIVE_CHARS ? text.slice(text.length - MAX_NARRATIVE_CHARS) : text;
}

/** Skills that went up through the mission's advancement, as { skill, from, to }. */
export function improvementsFrom(rollResults) {
  return (Array.isArray(rollResults) ? rollResults : [])
    .filter((entry) => entry && entry.improved === true)
    .map((entry) => ({ skill: String(entry.name ?? ''), from: Number(entry.previousLevel), to: Number(entry.resultingLevel) }))
    .filter((entry) => entry.skill);
}

const OUTCOMES = new Set(['success', 'failure', 'abandoned', 'unfinished']);

/** Puts the story that is being told away: the mission's outcome and summary, and the narrator's telling of it. */
export async function archiveStory(user, { partyId, missionId = null, title, outcome = 'unfinished', summary = '' } = {}) {
  await requireAccess(user, partyId);
  const name = clip(title, 200);
  if (!name) throw new HttpError(400, 'A story needs a title', 'MISSING_TITLE');
  if (!OUTCOMES.has(outcome)) throw new HttpError(400, 'Unknown outcome', 'INVALID_OUTCOME');
  if (missionId && !UUID.test(String(missionId))) throw new HttpError(400, 'Invalid mission', 'INVALID_MISSION');
  const [{ rows: memory }, { rows: replies }] = await Promise.all([
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
    pool.query("SELECT content FROM solo_narrator_turns WHERE party_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 3", [partyId]),
  ]);
  const narrative = composeNarrative(memory[0]?.summary, replies.map((row) => row.content).reverse());
  // A story put away right after its mission ended belongs to that mission, even when the page did not name it.
  let linkedMission = missionId;
  let linkedOutcome = outcome;
  if (!linkedMission) {
    const { rows: recent } = await pool.query(
      `SELECT id, status FROM solo_missions m
       WHERE campaign_id = $1 AND status IN ('success', 'failure', 'abandoned') AND completed_at > now() - interval '12 hours'
         AND NOT EXISTS (SELECT 1 FROM solo_story_archive a WHERE a.mission_id = m.id)
       ORDER BY completed_at DESC LIMIT 1`,
      [partyId],
    );
    if (recent[0]) { linkedMission = recent[0].id; linkedOutcome = recent[0].status; }
  }
  const { rows } = await pool.query(
    `INSERT INTO solo_story_archive (party_id, mission_id, title, outcome, summary, narrative, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [partyId, linkedMission, name, linkedOutcome, clip(summary, 10_000), narrative, user.id],
  );
  return { id: rows[0].id, hasNarrative: Boolean(narrative) };
}

/** Finished stories, newest first. */
export async function listStories(user, partyId) {
  await requireAccess(user, partyId);
  const [{ rows: missions }, { rows: events }, { rows: advancements }, { rows: archived }] = await Promise.all([
    pool.query(
      `SELECT id, title, objective, status, started_at, completed_at FROM solo_missions
       WHERE campaign_id = $1 AND status IN ('success', 'failure', 'abandoned') ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT 100`,
      [partyId],
    ),
    pool.query("SELECT payload FROM campaign_events WHERE campaign_id = $1 AND type = 'solo.mission_completed' ORDER BY sequence DESC LIMIT 200", [partyId]),
    pool.query('SELECT mission_id, roll_results, cardinality(claimed_heroic_ability_ids) AS abilities FROM solo_mission_advancements WHERE campaign_id = $1', [partyId]),
    pool.query('SELECT id, mission_id, title, outcome, summary, narrative, created_at FROM solo_story_archive WHERE party_id = $1 ORDER BY created_at DESC LIMIT 100', [partyId]),
  ]);
  const summaryOf = new Map();
  for (const event of events) if (event.payload?.missionId && !summaryOf.has(event.payload.missionId)) summaryOf.set(event.payload.missionId, String(event.payload.summary ?? ''));
  const advancementOf = new Map(advancements.map((row) => [row.mission_id, row]));
  const archiveOf = new Map();
  for (const row of archived) if (row.mission_id && !archiveOf.has(row.mission_id)) archiveOf.set(row.mission_id, row);

  const stories = missions.map((mission) => {
    const archive = archiveOf.get(mission.id);
    const advancement = advancementOf.get(mission.id);
    return {
      id: `mission:${mission.id}`,
      title: mission.title,
      objective: mission.objective,
      outcome: mission.status,
      startedAt: mission.started_at,
      endedAt: mission.completed_at,
      summary: summaryOf.get(mission.id) || archive?.summary || '',
      narrative: archive?.narrative ?? '',
      improvements: improvementsFrom(advancement?.roll_results),
      newAbilities: Number(advancement?.abilities ?? 0),
      archiveId: archive?.id ?? null,
    };
  });
  // Stories put away without a mission, or whose mission has since gone, stand on their own.
  const missionIds = new Set(missions.map((mission) => mission.id));
  for (const row of archived) {
    if (row.mission_id && missionIds.has(row.mission_id)) continue;
    stories.push({ id: `archive:${row.id}`, title: row.title, objective: '', outcome: row.outcome, startedAt: null, endedAt: row.created_at, summary: row.summary, narrative: row.narrative, improvements: [], newAbilities: 0, archiveId: row.id });
  }
  stories.sort((left, right) => new Date(right.endedAt ?? 0).getTime() - new Date(left.endedAt ?? 0).getTime());
  return { stories };
}

/**
 * Picks a finished story up again: its telling (or, failing that, its summary) becomes the narrator's story so far, and
 * the conversation starts clean. Nothing in the game itself changes.
 */
export async function continueFromStory(user, { partyId, storyId } = {}) {
  await requireAccess(user, partyId);
  const [kind, id] = String(storyId ?? '').split(':');
  if (!['mission', 'archive'].includes(kind) || !UUID.test(id || '')) throw new HttpError(400, 'Choose a story', 'INVALID_STORY');
  const { stories } = await listStories(user, partyId);
  const story = stories.find((entry) => entry.id === `${kind}:${id}`);
  if (!story) throw new HttpError(404, 'That story was not found', 'STORY_NOT_FOUND');
  const base = story.narrative || story.summary;
  if (!base.trim()) throw new HttpError(409, 'That story has no telling to continue from', 'NOTHING_TO_CONTINUE');
  const text = clip(`Earlier story, “${story.title}” (${story.outcome}): ${base}`, MAX_STORY_SUMMARY_CHARS);
  await pool.query('DELETE FROM solo_narrator_turns WHERE party_id = $1', [partyId]);
  await pool.query(
    `INSERT INTO solo_narrator_memory (party_id, summary) VALUES ($1, $2)
     ON CONFLICT (party_id) DO UPDATE SET summary = $2, updated_at = now()`,
    [partyId, text],
  );
  return { story: { id: story.id, title: story.title }, summary: text };
}
