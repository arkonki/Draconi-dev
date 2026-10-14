// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_CONTEXT_CHARS, NARRATOR_SYSTEM_PROMPT, buildNarratorContext, buildNarratorMessages, buildSummaryMessages, parseNarratorReply, sanitizeHistory } from './soloNarratorContext.js';

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
    expect(context).toContain('Other equipped: Short sword.');
    expect(context).toContain('MISSION: The lost shrine.');
    expect(context).toContain('HERE: Forest path');
    expect(context).toContain('Creature: Wolf');
    expect(context).toContain('Looming threat: The cult hunts you.');
    expect(context).toContain('ACTIONS THE APP OFFERS NOW: resolve_solo_check, take_solo_rest.');
  });

  it('tells the narrator which weapons and armor the hero has right now', () => {
    const geared = buildNarratorContext({
      ...state,
      playerCharacter: {
        ...state.playerCharacter,
        weapons: [{ name: 'Battle axe', damage: '2D8', range: '2', grip: '2H', durability: 9, features: ['TOPPLING', 'SLASHING'] }, { name: 'Shield (Small)', damage: 'D8', range: '2', grip: '1H', state: { broken: true } }],
        bodyArmor: { name: 'Chainmail', armorRating: 5 },
        helmet: { name: 'Open helmet', armorRating: 1 },
        shield: null,
        heldItems: [{ name: 'Torch', state: { isLit: true } }, { name: 'Battle axe', state: { isLit: null } }],
      },
    });
    expect(geared).toContain('Weapons in hand: Battle axe (damage 2D8, range 2, two hands, toppling/slashing, durability 9); Shield (Small) (damage D8, range 2, one hand, BROKEN).');
    expect(geared).toContain('Armor worn: Chainmail (armor 5); Open helmet (armor 1).');
    expect(geared).toContain('Lit: Torch.');
    expect(geared).not.toContain('Shield:');
  });

  it('says plainly when the hero is unarmed and unarmored, so nothing is made up', () => {
    expect(context).toContain('Weapons in hand: none. The hero is unarmed.');
    expect(context).toContain('Armor worn: none.');
    expect(NARRATOR_SYSTEM_PROMPT).toContain('Never give the hero a weapon or armor that is not listed');
  });

  it('leaves out what the hero has not found yet', () => {
    expect(context).not.toContain('Secret cave');
    expect(context).not.toContain('Cultists wait');
    expect(context).not.toContain('Hidden vault');
    expect(context).toContain('A rotten bridge.');
  });

  it('gives the narrator the dice results, outcome first, and what is still unsettled', () => {
    const rolled = buildNarratorContext({
      ...state,
      allowedNextActions: ['resolve_solo_check', 'push_solo_check', 'resolve_solo_check_consequence'],
      latestRolls: [{ id: 'r1', purpose: 'Solo skill: Sneaking', result: { action: 'solo_check', checkType: 'skill', checkName: 'Sneaking', target: 12, modifier: 'normal', check: { dice: [15], roll: 15, target: 12, outcome: 'failure' }, outcome: 'failure', requiresFailForward: true } }],
      journal: { recentEvents: [{ type: 'solo.check_resolved', sourceType: 'user', payload: { rollId: 'r1', checkName: 'Sneaking', outcome: 'failure' } }] },
    });
    expect(rolled).toContain('LATEST ROLLS (newest first');
    expect(rolled).toContain('Sneaking skill check: rolled 15 against 12 → FAILURE.');
    expect(rolled).toContain('AWAITING THE PLAYER');
    expect(rolled).not.toContain('solo.check_resolved');
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
    expect(messages[0].content).not.toContain('HERO: Mara');
    // the game state changes every turn, so it comes last, together with what the player said
    const last = messages.at(-1);
    expect(last.role).toBe('user');
    expect(last.content).toContain('CURRENT GAME STATE');
    expect(last.content).toContain('HERO: Mara');
    expect(last.content.endsWith('WHAT THE PLAYER SAYS OR DOES NOW\nI climb the tree')).toBe(true);
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
    expect(messages[1]).toEqual({ role: 'system', content: 'THE STORY SO FAR (what happened earlier)\nMara fled the burning inn and swore revenge.' });
    expect(buildNarratorMessages({ state, history: [], message: 'x' }).some((message) => message.content.includes('THE STORY SO FAR'))).toBe(false);
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

describe('prompt caching order', () => {
  it('starts every request with the same fixed text, however the game changes', () => {
    const one = buildNarratorMessages({ state, history: [], message: 'first', language: 'et' });
    const two = buildNarratorMessages({ state: { ...state, playerCharacter: { ...state.playerCharacter, hp: { current: 1, max: 12 } } }, history: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'reply' }], message: 'second', language: 'et' });
    expect(two[0]).toEqual(one[0]);
    // and a growing conversation only appends to what came before the newest turn
    expect(two[1]).toEqual({ role: 'user', content: 'first' });
    expect(two.at(-1).content).not.toBe(one.at(-1).content);
  });
});

