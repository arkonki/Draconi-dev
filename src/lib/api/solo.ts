import { authenticatedApiFetch } from '../supabase';

export interface SoloCampaignStatus {
  enabled: boolean;
  playerCharacterId: string | null;
  soloHeroicAbilityId?: string | null;
}

interface SoloStateEnvelope {
  data?: {
    solo?: SoloCampaignStatus;
  };
  error?: { message?: string };
}

export async function fetchSoloCampaignStatus(partyId: string): Promise<SoloCampaignStatus | null> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/solo`, {
    headers: { accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as SoloStateEnvelope;
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not load solo campaign status.');
  }
  return payload.data?.solo || null;
}
