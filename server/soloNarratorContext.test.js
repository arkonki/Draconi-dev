// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_CONTEXT_CHARS, buildNarratorContext, buildNarratorMessages, buildSummaryMessages, parseNarratorReply, sanitizeHistory } from './soloNarratorContext.js';

const state = {
  restState: { available: { round: true, stretch: false, shift: true } },
  playerCharacter: { name: 'Mara', skills: { Sneaking: 12, Bows: 8 }, attributes: { STR: 13, AGL: 14 }, hp: { current: 7, max: 12 }, wp: { current: 5, max: 10 }, lifeStatus: 'active', conditions: [{ name: 'Dazed' }], inventory: [{ name: 'Short sword', equipped: true }, { name: 'Rope', equipped: false }] },
  soloHeroicAbility: { name: 'Army of One' },
  activeInjuries: [{ name: 'Broken arm', effect: 'Weapon skills are harder.' }],
  activeMission: { title: 'The lost shrine', objective: 'Find the shrine.', status: 'active', discoveredClues: ['Moss on the north side'] },
  waypoints: [
    { id: 'w1', title: 'Forest path', description: 'A narrow trail.', kind: 'foreseen', status: 'active', notes: ['Crows overhead'] },
    { id: 'w2', title: 'Secret cave', description: 'Hidden vault of the cult', kind: 'unknown', status: 'hidden', notes: [] },
  ],
  currentWaypoint: { id: 'w1', title: 'Forest path', description: 'A narrow trail.', kind: 'foreseen', status: 'active', notes: ['Crows overhead'] },
  activeDangers: [
    { id: 'd1', waypointId: 'w1', status: 'active', description: 'A rotten bridge.' },
    { id: 'd2', waypointId: 'w2', status: 'active', description: 'Cultists wait in the dark.' },
  ],
  npcs: [{ id: 'n1', name: 'Wolf', template: 'minion', roles: ['melee'], status: 'active', waypointId: 'w1', notes: 'Thin and hungry' }],
  activeThreat: { status: 'active', description: 'The cult hunts you.', counter: 3 },
  latestRolls: [{ purpose: 'Sneaking', result: { outcome: 'success' } }],
  journal: { recentEvents: [{ type: 'waypoint.revealed', payload: { title: 'Forest path' } }] },
  allowedNextActions: ['resolve_solo_check', 'take_solo_rest'],
};

