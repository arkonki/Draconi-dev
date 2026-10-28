import { describe, expect, it } from 'vitest';
import { findPokeTarget } from './pokeTarget';
import type { Character } from '../types/character';
import type { CampaignMembership } from './api/parties';

const members = [
  { id: 'c1', name: 'Brynja', user_id: 'u1' },
  { id: 'c2', name: 'Bryn the Bold', user_id: 'u2' },
] as unknown as Character[];
const campaign = [
  { id: 'm1', party_id: 'p', user_id: 'gm', role: 'owner', users: { id: 'gm', username: 'dungeonmaster', first_name: 'Ann', last_name: 'Lee' } },
] as CampaignMembership[];

describe('poke target', () => {
  it('accepts the @ the hint shows, and prefers an exact name', () => {
    expect(findPokeTarget('@Brynja', members, campaign)).toEqual({ userId: 'u1', name: 'Brynja' });
    expect(findPokeTarget('bryn', members, campaign)?.userId).toBe('u1');
    expect(findPokeTarget('Bold', members, campaign)?.userId).toBe('u2');
  });

  it('can poke a GM without a character by username or full name', () => {
    expect(findPokeTarget('@dungeonmaster', members, campaign)?.userId).toBe('gm');
    expect(findPokeTarget('Ann Lee', members, campaign)?.userId).toBe('gm');
  });

  it('finds nobody for an empty or unknown name', () => {
    expect(findPokeTarget('@', members, campaign)).toBeNull();
    expect(findPokeTarget('Zed', members, campaign)).toBeNull();
  });
});
