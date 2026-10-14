import { authenticatedApiFetch } from '../supabase';

export interface AiSettings {
  /** False when the server has no encryption secret, so it cannot store keys yet. */
  storageAvailable: boolean;
  hasKey: boolean;
  /** The end of the stored key, such as "…a1b2". The key itself never reaches the browser. */
  keyHint: string | null;
  model: string;
  defaultModel: string;
  suggestedModels: string[];
  usageThisMonth: { calls: number; promptTokens: number; completionTokens: number; costUsd: number | null };
  /** Optional monthly limits the person set for themselves. `reached` is true when one has been hit. */
  limits: { monthlyCostCapUsd: number | null; monthlyTokenCap: number | null; reached: boolean };
}

export interface AiAnswer {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}

/** A rule action the narrator proposed, already checked by the server. The player decides whether to use it. */
export type NarratorAction =
  | { type: 'check'; checkType: 'skill' | 'attribute'; name: string; modifier: 'normal' | 'boon' | 'bane'; label: string }
  | { type: 'fortune'; question: string; category: string; label: string }
  | { type: 'rest'; rest: 'round' | 'stretch' | 'shift'; label: string }
  | { type: 'search'; context: string; label: string }
  | { type: 'scavenge'; context: string; label: string }
  | { type: 'npc'; name: string; template: 'minion' | 'boss'; roles: Array<'melee' | 'ranged' | 'sneaky' | 'magic'>; notes: string; label: string }
  | { type: 'reveal'; title: string; description: string; label: string }
  | { type: 'scene'; location: string; description: string; situation: string; threads: string[]; label: string };

export interface NarratorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: NarratorAction[];
  createdAt?: string;
  /** What this reply used, when known. */
  tokens?: number | null;
  costUsd?: number | null;
}

/** What the narrator also reads from the campaign. It is the same record an AI assistant over MCP reads and writes. */
export interface NarratorCampaignContext {
  checkpoint: { summary: string; location: string; createdAt: string } | null;
  openThreads: string[];
  sessions: Array<{ title: string; summary: string; endedAt: string | null }>;
}

export type NarrationLanguage = 'en' | 'et';

export const NARRATION_LANGUAGE_OPTIONS: ReadonlyArray<{ value: NarrationLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'et', label: 'Eesti' },
];

export interface NarratorConversation {
  turns: NarratorMessage[];
  /** The running summary of everything older than the recent turns. */
  summary: string;
  /** The language the campaign is narrated in. */
  language: NarrationLanguage;
  campaign: NarratorCampaignContext | null;
}

export interface NarratorAnswer extends AiAnswer {
  id: string;
  actions: NarratorAction[];
}

export class AiApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: string } };
  if (!response.ok) throw new AiApiError(payload.error?.message || response.statusText || 'Request failed', payload.error?.code);
  return payload;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchAiSettings = () => send<AiSettings>('/account/ai');
export const saveAiSettings = (input: { apiKey?: string; model?: string; monthlyCostCapUsd?: number | null; monthlyTokenCap?: number | null }) => send<AiSettings>('/account/ai', json('PUT', input));
export const removeAiKey = () => send<AiSettings>('/account/ai', { method: 'DELETE' });

/** Rewrites the session recap draft as readable prose. The GM edits the result before using it. */
export const polishRecap = (partyId: string, draft: string) => send<AiAnswer>('/ai/recap', json('POST', { partyId, draft }));
export const generateStory = (prompt: string, partyId?: string) => send<AiAnswer>('/ai/story', json('POST', { prompt, partyId }));
export const fetchNarratorConversation = (partyId: string) => send<NarratorConversation>(`/ai/solo-narrator?partyId=${encodeURIComponent(partyId)}`);
export const saveNarratorSummary = (partyId: string, summary: string) => send<{ summary: string }>('/ai/solo-narrator', json('PUT', { partyId, summary }));
/** Changes the language the campaign is narrated in, for the built-in narrator and for assistants over MCP. */
export const setNarrationLanguage = (partyId: string, language: NarrationLanguage) => send<{ language: NarrationLanguage }>('/ai/solo-narrator/language', json('PUT', { partyId, language }));
export const resetNarrator = (partyId: string) => send<NarratorConversation>(`/ai/solo-narrator?partyId=${encodeURIComponent(partyId)}`, { method: 'DELETE' });

/** Reads server-sent events from a response body. Exported for tests. */
export async function readEventStream(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (block: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) return;
    try { onEvent(event, JSON.parse(data.join('\n'))); } catch { /* a damaged event is skipped */ }
  };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      flush(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) flush(buffer);
}

/** One turn with the narrator. `onDelta` receives the reply as it is written; the promise resolves with the finished turn. */
export async function streamSoloNarrator(
  partyId: string,
  message: string,
  { onDelta, signal }: { onDelta: (text: string) => void; signal?: AbortSignal },
): Promise<NarratorAnswer> {
  const response = await authenticatedApiFetch('/ai/solo-narrator/stream', { ...json('POST', { partyId, message }), signal });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    throw new AiApiError(payload.error?.message || response.statusText || 'Request failed', payload.error?.code);
  }
  let finished: NarratorAnswer | null = null;
  let failure: AiApiError | null = null;
  await readEventStream(response.body, (event, data) => {
    if (event === 'delta') onDelta(String((data as { text?: string }).text ?? ''));
    else if (event === 'done') finished = data as NarratorAnswer;
    else if (event === 'error') failure = new AiApiError(String((data as { message?: string }).message || 'The narrator stopped.'), (data as { code?: string }).code);
  });
  if (failure) throw failure;
  if (!finished) throw new AiApiError('The narrator stopped before finishing. Try again.');
  return finished;
}

/** The older versions of the Story Helper kept the key in this browser; it can be moved to the server once. */
export const LEGACY_KEY_STORAGE = 'openrouter_api_key';
