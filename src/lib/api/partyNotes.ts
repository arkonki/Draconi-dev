import { supabase } from '../supabase';

export const SESSION_RECAP_CATEGORY = 'Session recaps';

/** The title a session's recap gets as a party note: the session's own title and the day it was saved. */
export function sessionRecapNoteTitle(sessionTitle: string, when: Date = new Date()): string {
  const day = when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `${sessionTitle.trim() || 'Session'} - recap (${day})`.slice(0, 200);
}

/**
 * Saves a session recap as a note the whole party can read, in the "Session recaps" category of the party's notes.
 * The note belongs to whoever saves it, like any other party note.
 */
export async function saveSessionRecapNote(partyId: string, sessionTitle: string, recap: string): Promise<{ id: string; title: string }> {
  const content = recap.trim();
  if (!content) throw new Error('There is no recap to save yet.');
  const title = sessionRecapNoteTitle(sessionTitle);
  const { data, error } = await supabase
    .from('notes')
    .insert([{ title, content, category: SESSION_RECAP_CATEGORY, party_id: partyId }])
    .select()
    .single();
  if (error) throw new Error(error.message || 'Could not save the recap as a party note.');
  return { id: String((data as { id: string }).id), title };
}
