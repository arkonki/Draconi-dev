export const CAMPAIGN_ROLES = new Set(['owner', 'gm', 'player', 'observer']);

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
