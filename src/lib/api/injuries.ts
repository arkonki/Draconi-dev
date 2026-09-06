import { authenticatedApiFetch } from '../supabase';
import type { SoloActor, SoloCharacterInjury, SoloRecordedRoll, SoloWriteResult } from './solo';

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
}

export interface CharacterInjuryState {
  campaignRevision: number;
  character: SoloActor;
  canManage: boolean;
  shiftCount: number;
  activeInjuries: SoloCharacterInjury[];
  injuryHistory: SoloCharacterInjury[];
}

export interface CharacterInjuryWriteResult extends SoloWriteResult {
  state_excerpt: {
    injury?: SoloCharacterInjury;
    roll?: SoloRecordedRoll | null;
    shiftCount?: number;
    injuryRecovery?: SoloCharacterInjury[];
  };
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message || fallback);
  }
  return payload.data;
}

function writeHeaders(revision: number) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'if-match': `"${revision}"`,
    'idempotency-key': crypto.randomUUID(),
  };
}

function basePath(campaignId: string, characterId: string) {
  return `/v1/campaigns/${campaignId}/characters/${characterId}/injuries`;
}

export async function fetchCharacterInjuries(campaignId: string, characterId: string) {
  const response = await authenticatedApiFetch(basePath(campaignId, characterId), {
    headers: { accept: 'application/json' },
  });
  return parseResponse<CharacterInjuryState>(response, 'Could not load severe injuries.');
}

export async function rollCharacterSevereInjury(
  campaignId: string,
  characterId: string,
  revision: number,
  context?: string,
) {
  const response = await authenticatedApiFetch(`${basePath(campaignId, characterId)}/roll`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      context: context?.trim() || undefined,
      reason: 'The player explicitly chose to roll and record a severe injury.',
    }),
  });
  return parseResponse<CharacterInjuryWriteResult>(response, 'Could not roll the severe injury.');
}

export async function resolveCharacterInjuryAction(
  campaignId: string,
  characterId: string,
  injuryId: string,
  revision: number,
  action: 'medical_care' | 'mark_healed',
  context?: string,
) {
  const response = await authenticatedApiFetch(`${basePath(campaignId, characterId)}/${injuryId}/actions`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      action,
      confirmed_by_user: true,
      context: context?.trim() || undefined,
      reason: action === 'medical_care'
        ? 'The player explicitly chose to attempt medical care for this injury.'
        : 'The player explicitly confirmed that this injury should be marked healed.',
    }),
  });
  return parseResponse<CharacterInjuryWriteResult>(response, 'Could not update the severe injury.');
}

export async function advanceCharacterInjuryRecovery(
  campaignId: string,
  characterId: string,
  revision: number,
) {
  const response = await authenticatedApiFetch(`${basePath(campaignId, characterId)}/recovery`, {
    method: 'POST',
    headers: writeHeaders(revision),
    body: JSON.stringify({
      elapsed_shifts: 1,
      confirmed_by_user: true,
      reason: 'The player completed a shift rest and confirmed six hours of injury recovery.',
    }),
  });
  return parseResponse<CharacterInjuryWriteResult>(response, 'Could not advance severe-injury recovery.');
}
