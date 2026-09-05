// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadCampaignAccess } from './campaignRoles.js';

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
