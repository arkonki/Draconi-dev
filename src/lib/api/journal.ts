import { supabase } from '../supabase';

interface SavedCharacterJournalEntry {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

export async function saveCharacterJournalEntry(
  entry: { id?: string; title: string; content: string },
  characterId: string,
  userId: string,
) {
  const payload = { title: entry.title.trim(), content: entry.content, character_id: characterId, updated_at: new Date().toISOString() };
  const query = entry.id
    ? supabase.from('notes').update(payload).eq('id', entry.id)
    : supabase.from('notes').insert({ ...payload, user_id: userId });
  const { data, error } = await query.select().single();
  if (error) throw error;
  if (!data) throw new Error('The journal entry could not be saved.');
  return data as unknown as SavedCharacterJournalEntry;
}
