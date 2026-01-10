import { supabase } from '../supabase';

export interface Message {
  id: string;
  party_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export async function getPartyMessages(partyId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  return data as Message[];
}

export async function sendMessage(partyId: string, userId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ party_id: partyId, user_id: userId, content }])
    .select()
    .single();

  if (error) throw error;
  return data as Message;
}

// --- NEW DELETE FUNCTION ---
export async function deleteMessage(messageId: string) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) throw error;
}