// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MISSION_SYSTEM_PROMPT, buildMissionMessages, missionContext, parseMissionProposal } from './soloMissionProposal.js';

const good = {
  title: 'The Drowned Lighthouse',
  objective: 'Relight the lighthouse before the fleet returns.',
  opening: { title: 'The harbour wall', description: 'Fog rolls in as the last boat leaves.' },
  foreseen: [{ title: 'The salt marsh', description: 'A narrow causeway.' }, { title: 'The keeper\'s hut', description: 'Empty, but the fire is warm.' }],
  unknown_waypoints: 2,
  threat: { description: 'The tide is rising', recurring: false, trigger_effect: 'The causeway floods.' },
};

describe('mission proposal', () => {
  it('reads a clean answer', () => {
    const mission = parseMissionProposal(JSON.stringify(good));
    expect(mission).toEqual({
      title: 'The Drowned Lighthouse',
      objective: 'Relight the lighthouse before the fleet returns.',
      opening: { title: 'The harbour wall', description: 'Fog rolls in as the last boat leaves.' },
      foreseen: [{ title: 'The salt marsh', description: 'A narrow causeway.' }, { title: 'The keeper\'s hut', description: 'Empty, but the fire is warm.' }],
      unknownWaypoints: 2,
      threat: { description: 'The tide is rising', recurring: false, triggerEffect: 'The causeway floods.' },
    });
  });

  it('copes with a code fence and words around the object', () => {
    const wrapped = `Here is the mission:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nEnjoy!`;
    expect(parseMissionProposal(wrapped)?.title).toBe('The Drowned Lighthouse');
    // an object that is not a mission does not hide the one after it
    expect(parseMissionProposal(`{"note": "{braces} in text"} then ${JSON.stringify(good)}`)?.title).toBe('The Drowned Lighthouse');
  });

  it('cuts every field to what the rules accept', () => {
    const big = { ...good, title: 'T'.repeat(500), foreseen: Array.from({ length: 9 }, (_, i) => ({ title: `Place ${i}`, description: 'x' })), unknown_waypoints: 9 };
    const mission = parseMissionProposal(JSON.stringify(big));
    expect(mission.title.length).toBeLessThanOrEqual(200);
    expect(mission.foreseen).toHaveLength(4);
    expect(mission.unknownWaypoints).toBe(3);
    expect(parseMissionProposal(JSON.stringify({ ...good, unknown_waypoints: -2 })).unknownWaypoints).toBe(0);
    expect(parseMissionProposal(JSON.stringify({ ...good, threat: { description: 'x', recurring: 'yes' } })).threat.recurring).toBe(false);
  });

  it('rejects an answer that cannot start a mission', () => {
    expect(parseMissionProposal('I cannot do that.')).toBeNull();
    expect(parseMissionProposal('{broken')).toBeNull();
    expect(parseMissionProposal(JSON.stringify({ ...good, title: '  ' }))).toBeNull();
    expect(parseMissionProposal(JSON.stringify({ ...good, opening: { title: 'Only a title' } }))).toBeNull();
    expect(parseMissionProposal(JSON.stringify({ ...good, threat: {} }))).toBeNull();
    expect(parseMissionProposal(undefined)).toBeNull();
  });

  it('drops foreseen places that have no title', () => {
    const mission = parseMissionProposal(JSON.stringify({ ...good, foreseen: [{ description: 'nameless' }, { title: 'Named', description: '' }] }));
    expect(mission.foreseen).toEqual([{ title: 'Named', description: '' }]);
  });
});

describe('mission request', () => {
  const context = missionContext({
    hero: { name: 'Mara', description: 'A wary archer.' },
    storySoFar: 'Mara fled the burning inn.',
    pastMissions: [{ title: 'The Vanished Lantern', outcome: 'success', summary: 'The lantern was found.' }],
    openThreads: ['Who lit the beacon?'],
  });

  it('gives the model the hero, the story and the earlier missions', () => {
    expect(context).toContain('HERO: Mara (A wary archer.)');
    expect(context).toContain('THE STORY SO FAR\nMara fled the burning inn.');
    expect(context).toContain('OPEN THREADS: Who lit the beacon?');
    expect(context).toContain('- The Vanished Lantern (success): The lantern was found.');
  });

  it('asks for the idea, or for a follow-on when there is none', () => {
    const messages = buildMissionMessages({ idea: ' a haunted lighthouse ', context });
    expect(messages[0].content).toBe(MISSION_SYSTEM_PROMPT);
    expect(messages[1].content).toContain("THE PLAYER'S IDEA FOR THE NEXT STORY\na haunted lighthouse");
    expect(buildMissionMessages({ idea: '', context: '' })[1].content).toContain('(none: propose something that follows');
  });

  it('asks for the text values in Estonian, keeping the JSON keys in English', () => {
    const system = buildMissionMessages({ idea: 'x', context: '', language: 'et' })[0].content;
    expect(system).toContain('Estonian (eesti keel)');
    expect(system).toContain('keep the JSON keys exactly as shown in English');
    expect(system).toContain('Hit points = Elupunktid');
    expect(buildMissionMessages({ idea: 'x', context: '' })[0].content).not.toContain('LANGUAGE:');
  });
});
