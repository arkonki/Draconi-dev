import { useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/useAuth';
import { fetchPartyById, type CampaignRole } from '../lib/api/parties';
import { queryKeys } from '../lib/queryKeys';

export type RoleBadgeKind = 'admin' | 'gm' | 'player' | 'observer' | 'member';

export interface RoleBadge {
  kind: RoleBadgeKind;
  label: string;
  /** The campaign the label is about, when the person is inside one. */
  campaignName: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_LABEL: Record<CampaignRole, { kind: RoleBadgeKind; label: string }> = {
  owner: { kind: 'gm', label: 'GM' },
  gm: { kind: 'gm', label: 'GM' },
  player: { kind: 'player', label: 'Player' },
  observer: { kind: 'observer', label: 'Observer' },
};

/** What to call someone given the campaign they are looking at, or nothing special when they are not in one. Pure, so it is tested. */
export function roleBadge(options: { isAdmin: boolean; campaignRole: CampaignRole | null | undefined; campaignName?: string | null }): RoleBadge {
  const campaign = options.campaignRole ? ROLE_LABEL[options.campaignRole] : null;
  if (campaign) {
    return {
      kind: options.isAdmin ? 'admin' : campaign.kind,
      label: options.isAdmin ? `Admin \u00b7 ${campaign.label}` : campaign.label,
      campaignName: options.campaignName ?? null,
    };
  }
  return options.isAdmin
    ? { kind: 'admin', label: 'Admin', campaignName: null }
    : { kind: 'member', label: 'Adventurer', campaignName: null };
}

/**
 * The role badge for the top bar. A person is a GM in the campaigns they run, a player in those they joined and
 * an observer where they only watch, so the badge follows the campaign page they are on.
 */
export function useCampaignRoleLabel(): RoleBadge {
  const { isAdmin } = useAuth();
  const match = useMatch('/party/:id');
  const partyId = match?.params.id && UUID.test(match.params.id) ? match.params.id : undefined;
  // The same query the campaign page itself runs, so this adds no request once that page has loaded.
  const { data: party } = useQuery({
    queryKey: queryKeys.party(partyId),
    queryFn: () => fetchPartyById(partyId),
    enabled: Boolean(partyId),
    staleTime: 30_000,
  });
  return roleBadge({ isAdmin: isAdmin(), campaignRole: party?.campaign_role, campaignName: party?.name });
}
