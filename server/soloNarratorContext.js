// What the Solo narrator is told. The model gets a short, plain summary of the game as it stands, never the full
// state: the hero, the mission and where it stands, what is known about the place, the latest events and rolls.
// Anything the hero has not found yet (hidden places, dangers there, creatures there) is left out, so the narrator
// cannot spoil it. The model is asked to describe, never to decide: dice and rules stay with the app.

import { languageInstruction, plainLanguageInstruction } from './soloNarrationLanguage.js';
import { describeEvent, rollLines } from './soloNarratorRolls.js';

export const MAX_CONTEXT_CHARS = 9000;
const ATTRIBUTES = ['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'];
const MAX_HISTORY = 8;
const MAX_MESSAGE_CHARS = 2000;
const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const GRIPS = { '1H': 'one hand', '2H': 'two hands' };

/** One piece of gear in a few words: what it is and the numbers that matter for it. */
function gearName(item) {
  const facts = [];
  if (item.damage) facts.push(`damage ${item.damage}`);
  if (item.range && String(item.range) !== '0') facts.push(`range ${item.range}`);
  if (item.grip) facts.push(GRIPS[item.grip] ?? String(item.grip));
  if (item.armorRating !== null && item.armorRating !== undefined && item.armorRating !== '') facts.push(`armor ${item.armorRating}`);
  if (Array.isArray(item.features) && item.features.length) facts.push(item.features.slice(0, 3).map((feature) => String(feature).toLowerCase()).join('/'));
  if (item.durability) facts.push(`durability ${item.durability}`);
  if (item.state?.broken) facts.push('BROKEN');
  return `${clip(item.name, 60)}${facts.length ? ` (${facts.join(', ')})` : ''}`;
}

/**
 * What the hero actually wears and holds right now, so the narrator describes the right weapon and armor and does not
 * invent gear. Built fresh every turn, which is how a change of gear between turns reaches the story.
 */
function gearLines(hero) {
  const lines = [];
  const weapons = (hero.weapons ?? []).filter(Boolean);
  lines.push(weapons.length
    ? `Weapons in hand: ${weapons.slice(0, 4).map(gearName).join('; ')}.`
    : 'Weapons in hand: none. The hero is unarmed.');
  const worn = [hero.bodyArmor, hero.helmet].filter(Boolean);
  lines.push(worn.length ? `Armor worn: ${worn.map(gearName).join('; ')}.` : 'Armor worn: none.');
  if (hero.shield) lines.push(`Shield: ${gearName(hero.shield)}.`);
  const others = (hero.inventory ?? []).filter((item) => item.equipped).map((item) => clip(item.name, 60));
  const lit = (hero.heldItems ?? []).filter((item) => item.state?.isLit).map((item) => clip(item.name, 60));
  if (others.length) lines.push(`Other equipped: ${others.slice(0, 6).join(', ')}.`);
  if (lit.length) lines.push(`Lit: ${lit.join(', ')}.`);
  return lines;
}

/** Scene entries the hero may know about: anything not marked as hidden from the player. */
const knownEntries = (entries) => (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.visibility !== 'gm');

/**
 * `extras.checkpoint` is the latest saved checkpoint, whoever made it. The state itself carries the scene, the open
 * threads, the session summaries and the event log, which are also shared with assistants connected over MCP.
 */
