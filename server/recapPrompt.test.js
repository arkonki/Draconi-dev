// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RECAP_SYSTEM_PROMPT, buildRecapMessages } from './recapPrompt.js';
import { RECAP_DRAFT_NOTE, RECAP_NOTHING_RECORDED } from '../shared/recapNotes.js';

describe('recap polishing', () => {
  it('tells the model to stay with the draft and sends the draft as the message', () => {
    const messages = buildRecapMessages('Goblin ambush: 4 rounds.');
    expect(messages[0]).toEqual({ role: 'system', content: RECAP_SYSTEM_PROMPT });
    expect(RECAP_SYSTEM_PROMPT).toContain('Do not invent events');
    expect(messages[1]).toEqual({ role: 'user', content: 'Goblin ambush: 4 rounds.' });
  });

  it('leaves the GM-only notes of the draft out of what the model reads', () => {
    const draft = `The Dark Wood.\n\n${RECAP_NOTHING_RECORDED}\n\n${RECAP_DRAFT_NOTE}`;
    expect(buildRecapMessages(draft)[1].content).toBe('The Dark Wood.');
    expect(RECAP_SYSTEM_PROMPT).toContain('Never mention the app');
  });

  it('keeps an oversized draft within bounds', () => {
    expect(buildRecapMessages('x'.repeat(20_000))[1].content).toHaveLength(8000);
  });

  it('can ask for the recap in Estonian', () => {
    const system = buildRecapMessages('Draft', 'et')[0].content;
    expect(system).toContain('Estonian (eesti keel)');
    expect(system).not.toContain('ACTIONS');
    expect(system).toContain('Hit points = Elupunktid');
    expect(buildRecapMessages('Draft')[0].content).toBe(RECAP_SYSTEM_PROMPT);
  });
});
