import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { single, select, insert, from };
});
vi.mock('../supabase', () => ({ supabase: { from: mocks.from } }));

import { saveSessionRecapNote, sessionRecapNoteTitle, SESSION_RECAP_CATEGORY } from './partyNotes';

describe('saving a session recap as a party note', () => {
  beforeEach(() => {
    mocks.single.mockReset();
    mocks.insert.mockClear();
    mocks.from.mockClear();
  });

  it('names the note after the session and the day', () => {
    const title = sessionRecapNoteTitle('  The Misty Vale ', new Date(2026, 2, 1));
    expect(title.startsWith('The Misty Vale - recap (')).toBe(true);
    expect(title).toContain('2026');
    expect(sessionRecapNoteTitle('', new Date(2026, 2, 1)).startsWith('Session - recap (')).toBe(true);
    expect(sessionRecapNoteTitle('x'.repeat(400)).length).toBeLessThanOrEqual(200);
  });

  it('writes a note for the whole party, in the recap category', async () => {
    mocks.single.mockResolvedValue({ data: { id: 'note-1' }, error: null });

    const saved = await saveSessionRecapNote('party-1', 'The Misty Vale', '  The party crossed the vale.  ');

    expect(mocks.from).toHaveBeenCalledWith('notes');
    const [rows] = mocks.insert.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(rows).toEqual([{ title: saved.title, content: 'The party crossed the vale.', category: SESSION_RECAP_CATEGORY, party_id: 'party-1' }]);
    expect(saved.id).toBe('note-1');
  });

  it('refuses an empty recap and passes on why a save failed', async () => {
    await expect(saveSessionRecapNote('party-1', 'The Misty Vale', '   ')).rejects.toThrow('no recap to save');
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });
    await expect(saveSessionRecapNote('party-1', 'The Misty Vale', 'Text')).rejects.toThrow('Permission denied');
  });
});
