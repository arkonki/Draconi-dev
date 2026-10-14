// What the Solo narrator is told. The model gets a short, plain summary of the game as it stands, never the full
// state: the hero, the mission and where it stands, what is known about the place, the latest events and rolls.
// Anything the hero has not found yet (hidden places, dangers there, creatures there) is left out, so the narrator
// cannot spoil it. The model is asked to describe, never to decide: dice and rules stay with the app.

export const MAX_CONTEXT_CHARS = 6000;
const ATTRIBUTES = ['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'];
const MAX_HISTORY = 8;
const MAX_MESSAGE_CHARS = 2000;
const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};
const compactJson = (value, length) => {
  try { return clip(JSON.stringify(value ?? {}), length); } catch { return ''; }
};

export function buildNarratorContext(state) {
  const lines = [];
  const hero = state?.playerCharacter;
  if (hero) {
    const conditions = (hero.conditions ?? []).map((condition) => condition.name).filter(Boolean);
    const equipped = (hero.inventory ?? []).filter((item) => item.equipped).map((item) => item.name);
    lines.push(`HERO: ${hero.name}. HP ${hero.hp?.current}/${hero.hp?.max}, WP ${hero.wp?.current}/${hero.wp?.max}. Status: ${hero.lifeStatus ?? 'active'}.`);
    if (conditions.length) lines.push(`Conditions: ${conditions.join(', ')}.`);
    if (equipped.length) lines.push(`Equipped: ${equipped.slice(0, 8).join(', ')}.`);
    if (hero.description) lines.push(`About: ${clip(hero.description, 300)}`);
  }
  const attributeNames = ATTRIBUTES.filter((name) => Number.isInteger(hero?.attributes?.[name]));
  if (attributeNames.length) lines.push(`Attributes the hero has: ${attributeNames.join(', ')}.`);
  const skillNames = Object.keys(hero?.skills ?? {}).sort();
  if (skillNames.length) lines.push(`Skills the hero has: ${skillNames.join(', ')}.`);
  const rests = Object.entries(state?.restState?.available ?? {}).filter(([, available]) => available).map(([kind]) => kind);
  if (hero) lines.push(`Rests available now: ${rests.length ? rests.join(', ') : 'none'}.`);
  if (state?.soloHeroicAbility?.name) lines.push(`Solo ability: ${state.soloHeroicAbility.name}.`);
  for (const injury of (state?.activeInjuries ?? []).slice(0, 4)) lines.push(`Injury: ${injury.name} (${clip(injury.effect, 120)}).`);

  const mission = state?.activeMission;
  if (mission) {
    lines.push('', `MISSION: ${mission.title}. Objective: ${clip(mission.objective, 300)}. Status: ${mission.status}.`);
    if (mission.discoveredClues?.length) lines.push(`Clues found: ${mission.discoveredClues.slice(0, 8).map((clue) => clip(clue, 120)).join(' | ')}`);
  } else {
    lines.push('', 'MISSION: none is under way.');
  }

  const visible = (state?.waypoints ?? []).filter((waypoint) => waypoint.status !== 'hidden');
  const visibleIds = new Set(visible.map((waypoint) => waypoint.id));
  const current = state?.currentWaypoint && visibleIds.has(state.currentWaypoint.id) ? state.currentWaypoint : null;
  if (current) {
    lines.push(`HERE: ${clip(current.title || 'An unnamed place', 100)}${current.description ? `. ${clip(current.description, 400)}` : ''} (${current.kind}, ${current.status}).`);
    for (const note of (current.notes ?? []).slice(0, 4)) lines.push(`Note: ${clip(note, 160)}`);
  }
  const others = visible.filter((waypoint) => waypoint.id !== current?.id).slice(0, 6);
  if (others.length) lines.push(`Other places known: ${others.map((waypoint) => `${clip(waypoint.title || 'unnamed', 60)} (${waypoint.status})`).join('; ')}.`);

  for (const danger of (state?.activeDangers ?? []).filter((entry) => entry.status === 'active' && visibleIds.has(entry.waypointId)).slice(0, 5)) {
    lines.push(`Danger: ${clip(danger.description, 200)}`);
  }
  for (const npc of (state?.npcs ?? []).filter((entry) => entry.status === 'active' && (!entry.waypointId || visibleIds.has(entry.waypointId))).slice(0, 6)) {
    lines.push(`Creature: ${npc.name} (${npc.template}${npc.roles?.length ? `, ${npc.roles.join('/')}` : ''})${npc.notes ? `: ${clip(npc.notes, 160)}` : ''}.`);
  }
  if (state?.activeThreat && state.activeThreat.status === 'active') {
    lines.push(`Looming threat: ${clip(state.activeThreat.description, 200)} (counter ${state.activeThreat.counter}).`);
  }
  if (state?.activeCombat) lines.push(`A fight is under way: ${state.activeCombat.name}.`);

  const rolls = (state?.latestRolls ?? []).slice(0, 3);
  if (rolls.length) {
    lines.push('', 'LATEST ROLLS (the only results that exist):');
    for (const roll of rolls) lines.push(`- ${clip(roll.purpose, 100)}: ${compactJson(roll.result, 160)}`);
  }
  const events = (state?.journal?.recentEvents ?? []).slice(-8);
  if (events.length) {
    lines.push('', 'RECENT EVENTS (oldest first):');
    for (const event of events) lines.push(`- ${event.type}: ${compactJson(event.payload, 200)}`);
  }
  if (state?.allowedNextActions?.length) lines.push('', `ACTIONS THE APP OFFERS NOW: ${state.allowedNextActions.join(', ')}.`);

  const text = lines.join('\n');
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…` : text;
}

export const NARRATOR_SYSTEM_PROMPT = [
  'You are the narrator of a solo game of the Dragonbane tabletop roleplaying game. The player is the only hero.',
  'The app handles every rule and every die. You only describe and suggest. Never roll dice, never invent a result, and never say that a check succeeded or failed unless LATEST ROLLS says so.',
  'Never change hit points, willpower, conditions, items, injuries or mission progress yourself; the player does that with the app. Use only the facts in the game summary and in the conversation, and do not reveal anything not listed there.',
  'Write in second person, present tense, in a grounded and slightly dark fantasy tone. Keep it under 150 words unless the player asks for more.',
  'End the story text with two or three short options for what the hero might do next.',
  'When the hero is about to attempt something risky, ask a genuinely uncertain question, or could rest, you may offer rule actions the player can start with one tap. Put them after the story text, on one final line that begins with ACTIONS: followed by a JSON array, at most three entries, and nothing after it. The entries are:',
  '  {"type":"check","name":"<a skill from the line Skills the hero has, or an attribute from the line Attributes the hero has>","modifier":"normal|boon|bane","label":"<what the hero attempts, under 60 characters>"}',
  '  {"type":"fortune","question":"<a yes/no question, under 120 characters>","label":"Ask Fortune"}',
  '  {"type":"rest","rest":"round|stretch|shift","label":"Rest"} (only a rest listed under Rests available now)',
  'Use a boon when the situation clearly favours the hero and a bane when it works against them, otherwise normal. Omit the ACTIONS line when nothing fits. Never mention the ACTIONS line in the story.',
  'If the player asks for something the game summary does not support, say so in a sentence and offer what is possible.',
].join('\n');

export const SUMMARY_SYSTEM_PROMPT = [
  'You keep the running record of a solo Dragonbane story. You are given the story so far (it may be empty) and the newest exchanges between the player and the narrator.',
  'Write the new story so far: what has happened, where the hero is, who and what matters (names, promises, clues, wounds, unresolved threats), in plain past tense, under 250 words.',
  'Keep every fact that still matters; drop atmosphere and repeated detail. Do not invent anything. Output only the summary.',
].join('\n');

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string' && entry.content.trim())
    .slice(-MAX_HISTORY)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_MESSAGE_CHARS) }));
}

export function buildNarratorMessages({ state, summary = '', history, message }) {
  const trimmed = String(message ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
  const story = String(summary ?? '').trim();
  return [
    { role: 'system', content: `${NARRATOR_SYSTEM_PROMPT}\n\nGAME SUMMARY\n${buildNarratorContext(state)}${story ? `\n\nTHE STORY SO FAR (what happened earlier)\n${story}` : ''}` },
    ...sanitizeHistory(history),
    { role: 'user', content: trimmed },
  ];
}

/** The messages that fold older exchanges into the running summary. */
export function buildSummaryMessages({ summary = '', turns }) {
  const transcript = turns.map((turn) => `${turn.role === 'user' ? 'PLAYER' : 'NARRATOR'}: ${String(turn.content).slice(0, MAX_MESSAGE_CHARS)}`).join('\n\n');
  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: `STORY SO FAR:\n${String(summary).trim() || '(nothing yet)'}\n\nNEWEST EXCHANGES:\n${transcript}` },
  ];
}

const FORTUNE_CATEGORIES = new Set(['yes_no', 'number', 'scale', 'power', 'quality', 'reaction']);
const MAX_ACTIONS = 3;

/**
 * Separates the story from a trailing "ACTIONS: [...]" line and keeps only proposals the game can honour: a skill the
 * hero has, a rest that is available, a short question. The model only suggests; the player starts anything.
 */
export function parseNarratorReply(rawText, state) {
  const raw = String(rawText ?? '');
  const marker = raw.lastIndexOf('ACTIONS:');
  if (marker === -1) return { text: raw.trim(), actions: [] };
  const text = raw.slice(0, marker).trim();
  let proposed;
  try {
    proposed = JSON.parse(raw.slice(marker + 'ACTIONS:'.length).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    return { text, actions: [] };
  }
  if (!Array.isArray(proposed)) return { text, actions: [] };

  const skills = new Map(Object.keys(state?.playerCharacter?.skills ?? {}).map((name) => [name.toLowerCase(), name]));
  const rests = new Set(Object.entries(state?.restState?.available ?? {}).filter(([, available]) => available).map(([kind]) => kind));
  const actions = [];
  for (const entry of proposed) {
    if (actions.length >= MAX_ACTIONS || !entry || typeof entry !== 'object') continue;
    const label = clip(entry.label, 60);
    if (entry.type === 'check') {
      const wanted = String(entry.name ?? '').trim();
      const skill = skills.get(wanted.toLowerCase());
      const attribute = ATTRIBUTES.find((name) => name === wanted.toUpperCase() && Number.isInteger(state?.playerCharacter?.attributes?.[name]));
      if (!skill && !attribute) continue;
      actions.push({
        type: 'check',
        checkType: skill ? 'skill' : 'attribute',
        name: skill ?? attribute,
        modifier: ['boon', 'bane'].includes(entry.modifier) ? entry.modifier : 'normal',
        label: label || `Roll ${skill ?? attribute}`,
      });
    } else if (entry.type === 'fortune') {
      const question = clip(entry.question, 200);
      if (!question) continue;
      actions.push({ type: 'fortune', question, category: FORTUNE_CATEGORIES.has(entry.category) ? entry.category : 'yes_no', label: label || 'Ask Fortune' });
    } else if (entry.type === 'rest') {
      if (!rests.has(entry.rest)) continue;
      actions.push({ type: 'rest', rest: entry.rest, label: label || `Take a ${entry.rest} rest` });
    }
  }
  return { text, actions };
}
