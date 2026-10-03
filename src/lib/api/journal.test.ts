import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCharacterJournalEntry } from './journal';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: {
  from: () => {
    const chain = {
      insert: (payload: unknown) => { mocks.insert(payload); return chain; },
      update: (payload: unknown) => { mocks.update(payload); return chain; },
      eq: (key: string, value: unknown) => { mocks.eq(key, value); return chain; },
      select: () => chain,
      single: mocks.single,
    };
    return chain;
  },
} }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.single.mockResolvedValue({ data: { id: 'note', user_id: 'original-author' }, error: null });
});
describe('character journal saves', () => {
  it('creates a character entry with the current author using an explicit insert', async () => {
    await saveCharacterJournalEntry({ title: ' New entry ', content: 'Text' }, 'character', 'author');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ title: 'New entry', character_id: 'character', user_id: 'author' }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates by entry ID without rewriting author or creation date', async () => {
    await saveCharacterJournalEntry({ id: 'note', title: 'Revision', content: 'Text' }, 'character', 'admin-editor');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revision', character_id: 'character' }));
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('user_id');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('created_at');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'note');
  });
  it('propagates failed saves so the editor can retain unsaved changes', async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error('Permission denied') });
    await expect(saveCharacterJournalEntry({ title: 'Entry', content: '' }, 'character', 'author')).rejects.toThrow('Permission denied');
  });
});
