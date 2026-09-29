import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return { eq, from, select, single };
});

vi.mock('../supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import { fetchPartyById } from './parties';

describe('fetchPartyById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests and preserves character portraits for the party roster', async () => {
    const portraitUrl = 'https://draconi.ee/api/storage/public/images/portraits/hero.png';
    mocks.single.mockResolvedValue({
      data: {
        id: 'party-1',
        name: 'The Company',
        description: '',
        created_by: 'user-1',
        created_at: '2026-09-27T00:00:00.000Z',
        invite_code: 'JOIN-US',
        campaign_role: 'owner',
        campaign_memberships: [],
        members: [{
          characters: {
            id: 'character-1',
            user_id: 'user-1',
            name: 'Hero',
            portrait_url: portraitUrl,
            created_at: '2026-09-27T00:00:00.000Z',
            updated_at: '2026-09-27T00:00:00.000Z',
          },
        }],
      },
      error: null,
    });

    const party = await fetchPartyById('party-1');

    expect(mocks.from).toHaveBeenCalledWith('parties');
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('portrait_url'));
    expect(party?.members[0]?.portrait_url).toBe(portraitUrl);
  });
});
