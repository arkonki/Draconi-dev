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
  usageThisMonth: { calls: number; promptTokens: number; completionTokens: number; cachedTokens: number; costUsd: number | null };
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
  | { type: 'push'; label: string }
  | { type: 'consequence'; label: string }
  | { type: 'inspiration'; context: string; label: string }
  | { type: 'damage'; context: string; label: string }
  | { type: 'threat'; amount: 1 | 2; label: string }
  | { type: 'leave'; label: string }
  | { type: 'dying'; label: string }
  | { type: 'scene'; location: string; description: string; situation: string; threads: string[]; label: string };

/** What the narrator is allowed to do on its own: only suggest, act after the player approves, or act at once. */
export type NarratorMode = 'suggest' | 'ask' | 'trust';

/** One thing the narrator did with the game's tools, or is waiting to do until the player approves it. */
export interface NarratorToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** A short English description, used when a name has no translated wording. */
  label: string;
  tier: 'auto' | 'approve' | 'unknown';
  status: 'pending' | 'done' | 'failed' | 'declined' | 'expired';
  summary: string | null;
  error: string | null;
}

export interface NarratorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: NarratorAction[];
  toolCalls?: NarratorToolCall[];
  /** The narrator's last step used tools and all of them are decided, but the reply has not been carried on. */
  canResume?: boolean;
  createdAt?: string;
  /** What this reply used, when known. */
  tokens?: number | null;
  cachedTokens?: number | null;
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

/** The game's own words in the story's language. `custom` is what this campaign saved; null means the built-in list is used. */
export interface NarratorGlossary {
  custom: string | null;
  builtIn: string;
  terms: number;
}

export interface NarratorConversation {
  turns: NarratorMessage[];
  /** The running summary of everything older than the recent turns. */
  summary: string;
  /** The language the campaign is narrated in. */
  language: NarrationLanguage;
  /** How much the narrator may do on its own. */
  mode?: NarratorMode;
  glossary: NarratorGlossary;
  campaign: NarratorCampaignContext | null;
}

export interface NarratorAnswer extends AiAnswer {
  id: string;
  actions: NarratorAction[];
  toolCalls?: NarratorToolCall[];
  /** How many calls are waiting for the player. */
  awaiting?: number;
  /** The model could not use tools, so this reply only suggests. */
  toolsUnavailable?: boolean;
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
/** Item fields the AI filled in for a custom loot item. Only a draft: the GM reviews it in the loot form. */
export interface EnhancedLootItem {
  name: string;
  category: string;
  cost: string;
  weight: number;
  effect: string;
  damage: string;
  grip: string;
  range: string;
  durability: string;
  armor_rating: string;
  features: string[];
}

export const enhanceLootItem = (partyId: string, item: Record<string, unknown>, instructions: string) =>
  send<{ item: EnhancedLootItem; usage: AiAnswer['usage'] }>('/ai/loot-item', json('POST', { partyId, item, instructions }));
/** A mission the narrator proposes from the player's idea. Only a draft: the player edits it before it is created. */
export interface MissionProposal {
  title: string;
  objective: string;
  opening: { title: string; description: string };
  foreseen: Array<{ title: string; description: string }>;
  unknownWaypoints: number;
  threat: { description: string; recurring: boolean; triggerEffect: string };
}

export const proposeSoloMission = (partyId: string, idea: string) => send<{ mission: MissionProposal; usage: AiAnswer['usage'] }>('/ai/solo-mission', json('POST', { partyId, idea }));
export const generateStory = (prompt: string, partyId?: string) => send<AiAnswer>('/ai/story', json('POST', { prompt, partyId }));
export const fetchNarratorConversation = (partyId: string) => send<NarratorConversation>(`/ai/solo-narrator?partyId=${encodeURIComponent(partyId)}`);
export const saveNarratorSummary = (partyId: string, summary: string) => send<{ summary: string }>('/ai/solo-narrator', json('PUT', { partyId, summary }));
/** Changes the language the campaign is narrated in, for the built-in narrator and for assistants over MCP. */
export const setNarrationLanguage = (partyId: string, language: NarrationLanguage) => send<{ language: NarrationLanguage }>('/ai/solo-narrator/language', json('PUT', { partyId, language }));
/** Saves this campaign's own glossary of game terms ("English = local" per line), or null to use the built-in one. */
export const setNarrationGlossary = (partyId: string, glossary: string | null) => send<{ glossary: NarratorGlossary }>('/ai/solo-narrator/glossary', json('PUT', { partyId, glossary }));
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

interface NarratorStreamHandlers {
  onDelta: (text: string) => void;
  /** Called each time a tool call is made, finishes or fails. */
  onTool?: (call: Pick<NarratorToolCall, 'id' | 'name' | 'label' | 'status' | 'summary' | 'error'>) => void;
  signal?: AbortSignal;
}

async function streamNarrator(path: string, body: unknown, { onDelta, onTool, signal }: NarratorStreamHandlers): Promise<NarratorAnswer> {
  const response = await authenticatedApiFetch(path, { ...json('POST', body), signal });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    throw new AiApiError(payload.error?.message || response.statusText || 'Request failed', payload.error?.code);
  }
  let finished: NarratorAnswer | null = null;
  let failure: AiApiError | null = null;
  await readEventStream(response.body, (event, data) => {
    if (event === 'delta') onDelta(String((data as { text?: string }).text ?? ''));
    else if (event === 'tool') onTool?.(data as Parameters<NonNullable<NarratorStreamHandlers['onTool']>>[0]);
    else if (event === 'done') finished = data as NarratorAnswer;
    else if (event === 'error') failure = new AiApiError(String((data as { message?: string }).message || 'The narrator stopped.'), (data as { code?: string }).code);
  });
  if (failure) throw failure;
  if (!finished) throw new AiApiError('The narrator stopped before finishing. Try again.');
  return finished;
}

/** One turn with the narrator. `onDelta` receives the reply as it is written; the promise resolves with the finished turn. */
export const streamSoloNarrator = (partyId: string, message: string, handlers: NarratorStreamHandlers) => streamNarrator('/ai/solo-narrator/stream', { partyId, message }, handlers);

/** Carries a reply on after the player has decided what it was waiting for. The new text is added to the same reply. */
export const resumeSoloNarrator = (partyId: string, turnId: string, handlers: NarratorStreamHandlers) => streamNarrator('/ai/solo-narrator/resume', { partyId, turnId }, handlers);

/** Approves or declines one thing the narrator wants to do. An approved one is carried out now. */
export const decideNarratorCall = (partyId: string, turnId: string, callId: string, decision: 'approve' | 'decline') => send<{ turn: NarratorMessage; awaiting: number }>('/ai/solo-narrator/decide', json('POST', { partyId, turnId, callId, decision }));

/** Chooses how much the narrator may do on its own in this campaign. */
export const setNarratorMode = (partyId: string, mode: NarratorMode) => send<{ mode: NarratorMode }>('/ai/solo-narrator/mode', json('PUT', { partyId, mode }));

/** The older versions of the Story Helper kept the key in this browser; it can be moved to the server once. */
export const LEGACY_KEY_STORAGE = 'openrouter_api_key';