describe('solo narrator context', () => {
  const context = buildNarratorContext(state);

  it('summarises the hero, the mission and the place', () => {
    expect(context).toContain('HERO: Mara. HP 7/12, WP 5/10.');
    expect(context).toContain('Conditions: Dazed.');
    expect(context).toContain('Equipped: Short sword.');
    expect(context).toContain('MISSION: The lost shrine.');
    expect(context).toContain('HERE: Forest path');
    expect(context).toContain('Creature: Wolf');
    expect(context).toContain('Looming threat: The cult hunts you.');
    expect(context).toContain('ACTIONS THE APP OFFERS NOW: resolve_solo_check, take_solo_rest.');
  });

  it('leaves out what the hero has not found yet', () => {
    expect(context).not.toContain('Secret cave');
    expect(context).not.toContain('Cultists wait');
    expect(context).not.toContain('Hidden vault');
    expect(context).toContain('A rotten bridge.');
  });

  it('copes with an empty state and stays within its size limit', () => {
    expect(buildNarratorContext({})).toContain('MISSION: none is under way.');
    const huge = { ...state, journal: { recentEvents: Array.from({ length: 40 }, () => ({ type: 'x', payload: { text: 'y'.repeat(500) } })) } };
    expect(buildNarratorContext(huge).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });

  it('builds the conversation with the summary in the system message and a bounded history', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn ${index}` }));
    const messages = buildNarratorMessages({ state, history, message: '  I climb the tree  ' });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('GAME SUMMARY');
    expect(messages[0].content).toContain('HERO: Mara');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'I climb the tree' });
    expect(messages).toHaveLength(1 + 8 + 1);
  });

  it('ignores malformed history entries', () => {
    expect(sanitizeHistory('nope')).toEqual([]);
    expect(sanitizeHistory([{ role: 'system', content: 'x' }, { role: 'user', content: '  ' }, { role: 'user', content: 'ok' }, null])).toEqual([{ role: 'user', content: 'ok' }]);
  });

  it('tells the narrator which skills and rests exist', () => {
    expect(context).toContain('Skills the hero has: Bows, Sneaking.');
    expect(context).toContain('Attributes the hero has: STR, AGL.');
    expect(context).toContain('Rests available now: round, shift.');
  });

  it('includes the story so far in the system message', () => {
    const messages = buildNarratorMessages({ state, summary: 'Mara fled the burning inn and swore revenge.', history: [], message: 'Go on' });
    expect(messages[0].content).toContain('THE STORY SO FAR');
    expect(messages[0].content).toContain('swore revenge');
    expect(buildNarratorMessages({ state, history: [], message: 'x' })[0].content).not.toContain('THE STORY SO FAR');
  });

  it('builds the request that folds old turns into the summary', () => {
    const messages = buildSummaryMessages({ summary: 'Earlier text.', turns: [{ role: 'user', content: 'I open the door' }, { role: 'assistant', content: 'It creaks.' }] });
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toContain('STORY SO FAR:\nEarlier text.');
    expect(messages[1].content).toContain('PLAYER: I open the door');
    expect(messages[1].content).toContain('NARRATOR: It creaks.');
    expect(buildSummaryMessages({ turns: [] })[1].content).toContain('(nothing yet)');
  });
});

describe('the shared campaign story', () => {
  const shared = {
    ...state,
    journal: {
      currentScene: { location: 'The shrine gate', description: 'Moss-covered stone.', situation: 'Rain is falling.', exits: [{ name: 'Forest path', status: 'open', visibility: 'players' }, { name: 'Secret stair', visibility: 'gm' }], dangers: [{ description: 'Loose rubble', status: 'active', visibility: 'players' }, { description: 'Hidden cult guard', status: 'active', visibility: 'gm' }] },
      openThreads: ['Who lit the beacon?', 'The wolf pack'],
      sessions: [
        { status: 'completed', title: 'Session 2', summary: 'Mara found the shrine.' },
        { status: 'completed', title: 'Session 1', summary: 'Mara left the inn.' },
        { status: 'active', title: 'Session 3', summary: null },
      ],
      // newest first, as the event log returns them
      recentEvents: [
        { type: 'narration.recorded', sourceType: 'user', payload: { source: 'narrator', narration: 'MY OWN WORDS' } },
        { type: 'story.beat', sourceType: 'chatgpt', payload: { summary: 'The gate opened.' } },
        { type: 'clue.found', sourceType: 'user', payload: { summary: 'A key in the moss.' } },
      ],
    },
  };
  const context = buildNarratorContext(shared, { checkpoint: { summary: 'The hero reached the gate at dusk.', createdAt: '2026-10-12T20:00:00Z' } });

  it('reads the latest checkpoint, the scene, the threads and the earlier sessions', () => {
    expect(context).toContain('LATEST CHECKPOINT (2026-10-12): The hero reached the gate at dusk.');
    expect(context).toContain('SCENE: The shrine gate. Moss-covered stone. Situation: Rain is falling.');
    expect(context).toContain('Exits: Forest path (open).');
    expect(context).toContain('OPEN THREADS: Who lit the beacon? | The wolf pack');
    expect(context.indexOf('Session 1')).toBeLessThan(context.indexOf('Session 2'));
    expect(context).not.toContain('Session 3');
  });

  it('keeps what the hero does not know out of the scene', () => {
    expect(context).toContain('Scene danger: Loose rubble');
    expect(context).not.toContain('Secret stair');
    expect(context).not.toContain('Hidden cult guard');
  });

  it('lists events from every source, oldest first, without echoing its own narration', () => {
    const events = context.slice(context.indexOf('RECENT EVENTS'));
    expect(events.indexOf('clue.found')).toBeLessThan(events.indexOf('story.beat'));
    expect(events).toContain('story.beat (from an AI assistant)');
    expect(events).not.toContain('MY OWN WORDS');
  });

  it('works without a checkpoint', () => {
    expect(buildNarratorContext(shared)).not.toContain('LATEST CHECKPOINT');
  });
});

describe('narrator reply parsing', () => {
  it('splits the story from valid actions and fixes the names', () => {
    const reply = parseNarratorReply('The bridge sways.\n1. Cross\n2. Wait\nACTIONS: [{"type":"check","name":"sneaking","modifier":"bane","label":"Cross quietly"},{"type":"fortune","question":"Is the bridge safe?","category":"yes_no"},{"type":"rest","rest":"shift"}]', state);
    expect(reply.text).toBe('The bridge sways.\n1. Cross\n2. Wait');
    expect(reply.actions).toEqual([
      { type: 'check', checkType: 'skill', name: 'Sneaking', modifier: 'bane', label: 'Cross quietly' },
      { type: 'fortune', question: 'Is the bridge safe?', category: 'yes_no', label: 'Ask Fortune' },
      { type: 'rest', rest: 'shift', label: 'Take a shift rest' },
    ]);
  });

  it('accepts an attribute and tolerates a code fence', () => {
    const reply = parseNarratorReply('Text.\nACTIONS: ```json\n[{"type":"check","name":"str","label":"Force the door"}]\n```', state);
    expect(reply.actions).toEqual([{ type: 'check', checkType: 'attribute', name: 'STR', modifier: 'normal', label: 'Force the door' }]);
    // an attribute the hero does not have cannot be rolled in the dialog, so it is not offered
    expect(parseNarratorReply('Text.\nACTIONS: [{"type":"check","name":"CHA"}]', state).actions).toEqual([]);
  });

  it('drops anything the game cannot honour', () => {
    const reply = parseNarratorReply('Text.\nACTIONS: [{"type":"check","name":"Flying"},{"type":"rest","rest":"stretch"},{"type":"fortune","question":"  "},{"type":"damage","amount":5},{"type":"check","name":"Bows"},"nonsense",null]', state);
    expect(reply.actions).toEqual([{ type: 'check', checkType: 'skill', name: 'Bows', modifier: 'normal', label: 'Roll Bows' }]);
  });

  it('keeps at most three actions, and copes with missing or broken lines', () => {
    const many = JSON.stringify(Array.from({ length: 6 }, () => ({ type: 'check', name: 'Bows' })));
    expect(parseNarratorReply(`Text.\nACTIONS: ${many}`, state).actions).toHaveLength(3);
    expect(parseNarratorReply('Just a story.', state)).toEqual({ text: 'Just a story.', actions: [] });
    expect(parseNarratorReply('Story.\nACTIONS: not json', state)).toEqual({ text: 'Story.', actions: [] });
    expect(parseNarratorReply('Story.\nACTIONS: {"type":"check"}', state)).toEqual({ text: 'Story.', actions: [] });
  });
});
