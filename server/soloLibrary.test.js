// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_NARRATIVE_CHARS, composeNarrative, improvementsFrom } from './soloLibrary.js';

describe('story library', () => {
  it('keeps the story so far and the latest replies, in order', () => {
    expect(composeNarrative('Mara fled the inn.', ['You reach the gate.', '  ', 'The gate opens.'])).toBe('Mara fled the inn.\n\nYou reach the gate.\n\nThe gate opens.');
    expect(composeNarrative('', [])).toBe('');
    expect(composeNarrative(undefined, ['Only a reply'])).toBe('Only a reply');
  });

  it('cuts a long telling from the front, so the ending survives', () => {
    const long = composeNarrative('x'.repeat(5000), ['y'.repeat(3000), 'THE END']);
    expect(long.length).toBe(MAX_NARRATIVE_CHARS);
    expect(long.endsWith('THE END')).toBe(true);
  });

  it('lists only the skills that went up', () => {
    expect(improvementsFrom([
      { name: 'Awareness', roll: 15, previousLevel: 10, resultingLevel: 11, improved: true },
      { name: 'Bows', roll: 3, previousLevel: 8, resultingLevel: 8, improved: false },
      { name: '', improved: true },
      null,
    ])).toEqual([{ skill: 'Awareness', from: 10, to: 11 }]);
    expect(improvementsFrom(undefined)).toEqual([]);
    expect(improvementsFrom('nope')).toEqual([]);
  });
});
