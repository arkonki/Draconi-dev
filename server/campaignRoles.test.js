// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { assertCanCreateCampaign, loadCampaignAccess, maxOwnedCampaigns } from './campaignRoles.js';

function clientReturning(campaign) {
  return { query: vi.fn(async () => ({ rows: campaign ? [campaign] : [] })) };
}

describe('campaign-scoped roles', () => {
  it('does not grant campaign GM access from the account-wide dm role', async () => {
    const access = await loadCampaignAccess(
      clientReturning({ id: 'campaign-1', created_by: 'owner-1', campaign_role: null }),
      { id: 'dm-1', role: 'dm' },
      'campaign-1',
    );

    expect(access).toMatchObject({ role: null, canRead: false, canWrite: false, isGm: false });
  });

  it('grants GM access from the membership role even without a character', async () => {
    const access = await loadCampaignAccess(
      clientReturning({ id: 'campaign-1', created_by: 'owner-1', campaign_role: 'gm' }),
      { id: 'gm-1', role: 'player' },
      'campaign-1',
    );

    expect(access).toMatchObject({ role: 'gm', canRead: true, canWrite: true, isGm: true });
  });

  it('keeps observers read-only', async () => {
    const access = await loadCampaignAccess(
      clientReturning({ id: 'campaign-1', created_by: 'owner-1', campaign_role: 'observer' }),
      { id: 'observer-1', role: 'player' },
      'campaign-1',
    );

    expect(access).toMatchObject({ role: 'observer', canRead: true, canWrite: false, isGm: false });
  });
});

describe('creating campaigns', () => {
  const clientOwning = (owned) => ({ query: vi.fn().mockResolvedValue({ rows: [{ owned }] }) });

  it('lets any user create a campaign while under the limit', async () => {
    await expect(assertCanCreateCampaign(clientOwning(0), { id: 'u', role: 'player' }, 3)).resolves.toBeUndefined();
    await expect(assertCanCreateCampaign(clientOwning(2), { id: 'u', role: 'dm' }, 3)).resolves.toBeUndefined();
  });

  it('refuses once the limit is reached, with a message that says what to do', async () => {
    await expect(assertCanCreateCampaign(clientOwning(3), { id: 'u', role: 'player' }, 3)).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_LIMIT', message: expect.stringContaining('up to 3') });
  });

  it('does not limit administrators, and does not even count for them', async () => {
    const client = clientOwning(500);
    await expect(assertCanCreateCampaign(client, { id: 'a', role: 'admin' }, 3)).resolves.toBeUndefined();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('reads the limit from the environment, falling back to ten', () => {
    expect(maxOwnedCampaigns({})).toBe(10);
    expect(maxOwnedCampaigns({ MAX_OWNED_CAMPAIGNS: '4' })).toBe(4);
    expect(maxOwnedCampaigns({ MAX_OWNED_CAMPAIGNS: 'many' })).toBe(10);
    expect(maxOwnedCampaigns({ MAX_OWNED_CAMPAIGNS: '0' })).toBe(10);
  });
});