describe('narration language', () => {
  it('leaves English prompts as they are and adds the instruction for Estonian', () => {
    const english = buildNarratorMessages({ state, history: [], message: 'x' })[0].content;
    expect(english).not.toContain('LANGUAGE:');
    expect(buildNarratorMessages({ state, history: [], message: 'x', language: 'en' })[0].content).toBe(english);
    const estonian = buildNarratorMessages({ state, history: [], message: 'x', language: 'et' })[0].content;
    expect(estonian).toContain('LANGUAGE: Write everything the player reads in Estonian (eesti keel)');
    expect(estonian).not.toContain('GAME SUMMARY');
  });

  it('asks for the story so far in the same language, without the action rules', () => {
    const summary = buildSummaryMessages({ turns: [], language: 'et' })[0].content;
    expect(summary).toContain('Estonian (eesti keel)');
    expect(summary).not.toContain('ACTIONS');
    expect(buildSummaryMessages({ turns: [] })[0].content).not.toContain('LANGUAGE:');
  });
});

describe('game term glossary', () => {
  it('puts the built-in Estonian terms into the instruction', () => {
    const system = buildNarratorMessages({ state, history: [], message: 'x', language: 'et' })[0].content;
    expect(system).toContain('TERMS: use exactly these translations');
    expect(system).toContain('Hit points = Elupunktid');
    expect(system).toContain('Dragon (a roll of 1) = Draakon');
  });

  it('uses a campaign\'s own glossary instead of the built-in one', () => {
    const system = buildNarratorMessages({ state, history: [], message: 'x', language: 'et', glossary: '# my terms\nHit points = Elu\nbroken line\nDragon = Lohe' })[0].content;
    expect(system).toContain('Hit points = Elu; Dragon = Lohe');
    expect(system).not.toContain('Elupunktid');
  });

  it('gives the summary and recap prompts the terms too, without the action rules', () => {
    const summary = buildSummaryMessages({ turns: [], language: 'et' })[0].content;
    expect(summary).toContain('Hit points = Elupunktid');
    expect(summary).not.toContain('ACTIONS');
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

  it('offers search, scavenge, creatures and moving on only when the app offers them', () => {
    const offered = { ...state, allowedNextActions: ['search_waypoint', 'scavenge_waypoint', 'generate_solo_npc', 'reveal_waypoint'] };
    const line = 'Text.\nACTIONS: [{"type":"search","context":"the carved desk"},{"type":"scavenge","context":"the camp"},{"type":"npc","name":"Ashfang Captain","template":"boss","roles":["melee","ranged","wizard","melee"],"notes":"Scarred and tall"},{"type":"reveal","title":"The Flooded Gallery","description":"Water to the knees."}]';
    const reply = parseNarratorReply(line, { ...offered });
    // three actions at most
    expect(reply.actions.map((action) => action.type)).toEqual(['search', 'scavenge', 'npc']);
    expect(reply.actions[2]).toEqual({ type: 'npc', name: 'Ashfang Captain', template: 'boss', roles: ['melee', 'ranged'], notes: 'Scarred and tall', label: 'Face Ashfang Captain' });
    expect(parseNarratorReply(line, state).actions).toEqual([]);
    const reveal = parseNarratorReply('T.\nACTIONS: [{"type":"reveal","title":"The Flooded Gallery","description":"Water to the knees."}]', offered);
    expect(reveal.actions).toEqual([{ type: 'reveal', title: 'The Flooded Gallery', description: 'Water to the knees.', label: 'Move on' }]);
    const defaults = parseNarratorReply('T.\nACTIONS: [{"type":"npc","name":"Wolf"}]', offered);
    expect(defaults.actions[0]).toMatchObject({ template: 'minion', roles: ['melee'] });
  });

  it('proposes the rule actions an AI assistant also has, only when the game offers them', () => {
    const offered = { ...state, allowedNextActions: ['push_solo_check', 'resolve_solo_check_consequence', 'draw_inspiration', 'resolve_solo_narrative_damage', 'advance_threat', 'begin_solo_return', 'resolve_solo_dying_action'] };
    const line = 'S.\nACTIONS: [{"type":"push"},{"type":"consequence","label":"Pay for it"},{"type":"inspiration","context":"a way out"}]';
    expect(parseNarratorReply(line, offered).actions).toEqual([
      { type: 'push', label: 'Push the roll' },
      { type: 'consequence', label: 'Pay for it' },
      { type: 'inspiration', context: 'a way out', label: 'Draw inspiration' },
    ]);
    const more = 'S.\nACTIONS: [{"type":"damage","context":"a fall","label":"Fall"},{"type":"threat","amount":2},{"type":"leave"}]';
    expect(parseNarratorReply(more, offered).actions).toEqual([
      { type: 'damage', context: 'a fall', label: 'Fall' },
      { type: 'threat', amount: 2, label: 'Time runs out' },
      { type: 'leave', label: 'Leave the site' },
    ]);
    expect(parseNarratorReply('S.\nACTIONS: [{"type":"dying"}]', offered).actions).toEqual([{ type: 'dying', label: 'Fight to live' }]);
    // nothing the game does not offer
    expect(parseNarratorReply(line, { ...state, allowedNextActions: ['draw_inspiration'] }).actions.map((action) => action.type)).toEqual(['inspiration']);
    expect(parseNarratorReply('S.\nACTIONS: [{"type":"push"},{"type":"threat"},{"type":"leave"},{"type":"dying"}]', { ...state, allowedNextActions: [] }).actions).toEqual([]);
  });

  it('proposes a scene update with a tidy thread list, once', () => {
    const line = 'Story.\nACTIONS: [{"type":"scene","location":"The shrine gate","description":"Moss-covered stone.","situation":"Rain.","threads":["Who lit the beacon?","  ","The wolf pack"]},{"type":"scene","location":"Elsewhere"},{"type":"scene"}]';
    const reply = parseNarratorReply(line, state);
    expect(reply.actions).toEqual([{ type: 'scene', location: 'The shrine gate', description: 'Moss-covered stone.', situation: 'Rain.', threads: ['Who lit the beacon?', 'The wolf pack'], label: 'Update the scene' }]);
    expect(parseNarratorReply('S.\nACTIONS: [{"type":"scene"}]', state).actions).toEqual([]);
  });

  it('keeps at most three actions, and copes with missing or broken lines', () => {
    const many = JSON.stringify(Array.from({ length: 6 }, () => ({ type: 'check', name: 'Bows' })));
    expect(parseNarratorReply(`Text.\nACTIONS: ${many}`, state).actions).toHaveLength(3);
    expect(parseNarratorReply('Just a story.', state)).toEqual({ text: 'Just a story.', actions: [] });
    expect(parseNarratorReply('Story.\nACTIONS: not json', state)).toEqual({ text: 'Story.', actions: [] });
    expect(parseNarratorReply('Story.\nACTIONS: {"type":"check"}', state)).toEqual({ text: 'Story.', actions: [] });
  });
});
