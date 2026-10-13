import { HttpError } from './http.js';

export const CAMPAIGN_ROLES = new Set(['owner', 'gm', 'player', 'observer']);

export const DEFAULT_MAX_OWNED_CAMPAIGNS = 10;

/** How many campaigns one person may create. Anyone can run a campaign, so this keeps a single account tidy. */
export function maxOwnedCampaigns(env = process.env) {
  const configured = Number(env.MAX_OWNED_CAMPAIGNS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 1000 ? configured : DEFAULT_MAX_OWNED_CAMPAIGNS;
}

/** Refuses to create another campaign once the person already owns the maximum. Administrators are not limited. */
export async function assertCanCreateCampaign(client, user, limit = maxOwnedCampaigns()) {
  if (user?.role === 'admin') return;
  const { rows } = await client.query('SELECT count(*)::int AS owned FROM parties WHERE created_by = $1', [user.id]);
  if (rows[0].owned >= limit) {
    throw new HttpError(409, `You can run up to ${limit} campaigns. Disband or hand over one before creating another.`, 'CAMPAIGN_LIMIT');
  }
}

export function isCampaignGmRole(role) {
  return role === 'owner' || role === 'gm';
}

export function canCampaignRoleWrite(role) {
  return role === 'owner' || role === 'gm' || role === 'player';
}

export async function loadCampaignAccess(client, user, campaignId) {
  const { rows } = await client.query(
    `SELECT p.*, cm.role AS campaign_role
     FROM parties p
     LEFT JOIN campaign_memberships cm
       ON cm.party_id = p.id AND cm.user_id = $2
     WHERE p.id = $1`,
    [campaignId, user.id],
  );
  const campaign = rows[0] || null;
  if (!campaign) return null;

  const isAdmin = user.role === 'admin';
  const role = campaign.created_by === user.id
    ? 'owner'
    : isAdmin
      ? 'gm'
      : campaign.campaign_role || null;

  return {
    campaign,
    role,
    canRead: Boolean(role),
    canWrite: isAdmin || canCampaignRoleWrite(role),
    isGm: isAdmin || isCampaignGmRole(role),
    isOwner: isAdmin || role === 'owner',
  };
}
