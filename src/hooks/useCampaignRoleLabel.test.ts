import { describe, expect, it } from 'vitest';
import { roleBadge } from './useCampaignRoleLabel';

describe('roleBadge', () => {
  it('calls someone a GM in a campaign they own or run', () => {
    expect(roleBadge({ isAdmin: false, campaignRole: 'owner', campaignName: 'Doom Run' })).toEqual({ kind: 'gm', label: 'GM', campaignName: 'Doom Run' });
    expect(roleBadge({ isAdmin: false, campaignRole: 'gm' })).toMatchObject({ kind: 'gm', label: 'GM' });
  });

  it('calls the same person a player or an observer where that is their role', () => {
    expect(roleBadge({ isAdmin: false, campaignRole: 'player' })).toMatchObject({ kind: 'player', label: 'Player' });
    expect(roleBadge({ isAdmin: false, campaignRole: 'observer' })).toMatchObject({ kind: 'observer', label: 'Observer' });
  });

  it('shows nothing special outside a campaign', () => {
    expect(roleBadge({ isAdmin: false, campaignRole: null })).toEqual({ kind: 'member', label: 'Adventurer', campaignName: null });
    expect(roleBadge({ isAdmin: false, campaignRole: undefined })).toMatchObject({ label: 'Adventurer' });
  });

  it('keeps an administrator recognisable, with their campaign role beside it', () => {
    expect(roleBadge({ isAdmin: true, campaignRole: null })).toEqual({ kind: 'admin', label: 'Admin', campaignName: null });
    expect(roleBadge({ isAdmin: true, campaignRole: 'player', campaignName: 'Doom Run' })).toEqual({ kind: 'admin', label: 'Admin · Player', campaignName: 'Doom Run' });
  });
});
