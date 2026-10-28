import { supabase } from '../supabase';

/** What a message is. Everything but plain text is checked by the server, which also writes its text. */
export type MessageKind = 'text' | 'poke' | 'note' | 'compendium' | 'roll';

export interface RollMessagePayload {
  label: string;
  total: number | null;
  /** A result in words, such as "Dragon", when the roll has no number. */
  outcome?: string;
  dice?: string;
  critical?: boolean;
  success?: boolean | null;
  manual?: boolean;
}

export type SpecialMessage =
  | { kind: 'poke'; payload: { targetUserId: string } }
  | { kind: 'note'; payload: { noteId: string } }
  | { kind: 'compendium'; payload: { entryId: string } }
  | { kind: 'roll'; payload: RollMessagePayload };

export interface Message {
  id: string;
  party_id: string;
  user_id: string;
  content: string;
  created_at: string;
  kind?: MessageKind;
  payload?: Record<string, unknown>;
}

export const MESSAGE_PAGE_SIZE = 50;

/** The longest chat message the server accepts. */
export const MAX_MESSAGE_CHARS = 4000;

export function appendMessageIfMissing(messages: Message[], incoming: Message) {
  return messages.some((message) => message.id === incoming.id)
    ? messages
    : [...messages, incoming];
}

export function orderNewestMessagePageChronologically(messages: Message[]) {
  return [...messages].reverse();
}

export async function getPartyMessages(partyId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);

  if (error) throw error;
  return orderNewestMessagePageChronologically((data || []) as Message[]);
}

/** The page of messages just before `before` (a message's created_at), oldest first. */
export async function getOlderPartyMessages(partyId: string, before: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('party_id', partyId)
    .lt('created_at', before)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);

  if (error) throw error;
  return orderNewestMessagePageChronologically((data || []) as Message[]);
}

/** Older messages put in front of the ones already shown, without repeating any. */
export function prependOlderMessages(messages: Message[], older: Message[]) {
  const known = new Set(messages.map((message) => message.id));
  return [...older.filter((message) => !known.has(message.id)), ...messages];
}

/** Sends a message. For a poke or a share, pass `special`; the server checks it and writes the text itself. */
export async function sendMessage(partyId: string, userId: string, content: string, special?: SpecialMessage) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ party_id: partyId, user_id: userId, content: special ? '-' : content, ...(special ?? { kind: 'text' }) }])
    .select()
    .single();

  if (error) throw error;

  try {
    await supabase.functions.invoke('send-chat-push', {
      body: { messageId: (data as Message).id },
    });
  } catch (pushError) {
    console.warn('Chat push notification dispatch failed:', pushError);
  }

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
