// What the Solo narrator is told. The model gets a short, plain summary of the game as it stands, never the full
// state: the hero, the mission and where it stands, what is known about the place, the latest events and rolls.
// Anything the hero has not found yet (hidden places, dangers there, creatures there) is left out, so the narrator
// cannot spoil it. The model is asked to describe, never to decide: dice and rules stay with the app.

export const MAX_CONTEXT_CHARS = 6000;
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
  'End with two or three short options for what the hero might do next. When an option needs the rules, name the app action it uses, chosen from "ACTIONS THE APP OFFERS NOW" when that list is given.',
  'If the player asks for something the game summary does not support, say so in a sentence and offer what is possible.',
].join('\n');

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string' && entry.content.trim())
    .slice(-MAX_HISTORY)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_MESSAGE_CHARS) }));
}

export function buildNarratorMessages({ state, history, message }) {
  const trimmed = String(message ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
  return [
    { role: 'system', content: `${NARRATOR_SYSTEM_PROMPT}\n\nGAME SUMMARY\n${buildNarratorContext(state)}` },
    ...sanitizeHistory(history),
    { role: 'user', content: trimmed },
  ];
}
