// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_CONTEXT_CHARS, buildNarratorContext, buildNarratorMessages, sanitizeHistory } from './soloNarratorContext.js';

const state = {
  playerCharacter: { name: 'Mara', hp: { current: 7, max: 12 }, wp: { current: 5, max: 10 }, lifeStatus: 'active', conditions: [{ name: 'Dazed' }], inventory: [{ name: 'Short sword', equipped: true }, { name: 'Rope', equipped: false }] },
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
});
