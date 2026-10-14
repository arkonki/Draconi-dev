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
}

export interface AiAnswer {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}

export interface NarratorTurn {
  role: 'user' | 'assistant';
  content: string;
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
export const saveAiSettings = (input: { apiKey?: string; model?: string }) => send<AiSettings>('/account/ai', json('PUT', input));
export const removeAiKey = () => send<AiSettings>('/account/ai', { method: 'DELETE' });

export const generateStory = (prompt: string, partyId?: string) => send<AiAnswer>('/ai/story', json('POST', { prompt, partyId }));
export const askSoloNarrator = (partyId: string, message: string, history: NarratorTurn[]) =>
  send<AiAnswer>('/ai/solo-narrator', json('POST', { partyId, message, history }));

/** The older versions of the Story Helper kept the key in this browser; it can be moved to the server once. */
export const LEGACY_KEY_STORAGE = 'openrouter_api_key';
