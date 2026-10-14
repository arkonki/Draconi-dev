// The tools the Solo narrator can call: the same Helper operations an AI assistant connected over MCP has for solo play,
// reached through the same service functions, so the same rules, checks and event log apply. Dice are always rolled by
// the server; the model only chooses what to attempt and never supplies a result.
//
// Three tiers:
//   auto     reading the game and rolling dice (a check, Fortune, Inspiration): runs at once. The server owns the dice
//            and nothing in the story is decided by the model.
//   approve  anything that changes the hero or the story (damage, rests, searching, creatures, threats, the scene...):
//            the player approves it first, unless the campaign lets the narrator act on its own.
//   manual   concluding or abandoning a mission, ending the session, starting a mission and combat are not tools at all.
//            They stay with the player and the buttons in the app.

import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import * as helper from './helper/service.js';
import {
  addSoloWaypointsInputSchema,
  advanceCampaignTimeInputSchema,
  advanceThreatInputSchema,
  askFortuneInputSchema,
  beginSoloReturnInputSchema,
  checkpointSessionInputSchema,
  drawInspirationInputSchema,
  generateSoloNpcInputSchema,
  pushSoloCheckInputSchema,
  resolveSoloCheckConsequenceInputSchema,
  resolveSoloCheckInputSchema,
  resolveSoloDyingActionInputSchema,
  resolveSoloInjuryActionInputSchema,
  resolveSoloNarrativeDamageInputSchema,
  resolveSoloNpcBehaviorInputSchema,
  resolveThreatInputSchema,
  revealWaypointInputSchema,
  scavengeWaypointInputSchema,
  searchWaypointInputSchema,
  setSoloThreatInputSchema,
  startSessionInputSchema,
  takeSoloRestInputSchema,
} from './helper/schemas.js';
import { buildNarratorContext } from './soloNarratorContext.js';
import { describeRoll, pushableChecks, unresolvedChecks } from './soloNarratorRolls.js';

export const SOURCE_CLIENT = 'draconi-narrator';

/** A problem the model can read and react to; it is sent back as the tool's result rather than failing the turn. */
export class ToolProblem extends Error {}

const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const STANDARD_CONDITIONS = ['exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened'];
const STR = (description) => ({ type: 'string', description });
const ENUM = (values, description) => ({ type: 'string', enum: values, ...(description ? { description } : {}) });
const BOOL = (description) => ({ type: 'boolean', description });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const needMission = (state) => {
  if (!state.activeMission) throw new ToolProblem('No mission is under way. The player starts one in the app.');
  return state.activeMission;
};
const needWaypoint = (state) => {
  needMission(state);
  if (!state.currentWaypoint) throw new ToolProblem('The hero is not at a waypoint.');
  return state.currentWaypoint;
};
const nextWaypointOf = (state) => {
  const mission = needMission(state);
  return (state.waypoints ?? []).find((waypoint) => waypoint.position === mission.currentWaypointIndex + 1) ?? null;
};
const byName = (list, wanted, what) => {
  const text = String(wanted ?? '').trim().toLowerCase();
  const found = list.find((entry) => String(entry.name ?? '').toLowerCase() === text) ?? list.find((entry) => String(entry.name ?? '').toLowerCase().includes(text) && text);
  if (!found) throw new ToolProblem(`There is no ${what} called "${wanted}". ${what === 'creature' ? 'Creatures in play: ' : 'Known: '}${list.map((entry) => entry.name).join(', ') || 'none'}.`);
  return found;
};

/**
 * Each tool: how the model sees it (`description`, `parameters`) and what it does. `prepare(args, state)` checks the
 * arguments against the game as it is now and returns `{ schema, fields, call }`; the runner adds the campaign, the
 * revision, the idempotency key and the reason, validates everything with the same schema the REST API and MCP use,
 * and calls the Helper operation. `label` is a short English description for logs and errors.
 */