export function buildNarratorContext(state, extras = {}) {
  const lines = [];
  const hero = state?.playerCharacter;
  if (hero) {
    const conditions = (hero.conditions ?? []).map((condition) => condition.name).filter(Boolean);
    lines.push(`HERO: ${hero.name}. HP ${hero.hp?.current}/${hero.hp?.max}, WP ${hero.wp?.current}/${hero.wp?.max}. Status: ${hero.lifeStatus ?? 'active'}.`);
    if (conditions.length) lines.push(`Conditions: ${conditions.join(', ')}.`);
    lines.push(...gearLines(hero));
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

  const scene = state?.journal?.currentScene ?? state?.currentScene;
  if (scene && (scene.location || scene.description || scene.situation)) {
    lines.push('', `SCENE: ${clip(scene.location || 'unnamed', 120)}${scene.description ? `. ${clip(scene.description, 400)}` : ''}${scene.situation ? ` Situation: ${clip(scene.situation, 300)}` : ''}`);
    const exits = knownEntries(scene.exits).slice(0, 6).map((exit) => `${clip(exit.name, 60)}${exit.status && exit.status !== 'unknown' ? ` (${exit.status})` : ''}`);
    if (exits.length) lines.push(`Exits: ${exits.join('; ')}.`);
    for (const danger of knownEntries(scene.dangers).filter((entry) => entry.status !== 'resolved').slice(0, 4)) lines.push(`Scene danger: ${clip(danger.description, 160)}`);
  }
  const threads = (state?.journal?.openThreads ?? []).map((thread) => clip(typeof thread === 'string' ? thread : JSON.stringify(thread), 160)).filter(Boolean);
  if (threads.length) lines.push(`OPEN THREADS: ${threads.slice(0, 8).join(' | ')}`);

  const checkpoint = extras.checkpoint;
  if (checkpoint?.summary) {
    lines.push('', `LATEST CHECKPOINT${checkpoint.createdAt ? ` (${new Date(checkpoint.createdAt).toISOString().slice(0, 10)})` : ''}: ${clip(checkpoint.summary, 900)}`);
  }
  const earlier = (state?.journal?.sessions ?? []).filter((session) => session.status === 'completed' && session.summary).slice(0, 3).reverse();
  if (earlier.length) {
    lines.push('', 'EARLIER SESSIONS (oldest first):');
    for (const session of earlier) lines.push(`- ${clip(session.title, 80)}: ${clip(session.summary, 500)}`);
  }

  const rolls = state?.latestRolls ?? [];
  lines.push(...rollLines(rolls));
  const shownRollIds = new Set(rolls.slice(0, 5).map((roll) => roll.id));
  // The log lists the newest first, from every source. The narrator's own narration is already in the conversation, and
  // a roll the roll lines already describe is not repeated.
  const events = (state?.journal?.recentEvents ?? [])
    .filter((event) => event.type !== 'narration.recorded' || event.payload?.source !== 'narrator')
    .map((event) => describeEvent(event, shownRollIds))
    .filter(Boolean)
    .slice(0, 8)
    .reverse();
  if (events.length) {
    lines.push('', 'RECENT EVENTS (oldest first):');
    for (const event of events) lines.push(`- ${event}`);
  }
  if (state?.allowedNextActions?.length) lines.push('', `ACTIONS THE APP OFFERS NOW: ${state.allowedNextActions.join(', ')}.`);

  const text = lines.join('\n');
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…` : text;
}

const PROMPT_INTRO = [
  'You are the narrator of a solo game of the Dragonbane tabletop roleplaying game. The player is the only hero.',
];

const PROMPT_GEAR = [
  'The lines Weapons in hand, Armor worn and Shield list what the hero has right now, and they override anything said earlier in the conversation or in the story so far. Describe only those weapons and that armor. Never give the hero a weapon or armor that is not listed, and if the hero is unarmed or unarmored, say so when it matters. If the player reaches for gear the hero does not have, say so and offer what is at hand. Let the gear shape what happens: a heavy weapon swings slowly, a bow needs room, armor turns blows aside and clanks when the hero tries to sneak, a broken weapon will not hold. When the hero fights, suggest a check with the skill that fits the weapon in hand (from Skills the hero has).',
];

const PROMPT_STYLE = [
  'Write in second person, present tense, in a grounded and slightly dark fantasy tone. Keep it under 150 words unless the player asks for more.',
  'End the story text with two or three short options for what the hero might do next.',
  'Lines in square brackets that begin with App: are notes from the app about what has already been done. Never write such a line yourself.',
];

const SUGGEST_RULES = [
  'The app handles every rule and every die. You only describe and suggest. Never roll dice, never invent a result, and never say that a check succeeded or failed unless LATEST ROLLS says so.',
    'Never change hit points, willpower, conditions, items, injuries or mission progress yourself; the player does that with the app. Use only the facts in the game summary and in the conversation, and do not reveal anything not listed there.',
];

const SUGGEST_ACTIONS = [
  'When the hero is about to attempt something risky, ask a genuinely uncertain question, or could rest, you may offer rule actions the player can start with one tap. Put them after the story text, on one final line that begins with ACTIONS: followed by a JSON array, at most three entries, and nothing after it. The entries are:',
  '  {"type":"check","name":"<a skill from the line Skills the hero has, or an attribute from the line Attributes the hero has>","modifier":"normal|boon|bane","label":"<what the hero attempts, under 60 characters>"}',
  '  {"type":"fortune","question":"<a yes/no question, under 120 characters>","label":"Ask Fortune"}',
  '  {"type":"rest","rest":"round|stretch|shift","label":"Rest"} (only a rest listed under Rests available now)',
  '  {"type":"search","context":"<what is searched, under 120 characters>","label":"Search the room"} (only when ACTIONS THE APP OFFERS NOW lists search_waypoint)',
  '  {"type":"scavenge","context":"<what is scavenged, under 120 characters>","label":"Scavenge the camp"} (only when it lists scavenge_waypoint)',
  '  {"type":"npc","name":"<creature name>","template":"minion|boss","roles":["melee","ranged","sneaky","magic"],"notes":"<short description>","label":"Face the wolf"} (one or two roles; only when it lists generate_solo_npc)',
  '  {"type":"reveal","title":"<name of the next place>","description":"<what the hero now sees, only facts the hero can know>","label":"Move on"} (only when it lists reveal_waypoint)',
  '  {"type":"push","label":"Push the roll"} (only when ACTIONS THE APP OFFERS NOW lists push_solo_check: the last check failed and may be pushed once)',
  '  {"type":"consequence","label":"Take a consequence"} (only when it lists resolve_solo_check_consequence: a failed check is still unsettled)',
  '  {"type":"inspiration","context":"<what the hero needs an idea for, under 120 characters>","label":"Draw inspiration"} (when the story needs an unexpected idea)',
  '  {"type":"damage","context":"<what hurts the hero, under 120 characters>","label":"Take the fall"} (only when it lists resolve_solo_narrative_damage: harm outside a fight, such as a fall, fire or a trap; the app decides how bad it is)',
  '  {"type":"threat","amount":1,"label":"The tide rises"} (only when it lists advance_threat: time passes or the hero lingers while the mission threat looms; amount is 1, or 2 for something dire)',
  '  {"type":"leave","label":"Leave the site"} (only when it lists begin_solo_return: the objective is reached and the hero heads back)',
  '  {"type":"dying","label":"Fight to live"} (only when it lists resolve_solo_dying_action: the hero is at 0 HP)',
  '  {"type":"scene","location":"<where the hero is now>","description":"<the place in a sentence or two>","situation":"<what is going on>","threads":["<every thread still open>"],"label":"Update the scene"} (offer it only when the story has clearly moved to a new place or the open threads changed; threads is the complete list still open, keeping the existing unresolved ones; at most one scene action)',
];

const SUGGEST_TAIL = [
    'LATEST ROLLS is the record of every die the app has rolled for the hero, written out in plain words: what was tried, what came up, the target and the outcome. A skill check is a D20 roll that must be equal to or under the skill value. A Dragon (a 1) is an exceptional success, a Demon (a 20) is a disaster that cannot be pushed. Narrate the outcome exactly as written: a SUCCESS happens, a FAILURE costs the hero something and the story moves on with a complication instead of stalling, and nothing counts as rolled that is not listed. If AWAITING THE PLAYER is shown, stop at the moment of failure and let the player settle it; do not describe the consequence or what happens next. When the player says what they attempt and it is risky and uncertain, offer the check with an ACTIONS line rather than deciding the result yourself, and do not narrate past the roll.',
    'Use a boon when the situation clearly favours the hero and a bane when it works against them, otherwise normal. Omit the ACTIONS line when nothing fits. Never mention the ACTIONS line in the story.',
    'If the player asks for something the game summary does not support, say so in a sentence and offer what is possible.',
];

/** The narrator that only describes and suggests: rule actions are offered as buttons the player taps. */
export const NARRATOR_SYSTEM_PROMPT = [...PROMPT_INTRO, ...SUGGEST_RULES.slice(0, 1), ...PROMPT_GEAR, ...SUGGEST_RULES.slice(1), ...PROMPT_STYLE, ...SUGGEST_ACTIONS, ...SUGGEST_TAIL].join('\n');

const TOOL_RULES = [
  'The app handles every rule and every die, and you reach it through tools. You describe the story and call tools. Never roll dice yourself, never invent a result, and never say that a check succeeded or failed unless a tool result or LATEST ROLLS says so.',
  'Never claim to have changed hit points, willpower, conditions, items, injuries, the threat or mission progress unless a tool did it and said so. Use only the facts in the game summary, the conversation and tool results, and do not reveal anything not listed there.',
];

const TOOL_USE = [
  'You have tools for the same game operations an AI game master has. Use them instead of deciding outcomes yourself: roll_check when the hero attempts something risky and uncertain, ask_fortune for an uncertain fact, get_game_state when you are unsure what is true now. Narrate a result exactly as the tool returns it, in the same reply.',
  'Tools that change the hero or the story (damage, rests, searching, creatures, the threat, time, moving on, the scene) may have to be approved by the player first. When you call one, write a short lead-in and stop: the story continues after the player decides, and you must not narrate its outcome in advance. If the player declines, accept it, do not say it happened, and offer something else. Call at most three tools in a reply, and only ones the story needs.',
  'After a failed check, narrate the moment it goes wrong, then offer to push it (push_check, once, only a plain failure, never a Demon) or settle it with a consequence you propose (settle_failed_check) that moves the story forward. Do not decide a consequence on your own.',
  'Concluding or abandoning a mission, ending the session, starting a mission and combat are not tools: the player does them in the app. You may say that it is time.',
];

const TOOL_TAIL = [
  SUGGEST_TAIL[0]
    .replace(' When the player says what they attempt and it is risky and uncertain, offer the check with an ACTIONS line rather than deciding the result yourself, and do not narrate past the roll.', ' When the player says what they attempt and it is risky and uncertain, roll it with roll_check rather than deciding the result yourself.')
    .replace('If AWAITING THE PLAYER is shown, stop at the moment of failure and let the player settle it; do not describe the consequence or what happens next.', 'If AWAITING THE PLAYER is shown, narrate the moment of failure and let the player settle it with push_check or settle_failed_check; do not describe the consequence or what happens next.'),
  'Use a boon when the situation clearly favours the hero and a bane when it works against them, otherwise normal. Never mention tools or their names in the story.',
  SUGGEST_TAIL[2],
];

/** The narrator that can act: it calls tools, and the campaign decides which of them need the player's approval. */
export const NARRATOR_TOOLS_PROMPT = [...PROMPT_INTRO, TOOL_RULES[0], ...PROMPT_GEAR, TOOL_RULES[1], ...PROMPT_STYLE, ...TOOL_USE, ...TOOL_TAIL].join('\n');


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

/**
 * The conversation sent to the model, ordered so as much of the start as possible is identical from one turn to the next,
 * which lets providers that cache prompts reuse it at a discount: the fixed instructions first, then the story so far
 * (which changes only now and then), then the conversation (which only grows), and last the current game state and
 * what the player said (which change every turn).
 */
export function buildNarratorMessages({ state, checkpoint = null, summary = '', history, message, language = 'en', glossary = null, withTools = false }) {
  const trimmed = String(message ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
  const story = String(summary ?? '').trim();
  const instruction = languageInstruction(language, glossary);
  return [
    { role: 'system', content: `${withTools ? NARRATOR_TOOLS_PROMPT : NARRATOR_SYSTEM_PROMPT}${instruction ? `\n${instruction}` : ''}` },
    ...(story ? [{ role: 'system', content: `THE STORY SO FAR (what happened earlier)\n${story}` }] : []),
    ...sanitizeHistory(history),
    { role: 'user', content: `CURRENT GAME STATE\n${buildNarratorContext(state, { checkpoint })}\n\nWHAT THE PLAYER SAYS OR DOES NOW\n${trimmed}` },
  ];
}

/** The messages that fold older exchanges into the running summary. */
export function buildSummaryMessages({ summary = '', turns, language = 'en', glossary = null }) {
  const transcript = turns.map((turn) => `${turn.role === 'user' ? 'PLAYER' : 'NARRATOR'}: ${String(turn.content).slice(0, MAX_MESSAGE_CHARS)}`).join('\n\n');
  return [
    { role: 'system', content: [SUMMARY_SYSTEM_PROMPT, plainLanguageInstruction(language, glossary)].filter(Boolean).join('\n') },
    { role: 'user', content: `STORY SO FAR:\n${String(summary).trim() || '(nothing yet)'}\n\nNEWEST EXCHANGES:\n${transcript}` },
  ];
}

const FORTUNE_CATEGORIES = new Set(['yes_no', 'number', 'scale', 'power', 'quality', 'reaction']);
const MAX_ACTIONS = 3;
const NPC_ROLES = new Set(['melee', 'ranged', 'sneaky', 'magic']);

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
  const offered = new Set(state?.allowedNextActions ?? []);
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
    } else if (entry.type === 'search' || entry.type === 'scavenge') {
      if (!offered.has(`${entry.type}_waypoint`)) continue;
      actions.push({ type: entry.type, context: clip(entry.context, 200), label: label || (entry.type === 'search' ? 'Search here' : 'Scavenge here') });
    } else if (entry.type === 'npc') {
      const name = clip(entry.name, 200);
      if (!name || !offered.has('generate_solo_npc')) continue;
      const roles = [...new Set((Array.isArray(entry.roles) ? entry.roles : []).filter((role) => NPC_ROLES.has(role)))].slice(0, 2);
      actions.push({ type: 'npc', name, template: entry.template === 'boss' ? 'boss' : 'minion', roles: roles.length ? roles : ['melee'], notes: clip(entry.notes, 500), label: label || `Face ${name}` });
    } else if (entry.type === 'reveal') {
      if (!offered.has('reveal_waypoint')) continue;
      actions.push({ type: 'reveal', title: clip(entry.title, 200), description: clip(entry.description, 1000), label: label || 'Move on' });
    } else if (entry.type === 'push') {
      if (!offered.has('push_solo_check')) continue;
      actions.push({ type: 'push', label: label || 'Push the roll' });
    } else if (entry.type === 'consequence') {
      if (!offered.has('resolve_solo_check_consequence')) continue;
      actions.push({ type: 'consequence', label: label || 'Take a consequence' });
    } else if (entry.type === 'inspiration') {
      if (!offered.has('draw_inspiration')) continue;
      actions.push({ type: 'inspiration', context: clip(entry.context, 200), label: label || 'Draw inspiration' });
    } else if (entry.type === 'damage') {
      if (!offered.has('resolve_solo_narrative_damage')) continue;
      actions.push({ type: 'damage', context: clip(entry.context, 200), label: label || 'Take the damage' });
    } else if (entry.type === 'threat') {
      if (!offered.has('advance_threat')) continue;
      actions.push({ type: 'threat', amount: Number(entry.amount) === 2 ? 2 : 1, label: label || 'Time runs out' });
    } else if (entry.type === 'leave') {
      if (!offered.has('begin_solo_return')) continue;
      actions.push({ type: 'leave', label: label || 'Leave the site' });
    } else if (entry.type === 'dying') {
      if (!offered.has('resolve_solo_dying_action')) continue;
      actions.push({ type: 'dying', label: label || 'Fight to live' });
    } else if (entry.type === 'scene') {
      if (actions.some((action) => action.type === 'scene')) continue;
      const location = clip(entry.location, 500);
      const description = clip(entry.description, 2000);
      if (!location && !description) continue;
      const threads = (Array.isArray(entry.threads) ? entry.threads : []).map((thread) => clip(thread, 200)).filter(Boolean).slice(0, 10);
      actions.push({ type: 'scene', location, description, situation: clip(entry.situation, 1000), threads, label: label || 'Update the scene' });
    }
  }
  return { text, actions };
}
