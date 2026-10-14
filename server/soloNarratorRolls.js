// How the Solo narrator is told about dice. An AI assistant connected over MCP gets the full structured result of every
// roll back from the tool that rolled it. The narrator rolls nothing, so it learns the same results from here: one plain
// line per roll with what was rolled, against what, and how it came out, and a note for a failed check that still has to
// be settled (pushed, or paid for with a consequence). Clipped raw JSON is not good enough: the outcome comes late in it.

const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const OUTCOMES = {
  dragon: 'DRAGON (a critical success)',
  success: 'SUCCESS',
  failure: 'FAILURE',
  demon: 'DEMON (a critical failure)',
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** "rolled 7 (kept the lower of 7 and 15 for a boon) against 12" for a D20 check block. */
function checkSentence(check, fallbackTarget, fallbackModifier) {
  if (!isObject(check)) return '';
  const dice = Array.isArray(check.dice) ? check.dice : [];
  const kept = Number.isFinite(Number(check.roll)) ? Number(check.roll) : dice[0];
  const modifier = check.modifier ?? fallbackModifier ?? 'normal';
  const target = check.target ?? fallbackTarget;
  const how = modifier === 'boon' ? `, the lower of ${dice.join(' and ')} because of a boon`
    : modifier === 'bane' ? `, the higher of ${dice.join(' and ')} because of a bane`
      : '';
  return `rolled ${kept}${how}${target === undefined || target === null ? '' : ` against ${target}`} → ${OUTCOMES[check.outcome] ?? String(check.outcome ?? 'no outcome').toUpperCase()}`;
}

/** The roll ids that were pushed: the push replaces the roll it came from. */
const pushedIds = (rolls) => new Set(rolls.map((roll) => roll.previousRollId).filter(Boolean));

/** A failed (or Demon) check that nobody has settled yet: the player may push it once, or take a consequence. */
export function unresolvedChecks(rolls) {
  const pushed = pushedIds(rolls);
  return rolls.filter((roll) => ['solo_check', 'solo_check_push'].includes(roll.result?.action)
    && roll.result?.requiresFailForward === true
    && !roll.consequence
    && !pushed.has(roll.id));
}

/** Of those, the ones that can still be pushed: an ordinary failure that is not itself a push. */
export function pushableChecks(rolls) {
  const pushed = pushedIds(rolls);
  return rolls.filter((roll) => roll.result?.action === 'solo_check'
    && roll.result?.outcome === 'failure'
    && !roll.previousRollId
    && !pushed.has(roll.id)
    && !roll.consequence);
}

/** One roll in a sentence or two, whatever kind it is. */
export function describeRoll(roll, { pushed = new Set() } = {}) {
  const result = isObject(roll?.result) ? roll.result : {};
  const why = result.context ? ` (${clip(result.context, 80)})` : '';
  const action = result.action;

  if (action === 'solo_check' || action === 'solo_check_push') {
    const label = `${result.checkName ?? roll.purpose} ${result.checkType === 'attribute' ? 'attribute' : 'skill'} check`;
    const effect = result.criticalEffect?.label ? ` Critical effect: ${clip(result.criticalEffect.label, 100)}.` : '';
    const mark = result.advancementMark?.added ? ` ${result.checkName} was marked for advancement.` : '';
    let status = '';
    if (pushed.has(roll.id)) status = ' It was then pushed, so the pushed roll counts instead.';
    else if (roll.consequence) status = ` Consequence taken: ${clip(roll.consequence.selectedDescription || roll.consequence.appliedSummary, 160)}.`;
    else if (result.requiresFailForward === true) status = ' Not settled yet: the player can push it once (only a plain failure, never a Demon) or take a consequence.';
    const lead = action === 'solo_check_push' ? `Pushed ${label}${result.condition ? ` (taking ${result.condition})` : ''}` : label[0].toUpperCase() + label.slice(1);
    return `${lead}${why}: ${checkSentence(result.check, result.target, result.modifier)}.${effect}${mark}${status}`;
  }
  if (action === 'solo_check_consequence_choice') {
    return `A consequence was chosen by a D6 (${roll.keptValues?.[0] ?? '?'}): ${clip(result.selectedDescription, 160)}.`;
  }
  if (action === 'search') {
    const found = Array.isArray(result.findingChoices) ? result.findingChoices.flat().map((entry) => clip(typeof entry === 'string' ? entry : entry?.label ?? entry?.description ?? JSON.stringify(entry), 80)).slice(0, 3) : [];
    return `Search${why}: ${result.check ? `${result.skill ?? 'Spot Hidden'} ${checkSentence(result.check)}` : 'no roll needed'}.${found.length ? ` Findings: ${found.join('; ')}.` : ''}${result.requiresChoice ? ' A Dragon: the player chooses what is found.' : ''}`;
  }
  if (action === 'scavenge') {
    const found = Array.isArray(result.findings) ? result.findings.map((entry) => clip(typeof entry === 'string' ? entry : entry?.label ?? entry?.description ?? JSON.stringify(entry), 100)).slice(0, 3) : [];
    return `Scavenge${why}: ${found.length ? found.join('; ') : 'found nothing of note'}.`;
  }
  if (action === 'solo_rest') {
    return `${result.restType ?? 'A'} rest: recovered ${result.hpRecoveryApplied ?? 0} HP and ${result.wpRecoveryApplied ?? 0} WP${result.conditionCleared ? `, and the condition ${result.conditionCleared} is gone` : ''}.`;
  }
  if (action === 'narrative_damage') {
    return `Narrative damage${why}: ${result.severity ?? 'unknown'} severity, ${result.appliedDamage ?? result.damage ?? '?'} damage taken${result.instantDeath ? '. The hero died.' : result.damageWhileDying ? ' while dying.' : '.'}`;
  }
  if (action === 'severe_injury') return `A severe injury: ${clip(result.injury?.name ?? roll.purpose, 80)}${result.injury?.effect ? ` (${clip(result.injury.effect, 100)})` : ''}.`;
  if (action === 'medical_care') return `Medical care: ${clip(roll.purpose, 100)}.`;
  if (action === 'solo_advancement') {
    const improved = (result.results ?? []).filter((entry) => entry.improved).map((entry) => `${entry.name} to ${entry.resultingLevel}`);
    return `Advancement: ${improved.length ? `improved ${improved.join(', ')}` : 'no skill improved'}.`;
  }
  if (action === 'solo_waypoints_added') return `${result.count ?? 'Some'} ${result.kind ?? 'hidden'} waypoint(s) were added to the route.`;
  if (action === 'solo_return_started') return `The way back began (${result.routeType ?? 'return'})${result.check ? `: ${checkSentence(result.check)}` : ''}.`;

  // Fortune and Inspiration record no `action`, only their own fields.
  if (typeof result.question === 'string') {
    return `Fortune, "${clip(result.question, 100)}": ${clip(typeof result.value === 'object' ? JSON.stringify(result.value) : result.value, 80)}${result.extreme ? ' (extreme)' : ''}${result.tilt && result.tilt !== 'even' ? `, tilted ${result.tilt}` : ''}.`;
  }
  if (typeof result.phrase === 'string') return `Inspiration${why}: ${clip(result.phrase, 160)}.`;
  if (action === 'trusted_roll') return `${clip(roll.purpose, 100)}: ${clip(JSON.stringify(result), 160)}.`;
  return `${clip(roll.purpose, 100)}: ${clip(JSON.stringify(result), 200)}`;
}

/** The "LATEST ROLLS" section, newest first, and a heading for anything still waiting on the player. */
export function rollLines(rolls, { limit = 5 } = {}) {
  const list = Array.isArray(rolls) ? rolls : [];
  if (!list.length) return [];
  const pushed = pushedIds(list);
  const lines = ['', 'LATEST ROLLS (newest first; these are the only results that exist):'];
  for (const roll of list.slice(0, limit)) lines.push(`- ${describeRoll(roll, { pushed })}`);
  const waiting = unresolvedChecks(list);
  if (waiting.length) {
    const canPush = pushableChecks(list).some((roll) => roll.id === waiting[0].id);
    lines.push('', `AWAITING THE PLAYER: the last failed check has no outcome in the story yet. Narrate the moment it goes wrong, then let the player ${canPush ? 'push it once or ' : ''}take a consequence with the app; do not decide the consequence yourself.`);
  }
  return lines;
}

const EVENT_NOTES = {
  'solo.check_resolved': (payload) => `${payload.checkName} check: ${OUTCOMES[payload.outcome] ?? payload.outcome}`,
};

/** One campaign event in a few words. Roll events are left to the roll lines, which say more. */
export function describeEvent(event, rollIds = new Set()) {
  if (event.payload?.rollId && rollIds.has(event.payload.rollId)) return null;
  const note = EVENT_NOTES[event.type];
  const source = event.sourceType === 'chatgpt' ? ' (from an AI assistant)' : '';
  if (note) return `${event.type}${source}: ${clip(note(event.payload ?? {}), 160)}`;
  // Strip identifiers and bookkeeping, which say nothing about the story and push the useful part out of the clip.
  const payload = isObject(event.payload) ? Object.fromEntries(Object.entries(event.payload).filter(([key]) => !/(^|[a-z])Id$|^id$|Ids$|^reason$|idempotency|^dice$|^keptIndices$/.test(key))) : event.payload;
  return `${event.type}${source}: ${clip(JSON.stringify(payload ?? {}), 200)}`;
}
