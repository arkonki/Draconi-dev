import { plainLanguageInstruction } from './soloNarrationLanguage.js';

// "Plan a story": the player gives a one-line idea and the narrator proposes a mission for the Solo rules to run: an
// objective, where it starts, the places on the way, and a threat that closes in. The proposal is only a draft, the
// player edits it before anything is created. This file builds the request and reads the answer, nothing else.

const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

export const MAX_FORESEEN = 4;
export const MAX_UNKNOWN = 3;

export const MISSION_SYSTEM_PROMPT = [
  'You design missions for solo play of the Dragonbane tabletop roleplaying game. One hero plays alone; you plan the next story.',
  'Reply with one JSON object and nothing else, no commentary and no code fence. Its shape:',
  '{"title": "<short mission name>", "objective": "<what the hero must achieve, one or two sentences>", "opening": {"title": "<where the hero starts>", "description": "<the opening place and moment, two or three sentences>"}, "foreseen": [{"title": "<a place on the way the hero already knows of>", "description": "<one sentence>"}], "unknown_waypoints": <how many more places stay hidden until the hero reaches them, 0 to 3>, "threat": {"description": "<a danger that grows while the hero lingers>", "recurring": <true if it returns again and again, otherwise false>, "trigger_effect": "<what happens when the threat reaches its peak>"}}',
  'Give two to four foreseen places and zero to three unknown ones. Keep the mission playable in one or two sittings and fitting for one hero. Build on the story so far and the earlier missions when they are given, and never contradict them.',
  'Use only fantasy suited to Dragonbane: grounded, a little dark, no technology. Do not decide outcomes, roll dice or give the hero items.',
].join('\n');

/** The summary of the hero, the story so far and the earlier missions, as the plain text the model reads. */
export function missionContext({ hero, storySoFar, pastMissions, openThreads }) {
  const lines = [];
  if (hero) lines.push(`HERO: ${hero.name}${hero.description ? ` (${clip(hero.description, 300)})` : ''}`);
  if (String(storySoFar ?? '').trim()) lines.push('', 'THE STORY SO FAR', clip(storySoFar, 1500));
  if (openThreads?.length) lines.push('', `OPEN THREADS: ${openThreads.slice(0, 8).map((thread) => clip(thread, 160)).join(' | ')}`);
  if (pastMissions?.length) {
    lines.push('', 'EARLIER MISSIONS (newest first):');
    for (const mission of pastMissions.slice(0, 5)) lines.push(`- ${clip(mission.title, 100)} (${mission.outcome}): ${clip(mission.summary || mission.objective, 300)}`);
  }
  return lines.join('\n');
}

export function buildMissionMessages({ idea, context, language = 'en', glossary = null }) {
  const instruction = plainLanguageInstruction(language, glossary);
  const system = [
    MISSION_SYSTEM_PROMPT,
    instruction ? `${instruction} Write every text value of the JSON in that language, but keep the JSON keys exactly as shown in English.` : '',
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${context ? `${context}\n\n` : ''}THE PLAYER'S IDEA FOR THE NEXT STORY\n${clip(idea, 600) || '(none: propose something that follows from the story so far)'}` },
  ];
}

/** Every complete top-level JSON object in the text, in order, tolerating a code fence or words around them. */
function* objectsIn(text) {
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf('{', from);
    if (start === -1) return;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    if (end === -1) return;
    try { yield JSON.parse(text.slice(start, end + 1)); } catch { /* not JSON: move on */ }
    from = end + 1;
  }
}

/**
 * Turns the model's answer into a mission the start form can take, with every field cut to what the Solo rules accept.
 * Returns null when there is no usable mission (no title, objective or opening place).
 */
export function parseMissionProposal(text) {
  for (const raw of objectsIn(String(text ?? ''))) {
    const mission = missionFrom(raw);
    if (mission) return mission;
  }
  return null;
}

function missionFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clip(raw.title, 200);
  const objective = clip(raw.objective, 2000);
  const openingTitle = clip(raw.opening?.title, 200);
  const openingDescription = clip(raw.opening?.description, 2000);
  if (!title || !objective || !openingTitle || !openingDescription) return null;
  const foreseen = (Array.isArray(raw.foreseen) ? raw.foreseen : [])
    .map((entry) => ({ title: clip(entry?.title, 200), description: clip(entry?.description, 1000) }))
    .filter((entry) => entry.title)
    .slice(0, MAX_FORESEEN);
  const unknown = Math.min(MAX_UNKNOWN, Math.max(0, Math.round(Number(raw.unknown_waypoints) || 0)));
  const threatDescription = clip(raw.threat?.description, 1000);
  if (!threatDescription) return null;
  return {
    title,
    objective,
    opening: { title: openingTitle, description: openingDescription },
    foreseen,
    unknownWaypoints: unknown,
    threat: { description: threatDescription, recurring: raw.threat?.recurring === true, triggerEffect: clip(raw.threat?.trigger_effect, 1000) },
  };
}
