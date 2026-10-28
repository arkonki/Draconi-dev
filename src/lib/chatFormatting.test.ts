import { describe, expect, it } from 'vitest';
import { insertAt, toggleWrap } from './chatFormatting';

describe('chat formatting', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(toggleWrap('hit the orc', 4, 7, '**')).toEqual({ value: 'hit **the** orc', selectionStart: 6, selectionEnd: 9 });
  });

  it('puts the cursor between the markers when nothing is selected', () => {
    expect(toggleWrap('go ', 3, 3, '`')).toEqual({ value: 'go ``', selectionStart: 4, selectionEnd: 4 });
  });

  it('unwraps text that is already wrapped, inside or outside the selection', () => {
    expect(toggleWrap('hit **the** orc', 6, 9, '**')).toEqual({ value: 'hit the orc', selectionStart: 4, selectionEnd: 7 });
    expect(toggleWrap('hit *the* orc', 4, 9, '*')).toEqual({ value: 'hit the orc', selectionStart: 4, selectionEnd: 7 });
  });

  it('does not mistake bold for italic', () => {
    expect(toggleWrap('**the**', 2, 5, '*').value).toBe('***the***');
  });

  it('inserts text at the cursor, replacing a selection', () => {
    expect(insertAt('hello world', 6, 11, '🐉')).toEqual({ value: 'hello 🐉', selectionStart: 8, selectionEnd: 8 });
  });
});