export const TOOLS = [
  // ---- reading and rolling: runs at once ----
  {
    name: 'get_game_state', tier: 'auto',
    description: 'Read the game as it stands right now (hero, gear, mission, places, rolls, scene). Use it when you are unsure; the summary you were given is rebuilt for every player message but not after your own tool calls.',
    parameters: object({}),
    prepare: () => ({ read: (state) => buildNarratorContext(state) }),
    label: () => 'Read the game state',
  },
  {
    name: 'roll_check', tier: 'auto',
    description: 'Roll a Dragonbane D20 check for the hero with the server dice. Use it whenever an attempt is risky and its outcome is uncertain, then narrate exactly the result you are given. Not for combat. check_name must be a skill or attribute the hero has.',
    parameters: object({
      check_type: ENUM(['skill', 'attribute']),
      check_name: STR('A skill name from "Skills the hero has", or an attribute such as STR'),
      modifier: ENUM(['normal', 'boon', 'bane'], 'boon when the situation clearly favours the hero, bane when it works against them'),
      context: STR('What the hero attempts, under 100 characters'),
    }, ['check_type', 'check_name']),
    prepare: (args) => ({ schema: resolveSoloCheckInputSchema, fields: { check_type: args.check_type, check_name: args.check_name, modifier: args.modifier ?? 'normal', context: args.context || undefined }, call: helper.resolveSoloCheck }),
    label: (args) => `Roll ${args.check_name}${args.modifier && args.modifier !== 'normal' ? ` with a ${args.modifier}` : ''}`,
  },
  {
    name: 'ask_fortune', tier: 'auto',
    description: 'Ask the Fortune oracle a genuinely uncertain question with the server dice (is the door locked, does the guard turn round, how many are there).',
    parameters: object({
      question: STR('The question, under 120 characters'),
      category: ENUM(['yes_no', 'number', 'scale', 'power', 'quality', 'reaction'], 'yes_no unless another kind of answer is needed'),
      tilt: ENUM(['unlikely', 'even', 'likely'], 'how likely a yes is in the story'),
      context: STR('Facts that matter for the answer'),
    }, ['question']),
    prepare: (args) => ({ schema: askFortuneInputSchema, fields: { question: args.question, category: args.category ?? 'yes_no', tilt: args.tilt ?? 'even', context: args.context || undefined }, call: helper.askFortune }),
    label: (args) => `Ask Fortune: ${clip(args.question, 80)}`,
  },
  {
    name: 'draw_inspiration', tier: 'auto',
    description: 'Draw Inspiration words (action, attribute, thing) with the server dice when the story needs an unexpected idea. The words are prompts, not facts; interpret them yourself.',
    parameters: object({
      columns: { type: 'array', items: ENUM(['action', 'attribute', 'thing']), description: 'Which columns to draw, each at most once' },
      context: STR('What the idea is for'),
    }),
    prepare: (args) => ({ schema: drawInspirationInputSchema, fields: { columns: Array.isArray(args.columns) && args.columns.length ? [...new Set(args.columns)] : ['action', 'thing'], context: args.context || undefined }, call: helper.drawInspiration }),
    label: () => 'Draw inspiration',
  },

  // ---- changes the hero or the story: asks the player first ----
  {
    name: 'push_check', tier: 'approve',
    description: 'Push the last failed check, once, after the player explains how. Costs a condition, or 3 WP with Sole Survivor. Only a plain failure can be pushed, never a Demon.',
    parameters: object({
      cost: ENUM(['condition', 'sole_survivor']),
      condition: ENUM(STANDARD_CONDITIONS, 'Required when cost is condition: a condition the hero does not have yet'),
      explanation: STR('How the hero pushes, in one sentence'),
    }, ['cost', 'explanation']),
    prepare: (args, state) => {
      const source = pushableChecks(state.latestRolls ?? [])[0];
      if (!source) throw new ToolProblem('There is no failed check that can be pushed.');
      return { schema: pushSoloCheckInputSchema, fields: { source_roll_id: source.id, cost: args.cost, condition: args.cost === 'condition' ? args.condition : undefined, explanation: args.explanation }, call: helper.pushSoloCheck };
    },
    label: (args) => `Push the failed roll (${args.cost === 'sole_survivor' ? 'Sole Survivor' : args.condition ?? 'a condition'})`,
  },
  {
    name: 'settle_failed_check', tier: 'approve',
    description: 'Settle the last failed (or Demon) check with one consequence that moves the story forward. Offer a fitting one; the server applies the effect. Effects: story_event (no mechanical change), advance_threat (amount 1 or 2), damage (amount), add_condition (key), new_danger (description), add_diversion_waypoint (title, description).',
    parameters: object({
      description: STR('The consequence, in one or two sentences'),
      effect_type: ENUM(['story_event', 'advance_threat', 'damage', 'add_condition', 'new_danger', 'add_diversion_waypoint']),
      amount: { type: 'integer', description: 'For damage (1 and up) or advance_threat (1 or 2)' },
      condition: ENUM(STANDARD_CONDITIONS, 'For add_condition'),
      danger: STR('For new_danger: what the danger is'),
      title: STR('For add_diversion_waypoint: the new place'),
      place_description: STR('For add_diversion_waypoint: what it is like'),
    }, ['description', 'effect_type']),
    prepare: (args, state) => {
      const source = unresolvedChecks(state.latestRolls ?? [])[0];
      if (!source) throw new ToolProblem('No failed check is waiting for a consequence.');
      const effect = { type: args.effect_type };
      if (args.effect_type === 'advance_threat') effect.amount = Number(args.amount) === 2 ? 2 : 1;
      if (args.effect_type === 'damage') effect.amount = Number(args.amount);
      if (args.effect_type === 'add_condition') effect.key = args.condition;
      if (args.effect_type === 'new_danger') effect.description = args.danger;
      if (args.effect_type === 'add_diversion_waypoint') { effect.title = args.title; effect.description = args.place_description; }
      return { schema: resolveSoloCheckConsequenceInputSchema, fields: { source_roll_id: source.id, resolution: { mode: 'manual', consequence: { description: args.description, effect } }, confirmed_by_user: true }, call: helper.resolveSoloCheckConsequence };
    },
    label: (args) => `Consequence: ${clip(args.description, 100)}`,
  },
  {
    name: 'narrative_damage', tier: 'approve',
    description: 'Hurt the hero outside a fight (a fall, fire, a trap). The server rolls how severe it is unless you name a severity, and applies the damage.',
    parameters: object({ severity: ENUM(['unknown', 'slight', 'moderate', 'severe'], 'unknown lets the dice decide'), context: STR('What hurts the hero') }, ['context']),
    prepare: (args) => ({ schema: resolveSoloNarrativeDamageInputSchema, fields: { severity: args.severity ?? 'unknown', context: args.context }, call: helper.resolveSoloNarrativeDamage }),
    label: (args) => `Narrative damage: ${clip(args.context, 80)}`,
  },
  {
    name: 'take_rest', tier: 'approve',
    description: 'Rest the hero: round, stretch or shift. Only a rest listed under "Rests available now". A shift rest needs a safe place.',
    parameters: object({
      rest_type: ENUM(['round', 'stretch', 'shift']),
      safe_location: BOOL('Whether the place is safe, required for a shift rest'),
      use_healing: BOOL('Use the Healing skill (stretch rest only)'),
      condition_to_clear: ENUM(STANDARD_CONDITIONS, 'A condition to clear (stretch rest only)'),
      context: STR('Where and how'),
    }, ['rest_type']),
    prepare: (args) => ({ schema: takeSoloRestInputSchema, fields: { rest_type: args.rest_type, safe_location: Boolean(args.safe_location), use_healing: Boolean(args.use_healing), condition_to_clear: args.condition_to_clear || undefined, context: args.context || undefined }, call: helper.takeSoloRest }),
    label: (args) => `Take a ${args.rest_type} rest`,
  },
  {
    name: 'search_place', tier: 'approve',
    description: 'Search the place the hero is in. Uses a stretch of time and advances the threat. The server rolls what is found.',
    parameters: object({ known_location: BOOL('The hero knows a specific hiding place'), known_nature: BOOL('The hero also knows what is hidden there'), context: STR('What is searched') }),
    prepare: (args, state) => ({ schema: searchWaypointInputSchema, fields: { waypoint_id: needWaypoint(state).id, known_location: Boolean(args.known_location), known_nature: Boolean(args.known_nature), context: args.context || undefined }, call: helper.searchWaypoint }),
    label: (args) => `Search${args.context ? `: ${clip(args.context, 80)}` : ' the place'}`,
  },
  {
    name: 'scavenge_place', tier: 'approve',
    description: 'Scavenge the place for supplies. A first quick pass costs two minutes; repeating it, or spend_stretch, costs a stretch and advances the threat.',
    parameters: object({ spend_stretch: BOOL('Take a full stretch'), context: STR('What is scavenged') }),
    prepare: (args, state) => ({ schema: scavengeWaypointInputSchema, fields: { waypoint_id: needWaypoint(state).id, spend_stretch: Boolean(args.spend_stretch), context: args.context || undefined }, call: helper.scavengeWaypoint }),
    label: (args) => `Scavenge${args.context ? `: ${clip(args.context, 80)}` : ' the place'}`,
  },
  {
    name: 'create_creature', tier: 'approve',
    description: 'Bring a creature or foe into play as a Solo Minion or Boss with one or two attacker roles.',
    parameters: object({
      name: STR('What it is called'), template: ENUM(['minion', 'boss']),
      roles: { type: 'array', items: ENUM(['melee', 'ranged', 'sneaky', 'magic']), description: 'One or two' },
      notes: STR('A short description'),
    }, ['name', 'template', 'roles']),
    prepare: (args, state) => ({ schema: generateSoloNpcInputSchema, fields: { name: args.name, template: args.template, roles: [...new Set(Array.isArray(args.roles) ? args.roles : [])].slice(0, 2), mission_id: state.activeMission?.id, waypoint_id: state.currentWaypoint?.id, notes: args.notes || undefined }, call: helper.generateSoloNpc }),
    label: (args) => `Bring in ${args.name}`,
  },
  {
    name: 'creature_behavior', tier: 'approve',
    description: 'Resolve what a creature in play does: attack (rolls its attack table), intent (asks Fortune or Inspiration what it wants), or morale (asks whether it flees or surrenders).',
    parameters: object({
      creature: STR('The creature\'s name'), behavior: ENUM(['attack', 'intent', 'morale']),
      role: ENUM(['melee', 'ranged', 'sneaky', 'magic'], 'For attack: which role attacks'),
      oracle: ENUM(['fortune', 'inspiration'], 'For intent'), question: STR('For intent with Fortune'),
      tilt: ENUM(['unlikely', 'even', 'likely']), disposition: ENUM(['fled', 'surrendered'], 'For morale: what is asked about'),
    }, ['creature', 'behavior']),
    prepare: (args, state) => {
      const creature = byName((state.npcs ?? []).filter((npc) => npc.status === 'active'), args.creature, 'creature');
      return { schema: resolveSoloNpcBehaviorInputSchema, fields: { npc_id: creature.id, behavior: args.behavior, role: args.role || undefined, oracle: args.oracle ?? 'fortune', question: args.question || undefined, tilt: args.tilt ?? 'even', disposition: args.disposition || undefined }, call: helper.resolveSoloNpcBehavior };
    },
    label: (args) => `${args.creature}: ${args.behavior}`,
  },
  {
    name: 'reveal_place', tier: 'approve',
    description: 'Move the hero on to the next place of the route. When that place is still unknown, give it a title and description made only of what the hero can now see.',
    parameters: object({ title: STR('For an unknown place'), description: STR('For an unknown place') }),
    prepare: (args, state) => {
      const next = nextWaypointOf(state);
      if (!next) throw new ToolProblem('There is no next place to reveal.');
      const unknown = next.kind === 'unknown';
      if (unknown && (!args.title || !args.description)) throw new ToolProblem('The next place is still unknown: give it a title and a description.');
      return { schema: revealWaypointInputSchema, fields: { waypoint_id: next.id, title: unknown ? args.title : undefined, description: unknown ? args.description : undefined }, call: helper.revealWaypoint };
    },
    label: (args) => `Move on${args.title ? ` to ${clip(args.title, 80)}` : ''}`,
  },
  {
    name: 'add_places', tier: 'approve',
    description: 'Add one to six hidden places (unknown or diversion) after the current one; the server can generate their locations.',
    parameters: object({ count: { type: 'integer', description: '1 to 6' }, kind: ENUM(['unknown', 'diversion']), generate_locations: BOOL('Generate locations from the Solo tables') }, ['count']),
    prepare: (args) => ({ schema: addSoloWaypointsInputSchema, fields: { count: Number(args.count), kind: args.kind ?? 'diversion', generate_locations: args.generate_locations !== false }, call: helper.addSoloWaypoints }),
    label: (args) => `Add ${args.count} ${args.kind ?? 'diversion'} place(s)`,
  },
  {
    name: 'leave_site', tier: 'approve',
    description: 'Begin the way back after the objective is reached: cleared (no incident), dangerous (the hero tests Awareness or Sneaking), or alternative (the direct route is impossible).',
    parameters: object({ route_type: ENUM(['cleared', 'dangerous', 'alternative']), check_skill: ENUM(['Awareness', 'Sneaking'], 'Required for dangerous') }, ['route_type']),
    prepare: (args) => ({ schema: beginSoloReturnInputSchema, fields: { route_type: args.route_type, check_skill: args.check_skill || undefined }, call: helper.beginSoloReturn }),
    label: (args) => `Leave the site (${args.route_type})`,
  },
  {
    name: 'advance_threat', tier: 'approve',
    description: 'Move the mission threat counter up by 1, or 2 for something dire, when time passes or the hero lingers. At 6 its event triggers.',
    parameters: object({ amount: { type: 'integer', description: '1 or 2' }, why: STR('Why, in a few words') }, ['why']),
    prepare: (args, state) => {
      const threat = state.activeThreat;
      if (!threat || threat.status !== 'active') throw new ToolProblem('There is no active threat to advance.');
      return { schema: advanceThreatInputSchema, fields: { threat_id: threat.id, amount: Number(args.amount) === 2 ? 2 : 1 }, call: helper.advanceThreat, reason: args.why };
    },
    label: (args) => `Advance the threat${Number(args.amount) === 2 ? ' by 2' : ''}: ${clip(args.why, 80)}`,
  },
  {
    name: 'resolve_threat', tier: 'approve',
    description: 'Record how a triggered threat event was dealt with.',
    parameters: object({ resolution: STR('How it was resolved') }, ['resolution']),
    prepare: (args, state) => {
      const threat = state.activeThreat;
      if (!threat || threat.status !== 'triggered') throw new ToolProblem('No threat has triggered.');
      return { schema: resolveThreatInputSchema, fields: { threat_id: threat.id, resolution: args.resolution }, call: helper.resolveThreat };
    },
    label: (args) => `Resolve the threat: ${clip(args.resolution, 80)}`,
  },
  {
    name: 'set_threat', tier: 'approve',
    description: 'Create a new mission threat at counter 1 (replacing the current one by default).',
    parameters: object({ description: STR('The threat'), trigger_effect: STR('What happens when it reaches 6'), recurring: BOOL('Resets instead of ending'), replace_existing: BOOL() }, ['description']),
    prepare: (args) => ({ schema: setSoloThreatInputSchema, fields: { description: args.description, recurring: Boolean(args.recurring), trigger_effect: args.trigger_effect ? { description: String(args.trigger_effect) } : {}, replace_existing: args.replace_existing !== false }, call: helper.setSoloThreat }),
    label: (args) => `New threat: ${clip(args.description, 80)}`,
  },
  {
    name: 'dying_action', tier: 'approve',
    description: 'At 0 HP: roll a death roll, try to rally (Persuasion), attempt life-saving Healing, or recover when already stabilised. The server rolls.',
    parameters: object({ action: ENUM(['death_roll', 'self_rally', 'life_saving_healing', 'recover_stabilized']), context: STR('The moment') }, ['action']),
    prepare: (args) => ({ schema: resolveSoloDyingActionInputSchema, fields: { action: args.action, context: args.context || undefined }, call: helper.resolveSoloDyingAction }),
    label: (args) => `Dying action: ${args.action.replace(/_/g, ' ')}`,
  },
  {
    name: 'treat_injury', tier: 'approve',
    description: 'Try medical care on one of the hero\'s severe injuries, using the Healing skill.',
    parameters: object({ injury: STR('The injury\'s name'), context: STR('How') }, ['injury']),
    prepare: (args, state) => {
      const injury = byName((state.activeInjuries ?? []).filter((entry) => entry.status === 'active'), args.injury, 'injury');
      return { schema: resolveSoloInjuryActionInputSchema, fields: { injury_id: injury.id, action: 'medical_care', confirmed_by_user: true, context: args.context || undefined }, call: helper.resolveSoloInjuryAction };
    },
    label: (args) => `Treat the injury: ${args.injury}`,
  },
  {
    name: 'advance_time', tier: 'approve',
    description: 'Let time pass: rounds, stretches, shifts or days. Burns torches and can bring due rolls.',
    parameters: object({ unit: ENUM(['round', 'stretch', 'shift', 'day']), amount: { type: 'integer' }, why: STR('Why') }, ['unit', 'amount', 'why']),
    prepare: (args) => ({ schema: advanceCampaignTimeInputSchema, fields: { unit: args.unit, amount: Number(args.amount) }, call: helper.advanceCampaignTime, reason: args.why }),
    label: (args) => `Let ${args.amount} ${args.unit}(s) pass`,
  },
  {
    name: 'update_scene', tier: 'approve',
    description: 'Save the current scene and open threads to the campaign (a checkpoint), for whoever continues the story. Use it when the story clearly moved to a new place or the threads changed. threads is the complete list still open.',
    parameters: object({
      location: STR('Where the hero is now'), description: STR('The place, a sentence or two'), situation: STR('What is going on'),
      threads: { type: 'array', items: { type: 'string' }, description: 'Every thread still open' },
      summary: STR('The story so far in a few sentences, for the checkpoint'),
    }, ['location', 'summary']),
    prepare: (args, state) => ({
      custom: true,
      fields: { location: args.location, description: args.description ?? '', situation: args.situation || undefined, threads: (Array.isArray(args.threads) ? args.threads : []).map((thread) => clip(thread, 200)).filter(Boolean).slice(0, 20), summary: args.summary },
      call: async (user, base, fields) => {
        let sessionId = state.activeSessionId;
        let revision = base.expected_revision;
        if (!sessionId) {
          const started = await helper.startSession(user, startSessionInputSchema.parse({ campaign_id: base.campaign_id, expected_revision: revision, idempotency_key: `${base.idempotency_key}-session`, title: 'Solo adventure', reason: base.reason }), { sourceClient: SOURCE_CLIENT });
          sessionId = started.state_excerpt.session.id;
          revision = started.campaign_revision;
        }
        return helper.checkpointSession(user, checkpointSessionInputSchema.parse({
          campaign_id: base.campaign_id, session_id: sessionId, expected_revision: revision, idempotency_key: base.idempotency_key, reason: base.reason,
          summary: fields.summary, scene: { location: fields.location, description: fields.description, ...(fields.situation ? { situation: fields.situation } : {}) }, unresolved_threads: fields.threads,
        }), { sourceClient: SOURCE_CLIENT });
      },
    }),
    label: (args) => `Update the scene: ${clip(args.location, 80)}`,
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
export const toolByName = (name) => BY_NAME.get(name) ?? null;

/** The tool definitions in the shape chat-completion APIs take. */
export function toolSpecs() {
  return TOOLS.map((tool) => ({ type: 'function', function: { name: tool.name, description: `${tool.description} ${tool.tier === 'auto' ? '(Runs at once.)' : '(The player may be asked to approve it first.)'}`, parameters: tool.parameters } }));
}

/** Reads the arguments the model wrote. A bad JSON string is a problem for the model to fix, not a failure. */
export function parseToolArguments(text) {
  const source = String(text ?? '').trim();
  if (!source) return {};
  try {
    const value = JSON.parse(source);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw new ToolProblem('The arguments were not valid JSON.');
  }
}

/** Whether a call waits for the player in this mode. In "trust" mode nothing does. */
export const needsApproval = (tool, mode) => tool.tier === 'approve' && mode !== 'trust';

const heroLine = (state) => {
  const hero = state?.playerCharacter;
  if (!hero) return '';
  const conditions = (hero.conditions ?? []).map((condition) => condition.name).filter(Boolean);
  return ` Hero now: HP ${hero.hp?.current}/${hero.hp?.max}, WP ${hero.wp?.current}/${hero.wp?.max}${conditions.length ? `, ${conditions.join(', ')}` : ''}.`;
};

function problemText(error) {
  if (error instanceof ToolProblem) return error.message;
  if (error instanceof ZodError) return `The arguments were not accepted: ${error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}.`;
  const details = Array.isArray(error?.details) ? ` (${error.details.slice(0, 3).map((detail) => `${detail.path}: ${detail.message}`).join('; ')})` : '';
  return `${error?.message || 'The game refused it.'}${details}`;
}

/**
 * Runs one tool for the user, as that user: the same permissions, rules and event log as any other client. Never
 * throws for a problem with the call itself; returns `{ ok: false, error }` so the model can react to it.
 */
export async function runTool(user, partyId, name, rawArguments, { approved = false, getState = helper.getSoloState } = {}) {
  const tool = toolByName(name);
  if (!tool) return { ok: false, error: `There is no tool called ${name}.` };
  try {
    const args = typeof rawArguments === 'string' ? parseToolArguments(rawArguments) : (rawArguments ?? {});
    let state = await getState(user, partyId);
    if (!state?.solo?.enabled) throw new ToolProblem('Solo mode is not switched on for this campaign.');
    const prepared = tool.prepare(args, state);
    // Keep the line breaks: the game summary is read by the model and shown, folded, to the player.
    if (prepared.read) return { ok: true, summary: String(prepared.read(state)).slice(0, 6000) };

    const reason = clip(prepared.reason || `The Solo narrator: ${tool.label(args)}${approved ? ' (approved by the player)' : ''}`, 500);
    const attempt = async (current) => {
      const base = { campaign_id: partyId, expected_revision: current.campaignRevision, idempotency_key: `narrator-${randomUUID()}`, reason };
      if (prepared.custom) return prepared.call(user, base, prepared.fields);
      const input = prepared.schema.parse({ ...base, ...prepared.fields });
      return prepared.call(user, input, { sourceClient: SOURCE_CLIENT });
    };
    let result;
    try {
      result = await attempt(state);
    } catch (error) {
      // Someone changed the campaign between reading it and writing: read it again and try once more.
      if (error?.code !== 'REVISION_CONFLICT') throw error;
      state = await getState(user, partyId);
      result = await attempt(state);
    }
    const roll = result?.state_excerpt?.roll;
    const after = await getState(user, partyId).catch(() => null);
    // A roll is written out in full (what came up, against what, how it ended); anything else uses the game's own summary.
    const summary = `${roll ? describeRoll(roll, { pushed: new Set() }) : clip(result?.summary, 400)}${heroLine(after)}`.trim();
    return { ok: true, summary, rollId: roll?.id ?? null };
  } catch (error) {
    return { ok: false, error: problemText(error) };
  }
}
