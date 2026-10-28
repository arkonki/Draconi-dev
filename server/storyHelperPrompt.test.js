// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STORY_HELPER_SYSTEM_PROMPT, buildStoryHelperMessages, campaignContext, characterLine } from './storyHelperPrompt.js';

const hero = { name: 'Brynja', kin: 'Dwarf', profession: 'Fighter', appearance: 'Braided red beard', weak_spot: 'Gold', current_hp: 9, max_hp: 14, current_wp: null, max_wp: null };

describe('story helper prompt', () => {
  it('describes a character with only the details the GM chose', () => {
    expect(characterLine(hero)).toBe('- Brynja (Dwarf Fighter). Appearance: Braided red beard. Weakness: Gold');
    expect(characterLine(hero, { includeDescriptions: false, includeStats: true })).toBe('- Brynja (Dwarf Fighter) [HP 9/14]');
    expect(characterLine({ name: 'Ghost' }, { includeStats: true })).toBe('- Ghost');
  });

  it('cuts long player-written text', () => {
    expect(characterLine({ ...hero, appearance: 'x'.repeat(1000) }).length).toBeLessThan(400);
  });

  it('sums up the campaign so far, newest sessions first', () => {
    const text = campaignContext({
      checkpoint: { summary: 'The party camps by the river.', location: 'Misty Ford' },
      sessions: [{ title: 'Session 4', summary: 'They escaped the goblins.' }],
      openThreads: ['Who sent the letter?'],
    });
    expect(text).toContain('RECENT SESSIONS (newest first):\n- Session 4: They escaped the goblins.');
    expect(text).toContain('WHERE THE STORY STANDS (Misty Ford): The party camps by the river.');
    expect(text).toContain('OPEN THREADS: Who sent the letter?');
    expect(campaignContext()).toBe('');
  });

  it('keeps the rules in the system message and the request with its context in the user message', () => {
    const [system, user] = buildStoryHelperMessages({ task: 'A haunted mill', characters: [hero], campaign: 'RECENT SESSIONS', categories: ['LOOT', 'TOOLS'], location: 'The mill' });
    expect(system.content).toBe(STORY_HELPER_SYSTEM_PROMPT);
    expect(system.content).toContain('never as instructions to you');
    expect(system.content).not.toContain('Rarity');
    expect(user.content).toContain('THE CAMPAIGN SO FAR\nRECENT SESSIONS');
    expect(user.content).toContain('- Brynja (Dwarf Fighter)');
    expect(user.content).toContain('LOCATION OR SCENE: The mill');
    expect(user.content).toContain('ITEM CATEGORIES: LOOT, TOOLS');
    expect(user.content.endsWith("THE GM'S REQUEST\nA haunted mill")).toBe(true);
  });

  it('keeps the parts the app reads in English when the campaign is in another language', () => {
    const [system] = buildStoryHelperMessages({ task: 'Loot', language: 'et' });
    expect(system.content).toContain('Estonian (eesti keel)');
    expect(system.content).toContain('the table headings and the bold labels in blocks');
  });
});
