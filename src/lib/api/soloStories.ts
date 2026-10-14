import { authenticatedApiFetch } from '../supabase';

/** A finished story: a Solo mission with how it ended, what it improved, and the narrator's telling of it if it was kept. */
export interface SoloStory {
  /** "mission:<id>" or "archive:<id>". */
  id: string;
  title: string;
  objective: string;
  outcome: 'success' | 'failure' | 'abandoned' | 'unfinished';
  startedAt: string | null;
  endedAt: string | null;
  summary: string;
  narrative: string;
  improvements: Array<{ skill: string; from: number; to: number }>;
  newAbilities: number;
  archiveId: string | null;
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || response.statusText || 'Request failed');
  return payload;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const fetchSoloStories = async (partyId: string) => (await send<{ stories: SoloStory[] }>(`/ai/solo-stories?partyId=${encodeURIComponent(partyId)}`)).stories;

/** Puts the story that is being told away, with the narrator's telling of it. */
export const archiveSoloStory = (input: { partyId: string; missionId?: string | null; title: string; outcome: SoloStory['outcome']; summary: string }) =>
  send<{ id: string; hasNarrative: boolean }>('/ai/solo-stories', post(input));

/** Makes a finished story the narrator's story so far, so the next one continues from it. */
export const continueFromStory = (partyId: string, storyId: string) => send<{ story: { id: string; title: string }; summary: string }>('/ai/solo-stories/continue', post({ partyId, storyId }));
