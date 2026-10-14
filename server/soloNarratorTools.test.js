// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOOLS, ToolProblem, needsApproval, parseToolArguments, runTool, toolByName, toolSpecs } from './soloNarratorTools.js';
import { appNotes, replaySteps, toolCallsOf } from './soloNarrator.js';

const state = {
  solo: { enabled: true },
  campaignRevision: 7,
  activeSessionId: null,
  activeMission: { id: 'm1', currentWaypointIndex: 0 },
  currentWaypoint: { id: 'w1', title: 'Gate' },
  waypoints: [{ id: 'w1', position: 0, kind: 'foreseen' }, { id: 'w2', position: 1, kind: 'unknown' }],
  activeThreat: { id: 't1', status: 'active' },
  npcs: [{ id: 'n1', name: 'Gate Warden', status: 'active' }, { id: 'n2', name: 'Old Wolf', status: 'retired' }],
  activeInjuries: [{ id: 'i1', name: 'Broken arm', status: 'active' }],
  latestRolls: [],
};
const prepare = (name, args, overrides = {}) => toolByName(name).prepare(args, { ...state, ...overrides });

describe('the narrator tools', () => {
  it('are described for the model, with the three tiers', () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(TOOLS.length);
    expect(specs.every((spec) => spec.type === 'function' && spec.function.parameters.type === 'object')).toBe(true);
    expect(TOOLS.filter((tool) => tool.tier === 'auto').map((tool) => tool.name)).toEqual(['get_game_state', 'roll_check', 'ask_fortune', 'draw_inspiration']);
    // concluding a mission, ending the session, starting a mission and combat are not tools
    const names = TOOLS.map((tool) => tool.name).join(' ');
    expect(names).not.toMatch(/complete|conclude|abandon|start_mission|combat|end_session|apply_actor/);
  });

  it('wait for the player except in trust mode, and never for reads and rolls', () => {
    expect(needsApproval(toolByName('roll_check'), 'ask')).toBe(false);
    expect(needsApproval(toolByName('narrative_damage'), 'ask')).toBe(true);
    expect(needsApproval(toolByName('narrative_damage'), 'trust')).toBe(false);
  });

  it('read the arguments the model wrote and say when they are not JSON', () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArguments('')).toEqual({});
    expect(() => parseToolArguments('{nope')).toThrow(ToolProblem);
  });

  it('fill in what only the game knows: the current place, the threat, the creature, the failed check', () => {
    expect(prepare('search_place', { context: 'the desk' }).fields.waypoint_id).toBe('w1');
    expect(prepare('advance_threat', { amount: 2, why: 'Time passes' }).fields).toEqual({ threat_id: 't1', amount: 2 });
    expect(prepare('creature_behavior', { creature: 'gate warden', behavior: 'attack', role: 'melee' }).fields.npc_id).toBe('n1');
    expect(prepare('treat_injury', { injury: 'broken' }).fields.injury_id).toBe('i1');
    expect(prepare('create_creature', { name: 'Wolf', template: 'minion', roles: ['melee', 'ranged', 'sneaky'] }).fields).toMatchObject({ mission_id: 'm1', waypoint_id: 'w1', roles: ['melee', 'ranged'] });
    const failed = { id: 'r1', result: { action: 'solo_check', outcome: 'failure', requiresFailForward: true } };
    expect(prepare('push_check', { cost: 'condition', condition: 'dazed', explanation: 'x' }, { latestRolls: [failed] }).fields).toMatchObject({ source_roll_id: 'r1', condition: 'dazed' });
    expect(prepare('settle_failed_check', { description: 'The rope snaps', effect_type: 'damage', amount: 3 }, { latestRolls: [failed] }).fields.resolution).toEqual({ mode: 'manual', consequence: { description: 'The rope snaps', effect: { type: 'damage', amount: 3 } } });
  });

  it('refuse, in words the model can use, what the game does not allow', () => {
    expect(() => prepare('push_check', { cost: 'sole_survivor', explanation: 'x' })).toThrow('no failed check that can be pushed');
    expect(() => prepare('settle_failed_check', { description: 'x', effect_type: 'story_event' })).toThrow('No failed check is waiting');
    expect(() => prepare('creature_behavior', { creature: 'Old Wolf', behavior: 'attack' })).toThrow(/no creature called "Old Wolf".*Gate Warden/);
    expect(() => prepare('search_place', {}, { activeMission: null })).toThrow('No mission is under way');
    expect(() => prepare('advance_threat', { why: 'x' }, { activeThreat: null })).toThrow('no active threat');
    expect(() => prepare('reveal_place', {})).toThrow('give it a title and a description');
    expect(() => prepare('reveal_place', {}, { currentWaypoint: state.currentWaypoint, activeMission: { id: 'm1', currentWaypointIndex: 1 } })).toThrow('no next place');
    expect(prepare('reveal_place', { title: 'The cellar', description: 'Damp stone.' }).fields).toEqual({ waypoint_id: 'w2', title: 'The cellar', description: 'Damp stone.' });
  });

  it('answer a tool the game does not have, or a game without solo mode, with a problem instead of an error', async () => {
    expect(await runTool({ id: 'u' }, 'p', 'fly', {})).toEqual({ ok: false, error: 'There is no tool called fly.' });
    expect(await runTool({ id: 'u' }, 'p', 'roll_check', '{}', { getState: async () => ({ solo: { enabled: false } }) })).toEqual({ ok: false, error: 'Solo mode is not switched on for this campaign.' });
    expect(await runTool({ id: 'u' }, 'p', 'roll_check', '{oops', { getState: async () => state })).toEqual({ ok: false, error: 'The arguments were not valid JSON.' });
  });

  it('read the game without changing anything', async () => {
    const result = await runTool({ id: 'u' }, 'p', 'get_game_state', {}, { getState: async () => ({ ...state, playerCharacter: { name: 'Mara', hp: { current: 5, max: 10 }, wp: { current: 4, max: 8 } } }) });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('HERO: Mara. HP 5/10');
  });
});

describe('a reply with tool calls, kept for later', () => {
  const steps = [
    { text: 'The bridge groans.', calls: [{ id: 'c1', name: 'roll_check', args: { check_type: 'attribute', check_name: 'STR' }, label: 'Roll STR', tier: 'auto', status: 'done', summary: 'STR failure: rolled 15 against 13' }] },
    { text: 'You slip.', calls: [{ id: 'c2', name: 'narrative_damage', args: { context: 'a fall' }, label: 'Narrative damage: a fall', tier: 'approve', status: 'declined' }] },
  ];

  it('replays as assistant and tool messages, with a declined call reported as not having happened', () => {
    const messages = replaySteps(steps);
    expect(messages.map((message) => message.role)).toEqual(['assistant', 'tool', 'assistant', 'tool']);
    expect(messages[0].tool_calls[0]).toEqual({ id: 'c1', type: 'function', function: { name: 'roll_check', arguments: '{"check_type":"attribute","check_name":"STR"}' } });
    expect(messages[1]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'STR failure: rolled 15 against 13' });
    expect(messages[3].content).toContain('declined');
  });

  it('is listed call by call for the page, and noted for later turns', () => {
    expect(toolCallsOf({ tool_calls: { steps } }).map((call) => [call.id, call.status])).toEqual([['c1', 'done'], ['c2', 'declined']]);
    expect(toolCallsOf({ tool_calls: null })).toEqual([]);
    expect(appNotes({ tool_calls: { steps } })).toBe('\n[App: Roll STR: STR failure: rolled 15 against 13 | declined: Narrative damage: a fall]');
    expect(appNotes({ tool_calls: null })).toBe('');
  });
});
